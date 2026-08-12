import { createFileRoute } from "@tanstack/react-router";

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

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Erzeuge eine Liste realistischer, konkreter schulischer Alltagssituationen (Berufskolleg NRW), die als Praxisfälle für Lehrkräfte und Schulleitungen redaktionell aufbereitet werden sollen.",
          "Jeder Eintrag: kurzer, prägnanter Titel (max. 80 Zeichen) + 2–3 Sätze Sachverhalts-Skizze.",
          "Vermeide Dubletten zu bereits vorhandenen Titeln. Wähle unterschiedliche Rollen, Handlungsfelder und Eskalationsstufen.",
          "Sprache: Deutsch, sachlich, klar. Keine Wertungen, keine Rechtsberatung.",
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

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: "praxisfall_ideen", strict: false, schema },
            },
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          return new Response(
            JSON.stringify({ error: `AI Gateway ${res.status}: ${text.slice(0, 400)}` }),
            { status: res.status, headers: { "Content-Type": "application/json" } },
          );
        }

        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content ?? "";
        let parsed: { ideas?: Array<{ title: string; sketch: string; topic?: string }> };
        try {
          parsed = JSON.parse(content);
        } catch {
          return new Response(
            JSON.stringify({ error: "AI-Antwort konnte nicht als JSON gelesen werden.", raw: content }),
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
