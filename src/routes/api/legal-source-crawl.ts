import { createFileRoute } from "@tanstack/react-router";
import { Downloader } from "@/services/legal-knowledge/connectors/Downloader";
import { crawlOfficialSource } from "@/services/legal-knowledge/connectors/OfficialSourceCrawler";
import { getOfficialSource } from "@/services/legal-knowledge/connectors/registry";
import { validateOfficialUrl } from "@/services/legal-knowledge/connectors/whitelist";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

/**
 * Sprint 4.5G – Serverseitiger Abruf offizieller Rechtsquellen.
 *
 * Der Browser darf keine Fremd-Domains laden; der Abruf läuft daher hier.
 * Es werden ausschließlich Whitelist-Hosts über HTTPS abgerufen, HTML wird
 * nur geparst (nie gerendert, nie ausgeführt).
 */
export const Route = createFileRoute("/api/legal-source-crawl")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        const json = (v: unknown, status = 200) =>
          new Response(JSON.stringify(v), {
            status,
            headers: { "Content-Type": "application/json" },
          });

        let body: {
          source_id?: string;
          url?: string;
          max_pages?: number;
          max_depth?: number;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "Ungültiger Request-Body." }, 400);
        }

        const definition = getOfficialSource(String(body.source_id ?? ""));
        if (!definition || definition.planned) {
          return json({ error: "Unbekannte oder nicht freigeschaltete Quelle." }, 400);
        }

        const startUrl = (body.url ?? "").trim() || definition.defaultUrl;
        const check = validateOfficialUrl(startUrl, definition.hosts);
        if (!check.ok) return json({ error: check.message, reason: check.reason }, 400);

        try {
          const result = await crawlOfficialSource({
            definition,
            startUrl,
            downloader: new Downloader({
              allowedHosts: definition.hosts,
              timeoutMs: 15000,
              retries: 2,
            }),
            maxPages: Math.max(1, Math.min(Number(body.max_pages ?? definition.maxPages) || definition.maxPages, 60)),
            maxDepth: Math.max(0, Math.min(Number(body.max_depth ?? definition.maxDepth) || definition.maxDepth, 4)),
          });
          return json(result);
        } catch (err) {
          return json({ error: (err as Error)?.message ?? "Abruf fehlgeschlagen" }, 200);
        }
      },
    },
  },
});
