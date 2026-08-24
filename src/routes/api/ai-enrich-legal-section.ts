import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

/**
 * Generiert die redaktionelle Aufbereitung (Kurzbeschreibung, Praxisbedeutung,
 * Handlungsempfehlung, typische Fehler) für einen bereits importierten
 * legal_sections-Eintrag, ausschließlich aus dessen full_text.
 *
 * Fund 2026-08-19 (Nutzerrückmeldung): von 17.385 importierten Abschnitten
 * hatten nur 19 eine redaktionelle Aufbereitung - der Massenimport füllt
 * nur den rohen Gesetzestext, LegalSectionModal.tsx zeigt für den Rest
 * "noch nicht redaktionell ausgearbeitet". Dieser Endpunkt erfindet KEINE
 * neuen Rechtsaussagen - er erklärt/ordnet ausschließlich den bereits
 * importierten Gesetzestext für den Schulalltag ein.
 */

type RequestBody = {
  section?: {
    section_number?: string | null;
    title?: string | null;
    full_text?: string | null;
    source_name?: string | null;
  };
};

export const Route = createFileRoute("/api/ai-enrich-legal-section")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const section = body.section ?? {};
        if (!section.full_text || !section.full_text.trim()) {
          return new Response(JSON.stringify({ error: "full_text fehlt." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW), eine Plattform für Lehrkräfte und Schulleitungen.",
          "Du bekommst den amtlichen Gesetzestext EINES EINZELNEN Paragrafen/Artikels und erstellst dazu eine kurze redaktionelle Einordnung für den Schulalltag.",
          "WICHTIG: Du darfst AUSSCHLIESSLICH das erklären/einordnen, was im gegebenen Gesetzestext tatsächlich steht. Keine neuen Rechtsaussagen, keine Paragrafen-Verweise auf andere, nicht mitgelieferte Vorschriften erfinden.",
          "Zielgruppe: Lehrkräfte und Schulleitungen ohne juristische Ausbildung - klare, einfache Alltagssprache, keine Verschachtelungen.",
          "'summary': 1-2 Sätze, was der Paragraf regelt (Kurzbeschreibung).",
          "'practice_relevance': 2-4 Sätze, warum das im Schulalltag konkret relevant ist und wann Lehrkräfte/Schulleitung damit in Berührung kommen.",
          "'recommendation': 2-4 Sätze, konkrete Handlungsempfehlung, wie die Vorschrift in der Praxis korrekt angewendet wird.",
          "'common_mistakes': 2-4 Sätze bzw. kurze Punkte (als Fließtext, keine Aufzählungszeichen), welche Fehler beim Umgang mit dieser Vorschrift typischerweise vorkommen.",
          "Reiner Fließtext, keine Markdown-Formatierung, keine Aufzählungszeichen.",
          "Antworte AUSSCHLIESSLICH als JSON gemäß Schema.",
        ].join(" ");

        const user = {
          paragraf: section.section_number,
          titel: section.title,
          quelle: section.source_name,
          gesetzestext: section.full_text,
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string", maxLength: 400 },
            practice_relevance: { type: "string", maxLength: 700 },
            recommendation: { type: "string", maxLength: 700 },
            common_mistakes: { type: "string", maxLength: 700 },
          },
          required: ["summary", "practice_relevance", "recommendation", "common_mistakes"],
        };

        let parsed: unknown;
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          const result = await provider.complete({
            model: "anthropic/claude-haiku-4-5",
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) },
            ],
            jsonSchema: { name: "legal_section_enrichment", schema },
          });
          parsed = result.json;
        } catch (err) {
          if (err instanceof AIError) {
            return new Response(
              JSON.stringify({ error: err.userMessage, detail: err.detail }),
              { status: err.status ?? 500, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ error: "AI-Antwort konnte nicht als JSON gelesen werden." }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(parsed), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
