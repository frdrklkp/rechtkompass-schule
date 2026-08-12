import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";

/**
 * Erzeugt einen vollständigen Praxisfall-Entwurf für EINE Idee im Rahmen
 * der KI-Entwurfsmaschine. Rechtliche Aussagen dürfen ausschließlich aus
 * der übergebenen Wissensbasis abgeleitet werden.
 */

type Ref = { id: string; label: string };
type CaseRef = { id: string; label: string; category?: string; ampel?: string };

type RequestBody = {
  title?: string;
  sketch?: string;
  topic?: string;
  categories?: string[];
  keywords?: string[];
  templates?: Ref[];
  sections?: Ref[];
  cases?: CaseRef[];
};

export const Route = createFileRoute("/api/ai-draft-batch-item")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const title = (body.title ?? "").trim();
        const sketch = (body.sketch ?? "").trim();
        if (!title && !sketch) {
          return new Response("title or sketch required", { status: 400 });
        }

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW).",
          "Erzeuge aus Titel + kurzer Sachverhalts-Skizze einen vollständigen Praxisfall-Entwurf für Lehrkräfte und Schulleitungen (Berufskolleg NRW).",
          "Sprache: Deutsch, sachlich, klar, handlungsorientiert, keine Rechtsberatung.",
          "Rechtsrahmen: Schulgesetz NRW, VwVfG NRW, DSGVO/DSG NRW, GG, ggf. StGB/KunstUrhG.",
          "WICHTIG (Grundsatz): Du darfst KEINE rechtlichen Informationen erfinden. Rechtliche Aussagen dürfen ausschließlich aus der übergebenen Wissensbasis (verfügbare Rechtsgrundlagen, Vorlagen, bekannte Praxisfälle) abgeleitet werden.",
          "Wähle 'legal_section_ids' ausschließlich aus 'verfuegbare_rechtsgrundlagen', 'template_ids' aus 'verfuegbare_vorlagen', 'keyword_ids' aus 'verfuegbare_schlagwoerter'.",
          "Für jede gewählte legal_section_id eine kurze Zuordnungsbegründung ('explanation') und eine Relevanz ('low' | 'medium' | 'high') liefern.",
          "Wenn keine passende Rechtsgrundlage/Vorlage vorhanden ist: Feld leer lassen (Redaktion prüft).",
          "RECHTSGRUNDLAGEN – SUCHSTRATEGIE: suche systematisch nach mehreren belastbaren Normen. Ziel sind mindestens drei (primäre Norm + Verfahrens-/Zuständigkeits-/Dokumentations-/Datenschutz-/Aufsichts-Normen). KEINE künstliche Auffüllung: wenn weniger als drei fachlich passen, nur die passenden angeben.",
          "§ 53 SchulG NRW ist KEIN Standard-Fallback. Ordne § 53 SchulG NRW ausschließlich zu, wenn der Sachverhalt fachlich um Fehlverhalten eines Schülers, erzieherische Einwirkungen, Ordnungsmaßnahmen, Verhältnismäßigkeit einer Maßnahme, Ausschluss vom Unterricht oder eine vergleichbare Disziplinarreaktion geht. Keyword-Übereinstimmung allein reicht NICHT.",
          "Für Do's (practice_tip) MINDESTENS 5 und maximal 8 konkrete, fallbezogene, handlungsorientierte Empfehlungen liefern – jede als eigene Zeile mit '- '. Keine allgemeinen Standardformulierungen, keine Dubletten, keine künstliche Auffüllung. Do's müssen mit Sachverhalt und gewählten Rechtsgrundlagen konsistent sein. Don'ts (common_mistakes) analog konkret formulieren.",
        ].join(" ");

        const user = {
          idee_titel: title,
          idee_sachverhalt: sketch,
          themenbereich: body.topic ?? "",
          verfuegbare_kategorien: body.categories ?? [],
          verfuegbare_schlagwoerter: body.keywords ?? [],
          verfuegbare_vorlagen: body.templates ?? [],
          verfuegbare_rechtsgrundlagen: body.sections ?? [],
          bekannte_praxisfaelle: body.cases ?? [],
          hinweis:
            "Fülle möglichst alle Felder aus. Checkliste 5–10 Punkte, Doku 3–7 Punkte, FAQ 4–8 Q&A, Praxistipp MINDESTENS 5 und maximal 8 konkrete fallbezogene Do's (jede als eigene Zeile mit '- '), Typische Fehler 3–6 Don'ts. Zuständigkeiten (Lehrkraft, Klassenleitung, Schulleitung) klar benennen. Rechtsgrundlagen: Ziel mindestens 3 belastbare Treffer, keine künstliche Auffüllung, kein § 53 SchulG NRW ohne fachlichen Bezug (Fehlverhalten, Ordnungsmaßnahme, Verhältnismäßigkeit, Ausschluss).",
        };

        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            category: { type: "string" },
            subcategory: { type: "string" },
            ampel: { type: "string", enum: ["gruen", "gelb", "rot"] },
            short_description: { type: "string" },
            short_answer: { type: "string" },
            immediate_actions: { type: "string" },
            recommendation: { type: "string" },
            legal_explanation: { type: "string" },
            responsibilities: { type: "string" },
            escalation: { type: "string" },
            risks: { type: "string" },
            practice_tip: { type: "string" },
            checklist: { type: "array", items: { type: "string" } },
            documentation: { type: "array", items: { type: "string" } },
            common_mistakes: { type: "array", items: { type: "string" } },
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
            keyword_hints: { type: "array", items: { type: "string" } },
            template_ids: { type: "array", items: { type: "string" } },
            legal_links: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  legal_section_id: { type: "string" },
                  relevance: { type: "string", enum: ["low", "medium", "high"] },
                  explanation: { type: "string" },
                },
                required: ["legal_section_id"],
              },
            },
            related_hints: { type: "array", items: { type: "string" } },
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
            "responsibilities",
            "practice_tip",
            "checklist",
            "documentation",
            "common_mistakes",
            "faq",
            "ampel",
          ],
        };

        let parsed: any;
        try {
          const provider = AIProviderFactory.get("anthropic-native");
          const result = await provider.complete({
            model: "anthropic/claude-haiku-4-5",
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) },
            ],
            jsonSchema: { name: "praxisfall_batch_entwurf", schema },
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

        // Post-Filter: § 53 SchulG NRW nur behalten, wenn Fallkontext fachlich relevant ist.
        // Verhindert die verbreitete Standard-Fallback-Zuordnung durch das Modell.
        const contextText = [
          title,
          sketch,
          typeof parsed?.short_description === "string" ? parsed.short_description : "",
          typeof parsed?.recommendation === "string" ? parsed.recommendation : "",
          typeof parsed?.immediate_actions === "string" ? parsed.immediate_actions : "",
          typeof parsed?.responsibilities === "string" ? parsed.responsibilities : "",
          typeof parsed?.legal_explanation === "string" ? parsed.legal_explanation : "",
          Array.isArray(parsed?.common_mistakes) ? parsed.common_mistakes.join(" ") : "",
        ]
          .join(" ")
          .toLowerCase();
        const schulg53Signals =
          /fehlverhalt|pflichtverletz|regelverstoß|regelverstoss|unterrichtsstörung|st(ö|oe)rung des unterrichts|ordnungsmaß|ordnungsmass|disziplin|verweis|ausschluss|schulverweis|ausschluss vom unterricht|erzieherisch(e|en)? einwirk|erzieherische ma(ss|ß)nahme|verh(ä|ae)ltnism(ä|ae)ßig|verh(ä|ae)ltnismass/.test(
            contextText,
          );
        const sectionLabelById = new Map(
          (body.sections ?? []).map((s) => [s.id, (s.label ?? "").toLowerCase()]),
        );
        const isSchulG53 = (id: string) => {
          const label = sectionLabelById.get(id) ?? "";
          return /schulg/.test(label) && /\b53\b|§\s*53|n\s*53/.test(label);
        };
        let rejectedDefault53 = false;
        if (!schulg53Signals && Array.isArray(parsed?.legal_links)) {
          const before = parsed.legal_links.length;
          parsed.legal_links = parsed.legal_links.filter((l: any) => !(l && typeof l.legal_section_id === "string" && isSchulG53(l.legal_section_id)));
          if (parsed.legal_links.length < before) rejectedDefault53 = true;
        }
        if (!schulg53Signals && Array.isArray(parsed?.legal_section_ids)) {
          const before = parsed.legal_section_ids.length;
          parsed.legal_section_ids = parsed.legal_section_ids.filter((id: unknown) => !(typeof id === "string" && isSchulG53(id)));
          if (parsed.legal_section_ids.length < before) rejectedDefault53 = true;
        }

        return new Response(
          JSON.stringify({
            draft: parsed,
            flags: {
              rejected_default_53: rejectedDefault53,
              schulg53_relevant: schulg53Signals,
              legal_link_count: Array.isArray(parsed?.legal_links) ? parsed.legal_links.length : 0,
              target_min_sources: 3,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
