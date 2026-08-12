import { createFileRoute } from "@tanstack/react-router";
import {
  parseHtmlToSections,
  extractTitle,
  guessBassNumber,
} from "@/lib/legalSourceParser";

/**
 * Crawler für offizielle Rechtsquellen (Fokus: BASS NRW).
 * Sammelt interne Links ausgehend von einer Start-URL und
 * bewertet jede erreichbare Seite mit dem gemeinsamen
 * Paragraphenparser.
 *
 * Sicherheitsregeln:
 *  - nur gleiche Domain wie die Start-URL
 *  - nur http(s)
 *  - keine mailto/tel/javascript
 *  - Anker & Query werden normalisiert (Dubletten)
 *  - harte Obergrenze: maxPages (default 50, max 500)
 *  - maximale Linktiefe (default 3, max 6)
 */

type CrawledPage = {
  url: string;
  title: string;
  bass_number: string | null;
  marker_count: number;
  section_count: number;
  char_count: number;
  parser_mode: "dom" | "regex" | "fallback";
  status: "candidate" | "empty" | "error";
  error?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const EXCLUDE_HINTS = [
  "/druck", "/print", "/share", "/login", "/logout", "/impressum",
  "/datenschutz", "/kontakt", "/suche", "/search", "/service",
  "/rss", "/feed",
];
const EXCLUDE_EXT = /\.(pdf|zip|docx?|xlsx?|pptx?|jpe?g|png|gif|svg|mp[34]|mov|avi)(\?|$)/i;

function normalizeUrl(raw: string, base: string, allowedHost: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.hostname.toLowerCase() !== allowedHost) return null;
    u.hash = "";
    // Sortiere Query, um triviale Dubletten zu vermeiden
    const params = Array.from(u.searchParams.entries()).sort();
    u.search = "";
    for (const [k, v] of params) u.searchParams.append(k, v);
    // Trailing slash am Pfad harmonisieren, aber "/" belassen
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    const s = u.toString();
    if (EXCLUDE_EXT.test(s)) return null;
    const lower = s.toLowerCase();
    for (const hint of EXCLUDE_HINTS) if (lower.includes(hint)) return null;
    return s;
  } catch {
    return null;
  }
}

function extractLinks(html: string, base: string, allowedHost: string): string[] {
  const out = new Set<string>();
  const re = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[2] ?? m[3] ?? "";
    if (!raw) continue;
    if (/^\s*(mailto:|tel:|javascript:)/i.test(raw)) continue;
    const norm = normalizeUrl(raw, base, allowedHost);
    if (norm) out.add(norm);
  }
  return Array.from(out);
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct && !ct.includes("html") && !ct.includes("xml")) {
      throw new Error(`Kein HTML (${ct})`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/crawl-legal-source")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          start_url?: string;
          max_pages?: number;
          max_depth?: number;
        } = {};
        try {
          body = (await request.json()) as any;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const startUrl = (body.start_url ?? "").trim();
        if (!startUrl || !/^https?:\/\//i.test(startUrl)) {
          return new Response(
            JSON.stringify({ error: "Bitte eine vollständige http(s)-Start-URL angeben." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        const maxPages = Math.max(1, Math.min(Number(body.max_pages ?? 50) || 50, 500));
        const maxDepth = Math.max(1, Math.min(Number(body.max_depth ?? 3) || 3, 6));

        let allowedHost = "";
        try {
          allowedHost = new URL(startUrl).hostname.toLowerCase();
        } catch {
          return new Response(
            JSON.stringify({ error: "Ungültige Start-URL." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const startedAt = Date.now();
        const visited = new Set<string>();
        const queue: Array<{ url: string; depth: number }> = [
          { url: normalizeUrl(startUrl, startUrl, allowedHost) || startUrl, depth: 0 },
        ];
        const pages: CrawledPage[] = [];
        let fetched = 0;
        let errors = 0;

        while (queue.length && fetched < maxPages) {
          const { url, depth } = queue.shift()!;
          if (visited.has(url)) continue;
          visited.add(url);
          fetched++;

          let html = "";
          try {
            html = await fetchHtml(url, 15000);
          } catch (err) {
            errors++;
            pages.push({
              url,
              title: "",
              bass_number: null,
              marker_count: 0,
              section_count: 0,
              char_count: 0,
              parser_mode: "fallback",
              status: "error",
              error: (err as Error).message || "Abruf fehlgeschlagen",
            });
            continue;
          }

          const title = extractTitle(html);
          const bass = guessBassNumber(url, title);

          // Links weiterverfolgen
          if (depth < maxDepth) {
            const links = extractLinks(html, url, allowedHost);
            for (const l of links) {
              if (!visited.has(l) && queue.length + fetched < maxPages * 3) {
                queue.push({ url: l, depth: depth + 1 });
              }
            }
          }

          // Abschnitte auf dieser Seite bewerten
          try {
            const { sections, mode, markerCount, charCount } = await parseHtmlToSections(html, url);
            const hasContent = sections.length > 0 && !(sections.length === 1 && sections[0].section_number === "Dokument" && markerCount === 0);
            pages.push({
              url,
              title,
              bass_number: bass,
              marker_count: markerCount,
              section_count: sections.length,
              char_count: charCount,
              parser_mode: mode,
              status: hasContent ? "candidate" : "empty",
            });
          } catch (err) {
            errors++;
            pages.push({
              url,
              title,
              bass_number: bass,
              marker_count: 0,
              section_count: 0,
              char_count: 0,
              parser_mode: "fallback",
              status: "error",
              error: (err as Error).message || "Parser-Fehler",
            });
          }
        }

        // Kandidaten zuerst, dann alphabetisch
        pages.sort((a, b) => {
          if (a.status !== b.status) return a.status === "candidate" ? -1 : 1;
          return (b.section_count - a.section_count) || a.url.localeCompare(b.url);
        });

        const responseBody = {
          start_url: startUrl,
          allowed_host: allowedHost,
          fetched,
          max_pages: maxPages,
          max_depth: maxDepth,
          candidates: pages.filter((p) => p.status === "candidate").length,
          errors,
          duration_ms: Date.now() - startedAt,
          pages,
          warning:
            fetched >= maxPages
              ? `Obergrenze von ${maxPages} Seiten erreicht. Für einen vollständigen Import bitte höheres Limit wählen oder gezielt Unterbereiche crawlen.`
              : null,
        };
        return new Response(JSON.stringify(responseBody), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
