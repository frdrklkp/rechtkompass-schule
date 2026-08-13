import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

/**
 * Gezielte KI-Nachbesserung eines einzelnen Feldes.
 * WICHTIG: Die KI generiert ausschließlich den Feldwert, nicht den Qualitätsscore.
 * Der Score wird von der zentralen Quality Engine deterministisch berechnet.
 */

type Field =
  | "practice_tip"
  | "faq"
  | "checklist"
  | "documentation"
  | "common_mistakes"
  | "legal_explanation"
  | "short_description"
  | "recommendation"
  | "immediate_actions"
  | "responsibilities";

type RequestBody = {
  field?: Field;
  reason?: string;
  caseRow?: Record<string, unknown>;
};

export const Route = createFileRoute("/api/ai-refine-case-field")({
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
        const field = body.field;
        const caseRow = body.caseRow ?? {};
        const reason = (body.reason ?? "").trim();
        if (!field) return new Response("field required", { status: 400 });

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Du besserst gezielt EIN Feld eines vorhandenen Praxisfall-Entwurfs nach.",
          "Sprache: Deutsch, sachlich, klar, handlungsorientiert, keine Rechtsberatung.",
          "Verwende KEINE Markdown-Formatierung (keine **, __, #, Backticks, keine [Text](Link)) - reiner Fließtext bzw. Aufzählungen mit führendem '-'. Wird unformatiert als reiner Text angezeigt.",
          "Nutze ausschließlich den übergebenen Fallkontext (Titel, Kurzbeschreibung, Handlungsempfehlung, Rechtsgrundlagen-Notizen).",
          "Erfinde KEINE Rechtsgrundlagen und KEINE Fakten.",
          "Für 'practice_tip' MINDESTENS 5 konkrete, fallbezogene Do's – jede Zeile mit '- '.",
          "Für 'faq' 3-8 Q&A-Paare als JSON-Array [{q,a}].",
          "Für 'checklist' 5-10 klare Handlungspunkte als Array.",
          "Für 'documentation' 3-7 Dokumentationsschritte als Array.",
          "Für 'common_mistakes' 3-6 typische Fehler als Array.",
          "Für 'legal_explanation' eine sachliche Erläuterung (mindestens 250 Zeichen).",
          "Für 'short_description' eine ausführliche Sachverhaltsbeschreibung (mindestens 200 Zeichen).",
          "Für 'recommendation' eine klare, handlungsleitende Empfehlung (mindestens 150 Zeichen).",
          "Für 'immediate_actions' eine kurze Sofortentscheidung (mindestens 80 Zeichen).",
          "Für 'responsibilities' eine klare Zuständigkeitsangabe (mindestens 80 Zeichen). Nenne die tatsächlich passende Ebene, nicht automatisch Schulleitung - bei einfachen Alltagsroutinen ohne Anhörungspflicht/Ordnungsmaßnahme ist meist Lehrkraft, Klassenleitung, Abteilungsleitung oder Ausbildungskoordination zuständig; Schulleitung nur nennen, wenn der Fall das tatsächlich erfordert.",
        ].join(" ");

        const isArrayField = field === "checklist" || field === "documentation" || field === "common_mistakes" || field === "faq";
        const schema = isArrayField
          ? field === "faq"
            ? {
                type: "object",
                properties: {
                  value: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: { q: { type: "string" }, a: { type: "string" } },
                      required: ["q", "a"],
                    },
                  },
                },
                required: ["value"],
              }
            : {
                type: "object",
                properties: { value: { type: "array", items: { type: "string" } } },
                required: ["value"],
              }
          : {
              type: "object",
              properties: { value: { type: "string" } },
              required: ["value"],
            };

        const user = {
          nachbesserungsgrund: reason,
          feld: field,
          fall_kontext: {
            title: caseRow.title,
            category: caseRow.category,
            subcategory: caseRow.subcategory,
            short_description: caseRow.short_description,
            immediate_actions: caseRow.immediate_actions,
            recommendation: caseRow.recommendation,
            responsibilities: caseRow.responsibilities,
            practice_tip_vorhanden: caseRow.practice_tip,
            legal_explanation_vorhanden: caseRow.legal_explanation,
          },
          hinweis:
            "Antworte AUSSCHLIESSLICH mit dem Feldwert im Feld 'value'. Kein Score. Keine Bewertung. Keine Erklärung außerhalb des Feldwertes.",
        };

        let parsed: { value?: unknown };
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          const result = await provider.complete({
            model: "anthropic/claude-haiku-4-5",
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) },
            ],
            jsonSchema: { name: "refined_field", schema },
          });
          parsed = (result.json ?? {}) as { value?: unknown };
        } catch (err) {
          if (err instanceof AIError) {
            return new Response(
              JSON.stringify({ error: err.userMessage, detail: err.detail }),
              { status: err.status ?? 500, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ error: "Antwort nicht als JSON lesbar" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ value: parsed.value ?? null }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
