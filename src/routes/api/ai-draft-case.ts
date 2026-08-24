import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

type Ref = { id: string; label: string };
type CaseRef = { id: string; label: string; category?: string; ampel?: string };

type RequestBody = {
  description?: string;
  categories?: string[];
  keywords?: string[];
  templates?: Ref[];
  sections?: Ref[];
  cases?: CaseRef[];
};

export const Route = createFileRoute("/api/ai-draft-case")({
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
        const description = (body.description ?? "").trim();
        if (!description) {
          return new Response("description required", { status: 400 });
        }

        const categories = body.categories ?? [];
        const keywords = body.keywords ?? [];
        const templates = body.templates ?? [];
        const sections = body.sections ?? [];
        const cases = body.cases ?? [];

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Du erstellst aus einer freien Sachverhaltsbeschreibung einen vollständigen Praxisfall-Entwurf für Lehrkräfte und Schulleitungen.",
          "Sprache: Deutsch, sachlich, klar, unaufgeregt, keine Wertungen.",
          "Verwende KEINE Markdown-Formatierung (keine **, __, #, Backticks, keine [Text](Link)) - reiner Fließtext bzw. Aufzählungen mit führendem '-'. Wird unformatiert als reiner Text angezeigt.",
          "Stil: knapp, handlungsorientiert, wie in den bereits veröffentlichten Praxisfällen.",
          "Rechtsrahmen: Schulgesetz NRW, VwVfG NRW, DSGVO/DSG NRW, GG, ggf. StGB/KunstUrhG.",
          "WICHTIG (Grundsatz): Du darfst KEINE rechtlichen Informationen erfinden. Rechtliche Aussagen dürfen ausschließlich aus der übergebenen Wissensbasis (veröffentlichte Praxisfälle, Rechtsgrundlagen, Dokumentvorlagen) abgeleitet werden.",
          "Wähle 'legal_section_ids' ausschließlich aus 'verfuegbare_rechtsgrundlagen'. Wähle 'template_ids' ausschließlich aus 'verfuegbare_vorlagen'. Wähle 'keyword_ids' ausschließlich aus 'verfuegbare_schlagwoerter' (nach Namen matchen -> ID).",
          "Wenn du unsicher bist oder keine passende Grundlage findest, lasse das Feld leer statt zu erfinden. Die Redaktion ergänzt bei Bedarf.",
          "Prüfe zuerst die Wissensbasis ('bekannte_praxisfaelle') auf ähnliche, bereits veröffentlichte Fälle und wiederverwende Formulierungen, wo sinnvoll. Nenne ähnliche Fälle als 'related_hints' (nur Titel).",
          "Falls nur ein Titel vorliegt, analysiere ihn semantisch (Thema, Handlungsfeld, Rechtsbereich) und erzeuge dennoch einen vollständigen Entwurf.",
          "AMPEL-EINSTUFUNG (ampel) - verbindliche Kriterien, NICHT standardmäßig 'gruen' wählen: 'gruen' NUR bei einfacher Alltagssituation ohne Anhörungspflicht, ohne drohende Ordnungsmaßnahme, ohne Meldepflicht, eigenständig durch die Lehrkraft lösbar. 'gelb' bei formalen Verfahrensschritten (Anhörung nach § 66 VwVfG NRW, Dokumentationspflicht, mögliche Ordnungsmaßnahme, Rücksprache mit vorgesetzter Stelle nötig) OHNE akute Gefährdung. 'rot' bei akuter Gefährdung, Straftatverdacht, Meldepflicht an externe Stellen (Jugendamt, Polizei) oder Fällen, die sofortige Eskalation erfordern. Fülle ZUERST 'ampel_begruendung' aus (1-2 Sätze: welches der drei Kriterien trifft zu, insbesondere ob Anhörung/Ordnungsmaßnahme/Meldepflicht vorliegt) und leite DANN 'ampel' aus dieser Begründung ab - nicht umgekehrt.",
          "DON'TS (common_mistakes) - KEIN Fließtext: 3-6 EIGENSTÄNDIGE Array-Elemente, niemals ein einzelner String mit mehreren durch Gedankenstriche/Aufzählung verketteten Punkten. Jedes Element: EIN konkreter Fehler, ein Satz, maximal 20 Wörter. Gehören mehrere Fehlerpunkte zusammen, als SEPARATE Array-Elemente liefern, nicht in einem Element verketten.",
          "DO'S (practice_tip) - Kürze: jede Zeile EIN konkreter Handlungsschritt, maximal 20 Wörter, mit echtem Zeilenumbruch getrennt. Keine mehrsätzigen Begründungen pro Zeile, keine Verkettung mehrerer Empfehlungen in einer Zeile.",
          "ZUSTÄNDIGKEITEN (responsibilities): nenne die tatsächlich passende Ebene, nicht automatisch Schulleitung. Bei echten Alltagsroutinen (ampel='gruen') ist meist die Lehrkraft, Klassenleitung, Abteilungsleitung oder Ausbildungskoordination zuständig - Schulleitung NUR nennen, wenn der Sachverhalt das nach den obigen Ampel-Kriterien tatsächlich erfordert (ampel='gelb'/'rot').",
        ].join(" ");

        const user = {
          sachverhalt: description,
          verfuegbare_kategorien: categories,
          verfuegbare_schlagwoerter: keywords,
          verfuegbare_vorlagen: templates,
          verfuegbare_rechtsgrundlagen: sections,
          bekannte_praxisfaelle: cases,
          hinweis:
            "Fülle möglichst alle Felder aus. Halte Texte konkret, kurz und handlungsorientiert - Lehrkräfte lesen das im Alltag auf einen Blick, keine Fließtext-Absätze in Listen. Checkliste 5–10 Punkte, Doku 3–7 Punkte, FAQ 4–8 Q&A. Für 'practice_tip' (Do's) MINDESTENS 5 und maximal 8 knappe Handlungsempfehlungen liefern – jede als eigene Zeile mit führendem '- ', jede Zeile maximal 20 Wörter, EIN Handlungsschritt pro Zeile. Für 'common_mistakes' (Don'ts) 3-6 SEPARATE Array-Elemente, jedes Element maximal 20 Wörter, EIN Fehler pro Element - niemals mehrere Punkte in einem String verketten. Keine allgemeinen Standardformulierungen, keine Wiederholungen, keine künstliche Auffüllung. Jedes Do/Don't muss konkret und mit Sachverhalt sowie den gewählten Rechtsgrundlagen konsistent sein. Falls keine 5 belastbaren Do's ableitbar sind, so viele wie möglich liefern und im Feld 'practice_tip' als letzte Zeile ergänzen: '[Redaktion: weitere fallbezogene Do's ergänzen]'.",
        };


        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            category: { type: "string" },
            subcategory: { type: "string" },
            ampel_begruendung: { type: "string" },
            ampel: { type: "string", enum: ["gruen", "gelb", "rot"] },
            short_description: { type: "string" },
            short_answer: { type: "string" },
            immediate_actions: { type: "string" },
            recommendation: { type: "string" },
            legal_explanation: { type: "string" },
            responsibilities: { type: "string" },
            practice_tip: { type: "string" },
            checklist: { type: "array", items: { type: "string" } },
            documentation: { type: "array", items: { type: "string" } },
            common_mistakes: {
              type: "array",
              items: { type: "string", maxLength: 220 },
              minItems: 3,
              maxItems: 6,
            },
            faq: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: { q: { type: "string" }, a: { type: "string" } },
                required: ["q", "a"],
              },
            },
            keyword_ids: { type: "array", items: { type: "string" } },
            template_ids: { type: "array", items: { type: "string" } },
            legal_section_ids: { type: "array", items: { type: "string" } },
            related_hints: { type: "array", items: { type: "string" } },
            keyword_hints: { type: "array", items: { type: "string" } },
            bildungsgang: { type: "string" },
            zielgruppe: { type: "string" },
            schwierigkeit: { type: "string", enum: ["leicht", "mittel", "komplex"] },
            bearbeitungsdauer: { type: "string" },
          },
          required: [
            "title",
            "category",
            "short_description",
            "short_answer",
            "immediate_actions",
            "recommendation",
            "legal_explanation",
            "checklist",
            "documentation",
            "common_mistakes",
            "faq",
            "keyword_ids",
            "template_ids",
            "legal_section_ids",
            "ampel_begruendung",
            "ampel",
          ],
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
            jsonSchema: { name: "praxisfall_entwurf", schema },
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
