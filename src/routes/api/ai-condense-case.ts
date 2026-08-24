import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { completeWithValidation, CompletionValidationError } from "@/services/editorial/ai/runtime/completionGuard";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

/**
 * Kürzt Do's (practice_tip), Don'ts (common_mistakes), Checkliste und
 * Dokumentationshinweise eines BEREITS EXISTIERENDEN Praxisfalls auf knappe,
 * überschaubare Bulletpoints.
 *
 * Fund 2026-08-17 (Nutzerrückmeldung): Do's/Don'ts waren bei vielen Fällen
 * zu Fließtext-Absätzen aufgebläht (bis zu 273 Wörter in einem einzigen
 * "Bullet") statt kurzer, im Alltag auf einen Blick lesbarer Punkte.
 * Besonders betroffen: die 114 in der Session ab 2026-08-15 erzeugten
 * Fälle, bei denen Don'ts teils als ein einziger String statt als Array
 * geschrieben wurden (siehe common_mistakes.length<=1).
 *
 * Dieser Endpunkt erfindet KEINE neuen Fakten/Rechtsaussagen - er kürzt und
 * strukturiert ausschließlich den bereits vorhandenen Inhalt.
 */

type RequestBody = { caseRow?: Record<string, unknown> };

export const Route = createFileRoute("/api/ai-condense-case")({
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
        const c = body.caseRow ?? {};

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Du kürzt und normalisierst Do's, Don'ts, Checkliste und Dokumentationshinweise eines BEREITS EXISTIERENDEN Praxisfalls auf knappe, im Schulalltag auf einen Blick lesbare Bulletpoints.",
          "WICHTIG: Du darfst KEINE neuen Fakten oder Rechtsaussagen erfinden, die nicht bereits im Fall (Kurzbeschreibung, Handlungsempfehlung, Rechtserklärung, Sofortentscheidung) angelegt sind. Ist ein Feld bereits gefüllt: nur kürzen/umformulieren/auftrennen, fachlicher Inhalt (insbesondere Paragraphen/Normverweise) bleibt erhalten. Ist ein Feld LEER: die fehlenden Punkte ausschließlich aus den bereits vorhandenen anderen Feldern des Falls ableiten (nichts thematisch Neues hinzufügen).",
          "Verwende KEINE Markdown-Formatierung - reiner Fließtext bzw. Zeilen mit '- '.",
          "'practice_tip' (Do's): 5-8 Zeilen, jede mit '- ' beginnend, durch echte Zeilenumbrüche getrennt. Jede Zeile EIN konkreter Handlungsschritt, maximal 18 Wörter.",
          "'common_mistakes' (Don'ts): 3-6 SEPARATE Array-Elemente, jedes maximal 18 Wörter, EIN Fehler pro Element.",
          "'checklist': 5-10 SEPARATE Array-Elemente, jedes maximal 20 Wörter, EIN Prüfpunkt pro Element.",
          "'documentation': 3-7 SEPARATE Array-Elemente, jedes maximal 20 Wörter, EIN Dokumentationshinweis pro Element.",
          "Bei allen vier Feldern gilt: enthält der Originaltext mehrere Punkte in einer Zeile/einem String verkettet (z.B. durch Gedankenstriche getrennt), auf separate Zeilen/Array-Elemente auftrennen - jeder Punkt inhaltlich unverändert, nur gekürzt. Enthält ein Feld weniger echte Punkte als die Zielspanne, nur die tatsächlich ableitbaren liefern (nicht künstlich auffüllen).",
          "Antworte AUSSCHLIESSLICH als JSON gemäß Schema.",
        ].join(" ");

        const user = {
          fall: {
            title: c.title,
            category: c.category,
            short_description: c.short_description,
            recommendation: c.recommendation,
            immediate_actions: c.immediate_actions,
            legal_explanation: c.legal_explanation,
          },
          aktueller_practice_tip: c.practice_tip,
          aktuelle_common_mistakes: c.common_mistakes,
          aktuelle_checklist: c.checklist,
          aktuelle_documentation: c.documentation,
          hinweis: "Kürze/normalisiere alle vier Felder wie angewiesen. Keine thematisch neuen Inhalte, nur Kürzung/Strukturierung des im Fall bereits Angelegten.",
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            practice_tip: { type: "string" },
            common_mistakes: {
              type: "array",
              items: { type: "string", maxLength: 200 },
              minItems: 1,
              maxItems: 6,
            },
            checklist: {
              type: "array",
              items: { type: "string", maxLength: 220 },
              minItems: 1,
              maxItems: 10,
            },
            documentation: {
              type: "array",
              items: { type: "string", maxLength: 220 },
              minItems: 1,
              maxItems: 7,
            },
          },
          required: ["practice_tip", "common_mistakes", "checklist", "documentation"],
        };

        let parsed: unknown;
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          parsed = await completeWithValidation(
            async () => {
              const result = await provider.complete({
                model: "anthropic/claude-haiku-4-5",
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: JSON.stringify(user) },
                ],
                jsonSchema: { name: "case_condensation", schema },
                maxTokens: 8000,
              });
              return result.json;
            },
            schema,
          );
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
