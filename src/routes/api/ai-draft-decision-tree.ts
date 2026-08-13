import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";

/**
 * KI-Entwurfsmaschine für fallspezifische Entscheidungsbäume.
 *
 * Nutzt dieselbe Infrastruktur wie ai-refine-case-field / ai-draft-case:
 * - Anthropic direkt via AIProviderFactory (anthropic/claude-haiku-4-5)
 * - JSON-Schema-basierte Antwort
 * - Reine Wiederverwendung bereits kuratierter Fallinformationen
 *
 * Rückgabe: rohes CuratedDecisionTree-JSON (start/steps/results/meta).
 * Es wird KEIN Datensatz verändert; die Übernahme liegt beim Redakteur.
 */

type RequestBody = {
  caseRow?: Record<string, unknown>;
  extraContext?: {
    legalBasis?: string[];
    knowledge?: string[];
  };
};

export const Route = createFileRoute("/api/ai-draft-decision-tree")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const caseRow = body.caseRow ?? {};
        const extra = body.extraContext ?? {};

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Du erzeugst einen redaktionellen ENTWURF eines fallspezifischen Entscheidungsbaums.",
          "Nutze ausschließlich die übergebenen Fallinformationen. Keine Internetrecherche.",
          "Erfinde KEINE Rechtsgrundlagen, KEINE Fakten, KEINE Zuständigkeiten außerhalb der Vorlage.",
          "Sprache: Deutsch, sachlich, klar, handlungsleitend, keine Rechtsberatung.",
          "Der Baum enthält 3–6 Fragen und ist maximal 4 Ebenen tief.",
          "Jede Frage MUSS eine echte fachliche Sachverhaltsvariante dieses konkreten Falls unterscheiden.",
          "Antworten dürfen sich nicht nur sprachlich, sondern müssen sich inhaltlich unterscheiden.",
          "Jeder Pfad muss in einem sinnvollen, unterschiedlichen Ergebnis enden.",
          "Ergebnisse enthalten unterschiedliche Empfehlungen und unterschiedliche Warnhinweise.",
          "Verbotene generische Fragen (nicht verwenden): 'Wurde dokumentiert?', 'Besteht Handlungsbedarf?', 'Ist die Situation wichtig?', 'Benötigen Sie Hilfe?', 'Möchten Sie fortfahren?'.",
          "Keine Ja/Nein-Fragen ohne fachliche Relevanz. Keine bloße Wiederholung der Kurzantwort oder der Do's.",
          "Ergebnis-Farben: 'gruen' (Routine), 'gelb' (erhöhte Sorgfalt), 'rot' (Eskalation/Meldung).",
          "Antworte AUSSCHLIESSLICH als JSON gemäß Schema. Keine Erklärungen außerhalb des JSON.",
        ].join(" ");

        const user = {
          fall: {
            title: caseRow.title,
            category: caseRow.category,
            subcategory: caseRow.subcategory,
            short_description: caseRow.short_description,
            short_answer: caseRow.short_answer,
            immediate_actions: caseRow.immediate_actions,
            recommendation: caseRow.recommendation,
            responsibilities: caseRow.responsibilities,
            practice_tip: caseRow.practice_tip,
            common_mistakes: caseRow.common_mistakes,
            checklist: caseRow.checklist,
            documentation: caseRow.documentation,
            legal_explanation: caseRow.legal_explanation,
            faq: caseRow.faq,
          },
          rechtsgrundlagen: extra.legalBasis ?? [],
          wissenskarten: extra.knowledge ?? [],
          hinweis:
            "Erzeuge einen fallspezifischen Entscheidungsbaum als JSON. Setze meta.status='draft' und meta.version=1.",
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            start: { type: "string" },
            steps: {
              type: "object",
              additionalProperties: {
                type: "object",
                additionalProperties: false,
                properties: {
                  question: { type: "string" },
                  explanation: { type: "string" },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        label: { type: "string" },
                        next: { type: "string" },
                        result: { type: "string" },
                      },
                      required: ["label"],
                    },
                  },
                },
                required: ["question", "options"],
              },
            },
            results: {
              type: "object",
              additionalProperties: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  color: { type: "string", enum: ["gruen", "gelb", "rot"] },
                  urgency: { type: "string" },
                  recommendation: { type: "string" },
                  responsible: { type: "string" },
                  documentation: { type: "string" },
                  warning: { type: "string" },
                  steps: { type: "array", items: { type: "string" } },
                },
                required: [
                  "title",
                  "color",
                  "urgency",
                  "recommendation",
                  "responsible",
                  "documentation",
                  "warning",
                  "steps",
                ],
              },
            },
            meta: {
              type: "object",
              additionalProperties: false,
              properties: {
                status: { type: "string", enum: ["draft"] },
                version: { type: "number" },
              },
              required: ["status", "version"],
            },
          },
          required: ["start", "steps", "results", "meta"],
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
            jsonSchema: { name: "curated_decision_tree", schema },
            // Standard-Limit (4096) reichte für vollständige Bäume nicht:
            // "steps" (3-6 Fragen mit Erklärungen) allein konnte das Budget
            // aufbrauchen, sodass "results"/"meta" (später im Schema)
            // fehlten - kein Parse-Fehler, da die Tool-Use-JSON bis dahin
            // syntaktisch gültig blieb, nur unvollständig. Empirisch
            // gefunden: 234 von 246 bereits erzeugten Bäumen fehlte
            // "results" (Fund 2026-08-13, Nutzerrückmeldung "Entscheidungs-
            // assistent fehlt").
            maxTokens: 8192,
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
        return new Response(JSON.stringify({ tree: parsed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
