import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { completeWithValidation, CompletionValidationError } from "@/services/editorial/ai/runtime/completionGuard";

/**
 * Textsanierung für ROT-Fälle (Nutzerauftrag 2026-08-26, nach der
 * Bestandsvalidierung mit 386 roten Fällen): anders als der Prüfschritt
 * (ai-validate-legal-claims, der nur klassifiziert/herabstuft) und anders
 * als ai-refine-case-field (das nur den Fallkontext ohne Quellentexte
 * kennt) bekommt diese Route den VOLLTEXT der verlinkten Rechtsgrundlagen
 * plus die konkreten Prüfbefunde (Begründung + offene Flags) und
 * überarbeitet die beanstandeten Felder so, dass jede rechtliche Aussage
 * entweder (a) mit konkreter Fundstelle aus den übergebenen Quellen
 * verankert, (b) zu einer organisatorischen/praktischen Empfehlung
 * abgestuft oder (c) ersatzlos gestrichen ist. Es dürfen KEINE neuen
 * Rechtsbehauptungen hinzukommen - die Sanierung darf nur entschärfen,
 * verankern oder streichen. Die Abnahme erfolgt anschließend durch einen
 * erneuten Lauf des unabhängigen Prüfschritts, nicht durch diese Route.
 */

type SourceRef = {
  id: string;
  reference: string;
  title?: string | null;
  full_text?: string | null;
  source_name?: string | null;
};

type RequestBody = {
  title?: string;
  category?: string;
  legal_vorgegeben?: string;
  legal_einordnung?: string;
  short_answer?: string;
  recommendation?: string;
  immediate_actions?: string;
  checklist?: string[];
  practice_tip?: string;
  common_mistakes?: string[];
  documentation?: string[];
  sources?: SourceRef[];
  findings?: {
    reasoning?: string;
    open_flags?: string[];
  };
};

export const Route = createFileRoute("/api/ai-revise-legal-case")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!body.title) return new Response("title required", { status: 400 });

        const system = [
          "Du bist juristischer Redaktionsassistent für den RechtKompass Schule (NRW, Berufskolleg).",
          "AUFGABE: Saniere einen Praxisfall, der die Quellenprüfung NICHT bestanden hat. Die Prüfbefunde (pruefbefunde) benennen konkret, welche Aussagen unbelegt, widersprüchlich oder offen sind.",
          "DREI ERLAUBTE OPERATIONEN je beanstandeter Aussage: (a) VERANKERN - neu formulieren, sodass die Aussage wortlautnah durch eine der übergebenen Quellen (rechtsgrundlagen, Volltext) gedeckt ist, mit Fundstellenangabe (z. B. 'nach § 19 APO-BK'); (b) ABSTUFEN - als organisatorische/praktische Empfehlung kennzeichnen, ohne Rechtspflicht-Vokabular; (c) STREICHEN - ersatzlos entfernen, wenn weder (a) noch (b) sachlich vertretbar ist.",
          "STRIKT VERBOTEN: neue Rechtsbehauptungen, neue Normzitate, die nicht in den übergebenen Quellen stehen, erfundene Fristen/Zahlen/Zuständigkeiten/Verfahrensschritte, Verschärfungen ('muss', 'zwingend', 'nichtig', 'rechtswidrig'), die nicht wörtlich quellengedeckt sind. Die Sanierung darf den Fall nur ENTSCHÄRFEN oder VERANKERN, niemals anreichern.",
          "DAS FRISTEN-/ZAHLENVERBOT GILT AUCH FÜR EMPFEHLUNGSFELDER (recommendation, immediate_actions, practice_tip, checklist, documentation): dort ebenfalls KEINE konkreten Zeiträume, Fristen, Stückzahlen oder Prozentwerte NEU einführen, die nicht in den übergebenen Quellen stehen - stattdessen allgemein formulieren ('zeitnah', 'rechtzeitig', 'unverzüglich' nur wenn quellengedeckt). Bereits im Bestandstext vorhandene unbelegte Zahlen werden entfernt oder verallgemeinert, nicht durch andere unbelegte Zahlen ersetzt.",
          "STRUKTUR legal_explanation: GENAU zwei Absätze. 'vorgegeben' enthält AUSSCHLIESSLICH Aussagen, die unmittelbar (DIRECT) aus dem Wortlaut der übergebenen Quellen folgen, je mit Fundstelle. 'einordnung' enthält die Schlussfolgerung für diesen Sachverhalt und kennzeichnet Unsicherheiten ausdrücklich ('Rechtslage nicht eindeutig', 'hierzu enthält [Quelle] keine ausdrückliche Regelung'). Keine Absatz-/Satznummern nennen, die im übergebenen Normtext nicht erkennbar sind.",
          "VERNEINUNGEN: 'ist nicht erlaubt'/'untersagt' NUR wenn die Quelle es konkret verbietet; schweigt die Quelle, formuliere 'hierzu enthält [Quelle] keine ausdrückliche Regelung'.",
          "LABEL-VOKABULAR (exakt, in eckigen Klammern am Elementanfang): checklist: '[Rechtlich erforderlich]', '[Organisatorisch empfohlen]', '[Rechtlich zu prüfen]', '[Optional]'. common_mistakes: '[Rechtlich problematisch]', '[Organisatorisch ungünstig]'. documentation: '[Rechtlich erforderlich]', '[Zur Nachvollziehbarkeit empfohlen]'. practice_tip ist EIN String, jede Zeile '- [Label] Text' mit Label aus '[Rechtlich erforderlich]', '[Praktisch empfohlen]', '[Bei Unsicherheit]'. '[Rechtlich erforderlich]' und '[Rechtlich problematisch]' NUR mit konkreter Fundstelle im Elementtext.",
          "FELDER, die die Prüfbefunde nicht beanstanden, unverändert lassen (changed: false) - für solche Felder AUSSCHLIESSLICH {\"changed\": false} ausgeben, KEINEN Text und KEINE Items mitliefern. Für jedes geänderte Feld den VOLLSTÄNDIGEN neuen Feldwert liefern, nicht nur die Änderung.",
          "AUSGABE KNAPP HALTEN: revision_notes maximal 12 Zeilen à höchstens 25 Wörter, unresolved maximal 8 Einträge à höchstens 30 Wörter - keine ausformulierten Absätze in diesen beiden Listen.",
          "revision_notes: je geänderte Stelle eine knappe Zeile 'Feld: was geändert und warum (verankert/abgestuft/gestrichen)'.",
          "unresolved: Fragen, die auch mit den übergebenen Quellen nicht klärbar sind (bleiben offene Redaktionsfragen) - NICHT im Fließtext verstecken.",
          "KEINE Markdown-Formatierung (keine **, __, #, Backticks) - reiner Fließtext bzw. '-'-Aufzählungen.",
        ].join(" ");

        const user = {
          fall: {
            title: body.title ?? "",
            category: body.category ?? "",
            legal_vorgegeben: body.legal_vorgegeben ?? "",
            legal_einordnung: body.legal_einordnung ?? "",
            short_answer: body.short_answer ?? "",
            recommendation: body.recommendation ?? "",
            immediate_actions: body.immediate_actions ?? "",
            checklist: body.checklist ?? [],
            practice_tip: body.practice_tip ?? "",
            common_mistakes: body.common_mistakes ?? [],
            documentation: body.documentation ?? [],
          },
          rechtsgrundlagen: (body.sources ?? []).map((s) => ({
            id: s.id,
            quelle: s.source_name ?? "",
            fundstelle: s.reference,
            titel: s.title ?? "",
            volltext: s.full_text ?? "",
          })),
          pruefbefunde: {
            begruendung: body.findings?.reasoning ?? "",
            offene_flags: body.findings?.open_flags ?? [],
          },
        };

        const changedString = {
          type: "object",
          additionalProperties: false,
          properties: { changed: { type: "boolean" }, text: { type: "string" } },
          required: ["changed"],
        };
        const changedArray = {
          type: "object",
          additionalProperties: false,
          properties: { changed: { type: "boolean" }, items: { type: "array", items: { type: "string" } } },
          required: ["changed"],
        };
        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            legal_explanation: {
              type: "object",
              additionalProperties: false,
              properties: {
                changed: { type: "boolean" },
                vorgegeben: { type: "string" },
                einordnung: { type: "string" },
              },
              required: ["changed"],
            },
            short_answer: changedString,
            recommendation: changedString,
            immediate_actions: changedString,
            practice_tip: changedString,
            checklist: changedArray,
            common_mistakes: changedArray,
            documentation: changedArray,
            revision_notes: { type: "array", items: { type: "string" } },
            unresolved: { type: "array", items: { type: "string" } },
          },
          required: [
            "legal_explanation", "short_answer", "recommendation", "immediate_actions",
            "practice_tip", "checklist", "common_mistakes", "documentation",
            "revision_notes", "unresolved",
          ],
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
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
                jsonSchema: { name: "legal_case_revision", schema },
                // Sanierung liefert komplette Feld-Neufassungen. Pilot-Fund
                // 2026-08-26: bei 16000 brachen 6 von 10 Antworten ab
                // (alle required-Felder fehlten) - zusammen mit der
                // Knapphalten-Anweisung im Prompt auf 24000 erhöht.
                maxTokens: 24000,
              });
              return result.json;
            },
            schema,
          );
        } catch (err) {
          if (err instanceof CompletionValidationError) {
            return new Response(
              JSON.stringify({ error: "KI-Sanierung war fehlerhaft strukturiert (auch nach Wiederholung).", detail: err.errors.join("; ") }),
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

        return new Response(JSON.stringify(parsed), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
