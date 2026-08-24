import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { completeWithValidation, CompletionValidationError } from "@/services/editorial/ai/runtime/completionGuard";

/**
 * Erzeugt eine Liste kurzer, konkreter Sachverhalts-Ideen für die
 * KI-Entwurfsmaschine. Die Ideen dienen als Ausgangspunkt für den
 * anschließenden Batch-Entwurf; sie werden nicht persistiert.
 */

type RequestBody = {
  count?: number;
  topics?: string[];
  existingTitles?: string[];
};

export const Route = createFileRoute("/api/ai-draft-topics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const count = Math.max(1, Math.min(500, Number(body.count ?? 10)));
        const topics = (body.topics ?? []).filter(Boolean);
        const existing = (body.existingTitles ?? []).slice(0, 300);

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Erzeuge eine Liste realistischer, konkreter schulischer Alltagssituationen (Berufskolleg NRW), die als Praxisfälle für Lehrkräfte und Schulleitungen redaktionell aufbereitet werden sollen.",
          "Jeder Eintrag: kurzer, prägnanter Titel (max. 80 Zeichen) + 2–3 Sätze Sachverhalts-Skizze.",
          "Vermeide Dubletten zu bereits vorhandenen Titeln. Wähle unterschiedliche Rollen, Handlungsfelder und Eskalationsstufen.",
          "Sprache: Deutsch, sachlich, klar. Keine Wertungen, keine Rechtsberatung.",
          "Verwende KEINE Markdown-Formatierung (keine **, __, #, Backticks) - reiner Fließtext. Wird unformatiert als reiner Text angezeigt.",
        ].join(" ");

        const user = {
          anzahl: count,
          themenbereiche: topics.length ? topics : "keine Vorgabe (breit streuen)",
          bereits_vorhandene_titel: existing,
          hinweis:
            "Genau die geforderte Anzahl Ideen liefern. Keine Nummerierung im Titel. Keine Redundanzen. Verteile die Ideen ausgewogen auf die genannten Themenbereiche.",
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            ideas: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  sketch: { type: "string" },
                  topic: { type: "string" },
                },
                required: ["title", "sketch"],
              },
            },
          },
          required: ["ideas"],
        };

        let parsed: { ideas?: Array<{ title: string; sketch: string; topic?: string }> };
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          parsed = (await completeWithValidation(
            async () => {
              const result = await provider.complete({
                model: "anthropic/claude-haiku-4-5",
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: JSON.stringify(user) },
                ],
                jsonSchema: { name: "praxisfall_ideen", schema },
                maxTokens: 8000,
              });
              return result.json;
            },
            schema,
          )) as { ideas?: Array<{ title: string; sketch: string; topic?: string }> };
        } catch (err) {
          if (err instanceof CompletionValidationError) {
            return new Response(
              JSON.stringify({ error: "KI-Antwort war fehlerhaft strukturiert (auch nach Wiederholung).", detail: err.errors.join("; ") }),
              { status: 502, headers: { "Content-Type": "application/json" } },
            );
          }
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

        const ideas = (parsed.ideas ?? []).slice(0, count);
        return new Response(JSON.stringify({ ideas }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
