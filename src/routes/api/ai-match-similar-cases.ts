import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";

type CaseRef = {
  id: string;
  title: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  keywords?: string[];
  legal_section_ids?: string[];
};

type RequestBody = {
  current_id?: string;
  title?: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  recommendation?: string;
  keywords?: string[];
  legal_section_ids?: string[];
  cases?: CaseRef[];
};

export const Route = createFileRoute("/api/ai-match-similar-cases")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const currentId = body.current_id ?? "";
        const cases = (body.cases ?? []).filter((c) => c.id && c.id !== currentId).slice(0, 400);
        if (cases.length === 0) {
          return new Response(JSON.stringify({ matches: [] }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        const validIds = new Set(cases.map((c) => c.id));
        const currentKws = new Set((body.keywords ?? []).map((k) => k.toLowerCase()));
        const currentSecs = new Set(body.legal_section_ids ?? []);

        const system = [
          "Du bist Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Aufgabe: finde ähnliche bereits vorhandene Praxisfälle für den aktuellen Sachverhalt.",
          "STRENG: verwende ausschließlich IDs aus 'verfuegbare_faelle'. Keine Erfindungen.",
          "Bewerte inhaltliche Ähnlichkeit (Sachverhalt, Kategorie, Rechtsgrundlagen, Schlagwörter, Handlungsempfehlung).",
          "Je Vorschlag: id, similarity (0-100 ganzzahlig), reason (max. 2 Sätze), common_signals (kurze Stichworte, was gemeinsam ist).",
          "Ähnlichkeit ≥ 85 % signalisiert mögliche Dublette; sei bei sehr allgemeinen Übereinstimmungen zurückhaltend.",
          "Maximal 8 ähnliche Fälle.",
        ].join(" ");

        const user = {
          aktueller_fall: {
            title: body.title ?? "",
            short_description: body.short_description ?? "",
            category: body.category ?? "",
            subcategory: body.subcategory ?? "",
            recommendation: body.recommendation ?? "",
            keywords: body.keywords ?? [],
            legal_section_ids: body.legal_section_ids ?? [],
          },
          verfuegbare_faelle: cases,
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            matches: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  similarity: { type: "number" },
                  reason: { type: "string" },
                  common_signals: { type: "array", items: { type: "string" } },
                },
                required: ["id", "similarity", "reason", "common_signals"],
              },
            },
          },
          required: ["matches"],
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          const result = await provider.complete({
            model: "anthropic/claude-haiku-4-5",
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) },
            ],
            jsonSchema: { name: "similar_case_match", schema },
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

        // Katalog-Index für gemeinsame Metadaten
        const idx = new Map(cases.map((c) => [c.id, c]));

        const cleaned = Array.isArray(parsed.matches)
          ? parsed.matches
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((m: any) => m && typeof m.id === "string" && validIds.has(m.id))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((m: any) => {
                const ref = idx.get(m.id);
                const kw = new Set((ref?.keywords ?? []).map((k) => k.toLowerCase()));
                const secs = new Set(ref?.legal_section_ids ?? []);
                const sharedKw = Array.from(kw).filter((k) => currentKws.has(k));
                const sharedSecs = Array.from(secs).filter((s) => currentSecs.has(s));
                return {
                  id: m.id,
                  title: ref?.title ?? "",
                  short_description: ref?.short_description ?? "",
                  similarity: Math.max(0, Math.min(100, Number(m.similarity) || 0)),
                  reason: typeof m.reason === "string" ? m.reason.slice(0, 400) : "",
                  common_signals: Array.isArray(m.common_signals)
                    ? m.common_signals.filter((s: unknown) => typeof s === "string").slice(0, 10)
                    : [],
                  shared_keywords: sharedKw,
                  shared_legal_section_ids: sharedSecs,
                  is_possible_duplicate: (Number(m.similarity) || 0) >= 85,
                };
              })
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .sort((a: any, b: any) => b.similarity - a.similarity)
              .slice(0, 8)
          : [];

        return new Response(JSON.stringify({ matches: cleaned }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
