import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";

/**
 * Redaktioneller KI-Entwurf für einen importierten Rechtsabschnitt.
 * Die KI darf den offiziellen Volltext NICHT verändern – sie erzeugt
 * ausschließlich redaktionelle Erläuterungen.
 */

type RequestBody = {
  section_number?: string;
  title?: string;
  full_text?: string;
  source_name?: string;
  source_area?: string;
};

export const Route = createFileRoute("/api/enrich-legal-section")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const full_text = (body.full_text ?? "").trim();
        if (!full_text) return new Response("full_text required", { status: 400 });

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Aufgabe: Erstelle einen redaktionellen Entwurf zu einem offiziellen Rechtsabschnitt.",
          "WICHTIG: Du darfst den offiziellen Wortlaut NICHT verändern, zitieren oder umschreiben.",
          "Deine Ausgabe enthält ausschließlich eigene, verständliche Erläuterungen für Schulleitungen und Lehrkräfte.",
          "Sprache: Deutsch, sachlich, klar, handlungsorientiert, keine Wertungen, keine Rechtsberatung.",
          "Wenn du unsicher bist, lasse Felder leer, statt zu erfinden. Die Redaktion prüft alles.",
        ].join(" ");

        const user = {
          rechtsquelle: body.source_name ?? "",
          rechtsgebiet: body.source_area ?? "",
          paragraph: body.section_number ?? "",
          ueberschrift: body.title ?? "",
          offizieller_volltext: full_text.slice(0, 6000),
          hinweis:
            "Erzeuge kurze, verständliche Redaktionsinhalte: summary (2–3 Sätze), practice_relevance (1 Absatz), recommendation (1 Absatz), common_mistakes (3–6 Bulletpoints, mit '-' beginnend), keyword_hints (3–6 kurze Schlagwörter), related_case_hints (0–4 Titel möglicher Praxisfälle).",
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            practice_relevance: { type: "string" },
            recommendation: { type: "string" },
            common_mistakes: { type: "string" },
            keyword_hints: { type: "array", items: { type: "string" } },
            related_case_hints: { type: "array", items: { type: "string" } },
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
          return new Response(
            JSON.stringify({ error: "AI-Antwort konnte nicht als JSON gelesen werden." }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(JSON.stringify({ draft: parsed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
