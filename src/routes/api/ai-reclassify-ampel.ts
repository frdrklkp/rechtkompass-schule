import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

/**
 * Nachträgliche Ampel-Neueinstufung + Zuständigkeits-Korrektur.
 *
 * Fund 2026-08-14 (Nutzerrückmeldung): ALLE 304 KI-generierten Fälle hatten
 * ampel="gruen", weil der Generierungs-Prompt keinerlei Einstufungskriterium
 * enthielt (reine KI-Voreinstellung). Das führte zu Widersprüchen: das grüne
 * Banner behauptet "keine Schulleitung nötig", während derselbe Fall im
 * Entscheidungsbaum eine förmliche Anhörung durch die Schulleitung enthält.
 *
 * Dieser Endpunkt bewertet einen bestehenden Fall anhand der jetzt in den
 * Generierungs-Prompts hinterlegten Kriterien neu und liefert bei Bedarf eine
 * korrigierte 'responsibilities'-Formulierung (Schulleitung nur, wenn die
 * Ampel-Einstufung das tatsächlich hergibt).
 */

type RequestBody = { caseRow?: Record<string, unknown> };

export const Route = createFileRoute("/api/ai-reclassify-ampel")({
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
          "Du prüfst die Ampel-Einstufung (Dringlichkeit) eines BEREITS EXISTIERENDEN Praxisfalls und korrigierst sie bei Bedarf.",
          "Verwende KEINE Markdown-Formatierung - reiner Fließtext.",
          "AMPEL-KRITERIEN (verbindlich): 'gruen' NUR bei einfacher Alltagssituation ohne Anhörungspflicht, ohne drohende Ordnungsmaßnahme, ohne Meldepflicht, eigenständig durch die Lehrkraft lösbar. 'gelb' bei formalen Verfahrensschritten (Anhörung nach § 66 VwVfG NRW, Dokumentationspflicht, mögliche Ordnungsmaßnahme, Rücksprache mit vorgesetzter Stelle nötig) OHNE akute Gefährdung. 'rot' bei akuter Gefährdung, Straftatverdacht, Meldepflicht an externe Stellen (Jugendamt, Polizei) oder sofortiger Eskalation.",
          "Prüfe insbesondere: enthalten Handlungsempfehlung, Sofortentscheidung oder Entscheidungsbaum-Fragen eine förmliche Anhörung oder eine Schulleitungsentscheidung? Dann ist 'gruen' falsch.",
          "Wenn die korrekte Einstufung 'gruen' ist, aber 'responsibilities' unnötig Schulleitung nennt: liefere eine korrigierte Fassung, die stattdessen Lehrkraft, Klassenleitung, Abteilungsleitung oder Ausbildungskoordination nennt - inhaltlich sonst unverändert. Wenn 'responsibilities' bereits passt oder die Einstufung nicht 'gruen' ist: liefere null für responsibilities_correction.",
          "Antworte AUSSCHLIESSLICH als JSON gemäß Schema.",
        ].join(" ");

        const user = {
          fall: {
            title: c.title,
            category: c.category,
            subcategory: c.subcategory,
            short_description: c.short_description,
            short_answer: c.short_answer,
            immediate_actions: c.immediate_actions,
            recommendation: c.recommendation,
            responsibilities: c.responsibilities,
            aktuelle_ampel: c.ampel,
          },
          entscheidungsbaum_fragen: c.decision_tree_questions ?? [],
          hinweis: "Bewerte die Ampel-Einstufung neu und korrigiere responsibilities nur, wenn nötig.",
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            ampel: { type: "string", enum: ["gruen", "gelb", "rot"] },
            reasoning: { type: "string" },
            responsibilities_correction: { type: ["string", "null"] },
          },
          required: ["ampel", "reasoning", "responsibilities_correction"],
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
            jsonSchema: { name: "ampel_reclassification", schema },
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
