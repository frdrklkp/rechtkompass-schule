import { createFileRoute } from "@tanstack/react-router";
import { parseHtmlToSections } from "@/lib/legalSourceParser";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

/**
 * Import offizieller Rechtsquellen (Einzelseite).
 * Parser-Logik liegt in src/lib/legalSourceParser.ts und wird auch vom
 * BASS-Crawler wiederverwendet.
 */

export const Route = createFileRoute("/api/import-legal-source")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        let body: { url?: string } = {};
        try {
          body = (await request.json()) as { url?: string };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const url = (body.url ?? "").trim();
        if (!url || !/^https?:\/\//i.test(url)) {
          return new Response(
            JSON.stringify({ error: "Bitte eine vollständige http(s)-URL angeben." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        let html = "";
        try {
          const res = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
            },
            redirect: "follow",
          });
          if (!res.ok) {
            return new Response(
              JSON.stringify({
                error: `Quelle nicht abrufbar (HTTP ${res.status}). Bitte URL prüfen.`,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          html = await res.text();
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: `Netzwerkfehler beim Abruf: ${(err as Error).message || "unbekannt"}`,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        const { sections, mode, markerCount, charCount } = await parseHtmlToSections(html, url);
        const warning =
          sections.length <= 1 && markerCount >= 3
            ? `Achtung: ${markerCount} Paragraphenmarker im Text erkannt, aber nur ${sections.length} Abschnitt(e) extrahiert. Bitte HTML-Struktur der Quelle prüfen.`
            : null;
        const responseBody = {
          url,
          fetched_at: new Date().toISOString(),
          char_count: charCount,
          sections,
          debug: {
            parser_mode: mode,
            marker_count: markerCount,
            section_count: sections.length,
            first_sections: sections.slice(0, 5).map((s) => ({
              number: s.section_number,
              title: s.title,
            })),
            warning,
          },
        };
        return new Response(JSON.stringify(responseBody), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
