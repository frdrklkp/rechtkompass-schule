/**
 * Eigenständige Entdeckung ALLER BASS-Dokument-URLs.
 *
 * Der app-eigene Crawler (/api/legal-source-crawl) hat serverseitige Caps
 * (max_pages<=60, max_depth<=4), die für die 5-stufige BASS-Navigation
 * (Inhalt -> Ebene2 Kapitel -> Ebene3 -> Ebene4 -> Ebene5 -> NNNN.htm) nicht
 * ausreichen (Tiefe 5 nötig). Deshalb hier eine eigenständige, unabhängige
 * Traversierung direkt gegen bass.schule.nrw (dieselbe Domain, kein
 * WAF-Schutz wie bei eur-lex - reiner fetch() reicht).
 */

const BASE = "https://bass.schule.nrw";
const seen = new Set<string>();
const docLinks = new Map<string, string>(); // url -> label

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (RechtKompass-Import)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.text();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Dieselbe Seite kommt auf bass.schule.nrw in mehreren Kodierungsvarianten
 * vor (Leerzeichen vs. "+", "/" vs. "%2F") - ohne echte Kanonisierung über
 * die URL-API hält "seen" dieselbe Seite für unterschiedliche URLs und
 * überspringt ganze Unterzweige beim zweiten (fälschlich "schon besucht")
 * Antreffen (Fund beim Testlauf: Dokumentzahl blieb trotz sichtbar mehr
 * traversierter Kapitel-Seiten unverändert bei 25). */
function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const canon = params.map(([k, v]) => `${k}=${v.trim().toLowerCase()}`).join("&");
    return `${url.origin}${url.pathname}?${canon}`;
  } catch {
    return u;
  }
}

function extractLinks(html: string): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = [];
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = decodeHtmlEntities(m[1]).split("#")[0];
    const text = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    out.push({ href, text });
  }
  return out;
}

let visitCount = 0;

async function crawlLevel(url: string, depth: number): Promise<void> {
  const key = normalizeUrl(url);
  if (seen.has(key) || depth > 5) return;
  seen.add(key);
  visitCount++;
  if (visitCount % 10 === 0) console.error(`  ... ${visitCount} Seiten besucht, zuletzt Tiefe ${depth}: ${decodeURIComponent(url).slice(0, 100)}`);
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (e) {
    console.log(`  [Fehler] ${url}: ${e instanceof Error ? e.message : e}`);
    return;
  }
  const links = extractLinks(html);
  if (depth <= 2) {
    console.error(`  [Tiefe ${depth}] ${decodeURIComponent(url).slice(0, 90)} -> ${links.filter(l => l.href.includes("/Inhalt/Ebene")).length} Unterseiten, ${links.filter(l => /\/\d+\.htm$/.test(l.href)).length} Dokumente`);
  }
  for (const { href, text } of links) {
    if (!href.startsWith(BASE) && !href.startsWith("/")) continue;
    const full = href.startsWith("/") ? BASE + href : href;
    if (!full.startsWith(BASE)) continue;

    if (/\/\d+\.htm$/.test(full)) {
      // Echtes Dokument.
      if (!docLinks.has(full)) docLinks.set(full, text);
      continue;
    }
    if (full.includes("/Inhalt/Ebene") && !seen.has(normalizeUrl(full))) {
      await crawlLevel(full, depth + 1);
    }
  }
}

console.log("Starte Traversierung ab", `${BASE}/Inhalt`, "...");
await crawlLevel(`${BASE}/Inhalt`, 0);

console.log(`\nBesuchte Navigationsseiten: ${seen.size}`);
console.log(`Gefundene Dokumente: ${docLinks.size}`);

const lines = [...docLinks.entries()].map(([url, label]) => `${url}\t${label}`);
await Bun.write("/tmp/bass-documents.tsv", lines.join("\n") + "\n");
console.log("Liste geschrieben nach /tmp/bass-documents.tsv");
