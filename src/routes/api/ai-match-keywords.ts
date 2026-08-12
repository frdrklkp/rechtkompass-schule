import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";

type RequestBody = {
  title?: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  short_answer?: string;
  immediate_actions?: string;
  recommendation?: string;
  legal_explanation?: string;
  responsibilities?: string;
  practice_tip?: string;
  common_mistakes?: string[];
  checklist?: string[];
  documentation?: string[];
  legal_context?: string[];
  templates?: string[];
  existing_keywords?: string[]; // Katalog: bereits vorhandene Schlagwörter (bevorzugt)
  already_linked?: string[]; // dem Fall bereits zugeordnete Schlagwörter
};

export const Route = createFileRoute("/api/ai-match-keywords")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const existing = (body.existing_keywords ?? []).slice(0, 500);
        const alreadyLinkedLower = new Set(
          (body.already_linked ?? []).map((k) => k.trim().toLowerCase()),
        );

        const system = [
          "Du bist Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Aufgabe: analysiere den Praxisfall semantisch und schlage passende Schlagwörter vor.",
          "STRENG: Bevorzuge Schlagwörter aus 'bestehende_schlagwoerter'. Verwende sie 1:1, wenn sie inhaltlich passen (auch bei Synonymen wie Handy/Smartphone, Video/Videoaufnahme, Aufsicht/Aufsichtspflicht).",
          "Nur wenn kein bestehendes Schlagwort inhaltlich passt, darfst du ein NEUES Schlagwort vorschlagen (Feld is_new=true).",
          "Keine Dubletten. Keine unterschiedlichen Schreibweisen für denselben Begriff. Keine sehr allgemeinen Begriffe (z. B. 'Schule', 'Recht').",
          "Qualität vor Quantität: max. 8-12 wirklich einschlägige Schlagwörter.",
          "Je Vorschlag: keyword (kurz, Nomen, Titel-Case für Substantive), confidence (0-100 ganzzahlig), reason (max. 1 Satz, sachlich), is_new (true/false).",
        ].join(" ");

        const user = {
          praxisfall: {
            title: body.title ?? "",
            short_description: body.short_description ?? "",
            category: body.category ?? "",
            subcategory: body.subcategory ?? "",
            short_answer: body.short_answer ?? "",
            immediate_actions: body.immediate_actions ?? "",
            recommendation: body.recommendation ?? "",
            legal_explanation: body.legal_explanation ?? "",
            responsibilities: body.responsibilities ?? "",
            practice_tip: body.practice_tip ?? "",
            common_mistakes: body.common_mistakes ?? [],
            checklist: body.checklist ?? [],
            documentation: body.documentation ?? [],
            legal_context: body.legal_context ?? [],
            templates: body.templates ?? [],
          },
          bestehende_schlagwoerter: existing,
          bereits_zugeordnet: body.already_linked ?? [],
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
                  keyword: { type: "string" },
                  confidence: { type: "number" },
                  reason: { type: "string" },
                  is_new: { type: "boolean" },
                },
                required: ["keyword", "confidence", "reason", "is_new"],
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
            jsonSchema: { name: "keyword_match", schema },
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

        // Normalisierung & Dublettenschutz auf Serverseite.
        const existingLower = new Map<string, string>();
        for (const k of existing) existingLower.set(k.trim().toLowerCase(), k);
        const seen = new Set<string>();
        const cleaned = Array.isArray(parsed.matches)
          ? parsed.matches
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((m: any) => {
                const raw = typeof m?.keyword === "string" ? m.keyword.trim() : "";
                if (!raw) return null;
                const lower = raw.toLowerCase();
                // Normalisieren auf existierende Schreibweise, wenn vorhanden.
                const canonical = existingLower.get(lower) ?? raw;
                const isNew = !existingLower.has(lower);
                return {
                  keyword: canonical,
                  confidence: Math.max(0, Math.min(100, Number(m?.confidence) || 0)),
                  reason: typeof m?.reason === "string" ? m.reason.slice(0, 240) : "",
                  is_new: Boolean(m?.is_new) && isNew,
                  already_linked: alreadyLinkedLower.has(canonical.toLowerCase()),
                };
              })
              .filter(Boolean)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((m: any) => {
                const l = m.keyword.toLowerCase();
                if (seen.has(l)) return false;
                seen.add(l);
                return true;
              })
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .sort((a: any, b: any) => b.confidence - a.confidence)
              .slice(0, 15)
          : [];

        return new Response(JSON.stringify({ matches: cleaned }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
