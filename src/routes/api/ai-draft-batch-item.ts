import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { completeWithValidation, CompletionValidationError } from "@/services/editorial/ai/runtime/completionGuard";

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

const STOPWORDS = new Set([
  "der", "die", "das", "und", "oder", "für", "von", "mit", "bei", "im", "in", "zu", "auf",
  "ist", "sind", "des", "dem", "den", "ein", "eine", "einer", "eines", "nach", "über", "als",
  "an", "am", "um", "ohne", "durch", "wird", "werden", "kann", "können", "soll", "sollen",
  "muss", "müssen", "nicht", "auch", "sich", "sie", "es", "vom", "zur", "zum",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Bei > 1000 Rechtsgrundlagen (voller BASS-Bestand, 17.557 legal_sections,
 * Fund beim BASS-Vollimport 2026-08-13) sprengt die vollständige Liste als
 * Freitext-Kontext das 200k-Token-Limit von Claude (gemessen: 672.727 Token
 * für alle 17.557 Abschnitte). Lokale Relevanzfilterung per Tokenüberlappung
 * zwischen Idee (Titel+Sachverhalt+Thema) und Abschnitts-Label VOR dem
 * KI-Aufruf, Top-N behalten. Kein Embedding-Call nötig - das Label (Quelle +
 * Nummer + Titel) reicht für eine brauchbare Vorauswahl; die KI wählt final
 * aus dieser Teilmenge. Betrifft sowohl dieses Skript-getriebene Batch als
 * auch die Admin-UI (admin.ki-entwurfsmaschine.index.tsx), die dieselbe
 * Route mit derselben vollen Sektionsliste aufruft.
 */
function filterRelevantSections(sections: Ref[], queryText: string, maxCount = 300): Ref[] {
  if (sections.length <= maxCount) return sections;
  const queryTokens = tokenize(queryText);
  const scored = sections.map((s) => {
    const labelTokens = tokenize(s.label ?? "");
    let overlap = 0;
    for (const t of labelTokens) if (queryTokens.has(t)) overlap++;
    return { ref: s, score: overlap };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCount).map((x) => x.ref);
}

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
          "Verwende KEINE Markdown-Formatierung (keine **, __, #, Backticks) - reiner Fließtext bzw. Aufzählungen mit führendem '-'. Wird unformatiert als reiner Text angezeigt.",
          "Rechtsrahmen: Schulgesetz NRW, VwVfG NRW, DSGVO/DSG NRW, GG, ggf. StGB/KunstUrhG.",
          "WICHTIG (Grundsatz): Du darfst KEINE rechtlichen Informationen erfinden. Rechtliche Aussagen dürfen ausschließlich aus der übergebenen Wissensbasis (verfügbare Rechtsgrundlagen, Vorlagen, bekannte Praxisfälle) abgeleitet werden.",
          "Konkret verboten, auch wenn plausibel klingend: erfundene Fristen/Zeiträume (z. B. 'mindestens 2 Wochen vorher'), erfundene Eignungs-, Neutralitäts- oder Befangenheitskriterien für beteiligte Personen, oder sonstige zusätzliche Voraussetzungen, die im Text der zitierten Rechtsgrundlage(n) nicht vorkommen. Wenn eine Frist oder Voraussetzung nicht im Normtext steht, nenne KEINE konkrete Zahl/Bedingung, sondern formuliere allgemein ('rechtzeitig', 'im Vorfeld') oder lasse den Punkt weg.",
          "WORTLAUT vs. EINORDNUNG vs. EMPFEHLUNG trennen: 'legal_explanation' besteht aus GENAU zwei Absätzen mit exakt diesen Markern am Zeilenanfang (wortwörtlich, Großbuchstaben, mit Doppelpunkt): 'RECHTLICH VORGEGEBEN:' gefolgt von dem, was die zitierte(n) Norm(en) tatsächlich regeln (Wortlaut/Kernaussage) - und 'RECHTLICHE EINORDNUNG:' gefolgt von der Schlussfolgerung für diesen konkreten Sachverhalt. Kein dritter Absatz, keine abweichende Formulierung der Marker. 'recommendation' enthält AUSSCHLIESSLICH die praktische Handlungsempfehlung, nicht als Normtext getarnt.",
          "KEINE VERSCHÄRFUNG OHNE BELEG: Formulierungen wie 'muss zwingend', 'ist nichtig', 'ist unwirksam', 'macht [X] ungültig', 'muss genehmigt werden', 'Schulaufsicht ist zwingend einzuschalten' nur verwenden, wenn genau diese Rechtsfolge in der zitierten Quelle so steht. Ist die Rechtsfolge nicht eindeutig belegt, zurückhaltender formulieren (z. B. 'kann einen Verfahrensfehler darstellen' statt 'ist nichtig').",
          "KEINE UNBELEGTEN BEHÖRDENKOMPETENZEN: nicht behaupten, dass eine Bezirksregierung/Schulaufsicht/Schulleitung eine Ausnahme genehmigen, eine Befreiung erteilen oder eine Rechtsfolge aufheben darf, wenn diese Befugnis nicht konkret aus der zitierten Quelle hervorgeht.",
          "KEINE VERFAHRENS-ÜBERTRAGUNG: eine Norm nicht nur deshalb auf den Sachverhalt anwenden, weil ein anderes, ähnlich klingendes Verfahren (z. B. Nachprüfung vs. Abschlussprüfung vs. Ordnungsmaßnahme vs. Wiederholungsprüfung vs. Versetzungsentscheidung) eine vergleichbare Regelung hat. Bei unterschiedlichen Bildungsgängen (z. B. Berufskolleg vs. gymnasiale Oberstufe) IMMER prüfen, ob die zitierte Quelle für genau diesen Bildungsgang gilt.",
          "BEFANGENHEIT NUR MIT ECHTER GRUNDLAGE: nicht automatisch unterstellen, dass gleiche Fachrichtung, gleiche Abteilung, gleiche Schule oder persönliche Zusammenarbeit eine Befangenheit begründet - nur wenn die zitierte Quelle das tatsächlich so regelt.",
          "VOLLJÄHRIGKEIT PRÜFEN: vor jeder Aussage zu Informationspflichten gegenüber Eltern/Erziehungsberechtigten bedenken, dass diese bei volljährigen Schülerinnen/Schülern regelmäßig nicht ohne Weiteres gelten. Keine pauschale Empfehlung 'Eltern informieren', wenn Volljährigkeit im Sachverhalt nicht ausgeschlossen ist und die Quelle keine ausdrückliche Informationsbefugnis nennt.",
          "UNSICHERHEIT SICHTBAR MACHEN, NICHT GLÄTTEN: wenn eine Aussage nicht eindeutig aus der Wissensbasis folgt, im Text ausdrücklich als 'Rechtslage nicht eindeutig' / 'weitere Prüfung erforderlich' kennzeichnen, statt sie wie eine feststehende Regel zu formulieren. Trage zusätzlich JEDE Aussage, die du nicht sicher aus der Wissensbasis ableiten konntest, als eigenen Eintrag in 'open_questions' ein (Feldname + kurze, konkrete Frage an die Redaktion) - das ist der einzige Ort für Unsicherheiten, nicht der Fließtext.",
          "KEINE SCHEINPRÄZISION: eine Aussage nicht deshalb als sicher formulieren, nur weil sie formal-juristisch klingt. Fundstellen so präzise wie durch die Wissensbasis gedeckt (z. B. 'nach § 12 APO-BK', mit Verordnungskurzname), aber KEINE Absatz-/Satz-Nummer nennen, wenn diese Gliederung im übergebenen Normtext nicht erkennbar ist - lieber weglassen als raten.",
          "LABEL-PRÄFIX FÜR ARRAY-FELDER (checklist/common_mistakes/documentation): 'checklist', 'common_mistakes' und 'documentation' sind je ein JSON-ARRAY - jeder Punkt ist ein EIGENES Array-Element (eigener String in der Liste), NIEMALS mehrere Punkte in einem gemeinsamen, mit Zeilenumbrüchen oder '-' getrennten Text zusammengefasst. Jedes Array-Element beginnt mit exakt einem Label-Präfix in eckigen Klammern (wortwörtlich, dann Leerzeichen, dann Text). 'checklist': '[Rechtlich erforderlich]', '[Organisatorisch empfohlen]', '[Rechtlich zu prüfen]' oder '[Optional]'. 'common_mistakes': '[Rechtlich problematisch]' oder '[Organisatorisch ungünstig]'. 'documentation': GENAU '[Rechtlich erforderlich]' (die zitierte Quelle verlangt diese Angabe/Aufzeichnung ausdrücklich, z. B. Anhörungsnachweis nach § 28 VwVfG NRW) oder '[Zur Nachvollziehbarkeit empfohlen]' (sinnvolle Praxis ohne Rechtspflicht, z. B. Datum/Uhrzeit/Ort). KEIN Element ohne Präfix, KEIN Element ohne eigenen Array-Eintrag.",
          "LABEL-PRÄFIX FÜR DAS STRING-FELD practice_tip: anders als checklist/common_mistakes/documentation ist 'practice_tip' KEIN Array, sondern EIN einzelner String mit mehreren Zeilen, jede Zeile im Format '- [Label] Text' ('- ' + Label + Leerzeichen + Text). Label eines von '[Rechtlich erforderlich]', '[Praktisch empfohlen]' oder '[Bei Unsicherheit]'.",
          "'faq' ist ein JSON-ARRAY aus Objekten der Form {\"q\": ..., \"a\": ...} - niemals ein String und niemals ein einzelnes Objekt statt eines Arrays.",
          "VERNEINUNGEN PRÄZISE FORMULIEREN: unterscheide 'nicht ausdrücklich geregelt' (die Quelle äußert sich zu diesem Punkt gar nicht - dann NICHT daraus schließen, dass etwas verboten oder erlaubt ist) von 'ausdrücklich nicht zulässig' (die Quelle verbietet es konkret). Formuliere NIE 'ist nicht erlaubt' oder 'ist untersagt', wenn die Quelle zu dem Punkt schlicht schweigt - richtig ist dann 'hierzu enthält [Quelle] keine ausdrückliche Regelung'.",
          "BEDEUTUNG FÜR DIESEN FALL NICHT ÜBERDEHNEN: der Absatz 'RECHTLICHE EINORDNUNG:' darf nur das für den konkreten Sachverhalt Relevante aus dem in 'RECHTLICH VORGEGEBEN:' genannten Wortlaut ableiten - keine zusätzliche Tragweite, keine neuen Fallgruppen oder Rechtsfolgen einführen, die im zitierten Wortlaut nicht angelegt sind.",
          "BEFANGENHEIT - LOGIKFEHLER VERMEIDEN: dass ein Mitglied FACHFREMD ist (anderes Unterrichtsfach als der Sachverhalt betrifft), begründet für sich genommen KEINE Befangenheit - Fachfremdheit und Befangenheit sind unabhängige Kategorien. Befangenheit setzt eine konkrete, in der Quelle genannte Interessens- oder Näheposition voraus (z. B. eigene Beteiligung, Verwandtschaft), nicht bloß fachliche Distanz zum Thema.",
          "KEINE ABSOLUTEN FORMULIERUNGEN OHNE WORTDECKUNG: Wörter wie 'muss', 'ausschließlich', 'zwingend', 'nicht zulässig', 'unwirksam', 'nichtig', 'anfechtbar' nur verwenden, wenn im zitierten Normtext ein inhaltsgleiches Wort oder eine eindeutig gleichbedeutende Formulierung steht. Beispiel für unzulässige Verschärfung: aus 'die Schulleitung ist zu unterrichten' NICHT 'die Schulleitung muss zwingend vorab zustimmen' ableiten - das ist eine andere, stärkere Aussage.",
          "Wähle 'legal_section_ids' ausschließlich aus 'verfuegbare_rechtsgrundlagen', 'template_ids' aus 'verfuegbare_vorlagen', 'keyword_ids' aus 'verfuegbare_schlagwoerter'.",
          "Für jede gewählte legal_section_id eine kurze Zuordnungsbegründung ('explanation') und eine Relevanz ('low' | 'medium' | 'high') liefern.",
          "Wenn keine passende Rechtsgrundlage/Vorlage vorhanden ist: Feld leer lassen (Redaktion prüft).",
          "RECHTSGRUNDLAGEN – SUCHSTRATEGIE: suche systematisch nach mehreren belastbaren Normen. Ziel sind mindestens drei (primäre Norm + Verfahrens-/Zuständigkeits-/Dokumentations-/Datenschutz-/Aufsichts-Normen). KEINE künstliche Auffüllung: wenn weniger als drei fachlich passen, nur die passenden angeben.",
          "§ 53 SchulG NRW ist KEIN Standard-Fallback. Ordne § 53 SchulG NRW ausschließlich zu, wenn der Sachverhalt fachlich um Fehlverhalten eines Schülers, erzieherische Einwirkungen, Ordnungsmaßnahmen, Verhältnismäßigkeit einer Maßnahme, Ausschluss vom Unterricht oder eine vergleichbare Disziplinarreaktion geht. Keyword-Übereinstimmung allein reicht NICHT.",
          "Do's (practice_tip, EIN String mit mehreren Zeilen): MINDESTENS 5 und maximal 8 knappe, fallbezogene, handlungsorientierte Empfehlungen – jede als eigene Zeile im Format '- [Label] Text', jede Zeile maximal 20 Wörter nach dem Label, EIN Handlungsschritt pro Zeile, keine mehrsätzigen Begründungen in einer Zeile. Keine allgemeinen Standardformulierungen, keine Dubletten, keine künstliche Auffüllung. Do's müssen mit Sachverhalt und gewählten Rechtsgrundlagen konsistent sein.",
          "Don'ts (common_mistakes, ein JSON-ARRAY): 3-6 SEPARATE Array-Elemente im Format '[Label] Text', jedes maximal 20 Wörter nach dem Label, EIN Fehler pro Array-Element - niemals mehrere Punkte in einem gemeinsamen String mit Gedankenstrichen verketten.",
          "AMPEL-EINSTUFUNG (ampel) - verbindliche Kriterien, NICHT standardmäßig 'gruen' wählen: 'gruen' NUR bei einfacher Alltagssituation ohne Anhörungspflicht, ohne drohende Ordnungsmaßnahme, ohne Meldepflicht, eigenständig durch die Lehrkraft lösbar. 'gelb' bei formalen Verfahrensschritten (Anhörung nach § 66 VwVfG NRW, Dokumentationspflicht, mögliche Ordnungsmaßnahme, Rücksprache mit vorgesetzter Stelle nötig) OHNE akute Gefährdung. 'rot' bei akuter Gefährdung, Straftatverdacht, Meldepflicht an externe Stellen (Jugendamt, Polizei) oder Fällen, die sofortige Eskalation erfordern. Prüfe explizit: enthält der von dir erzeugte Entscheidungsbaum-Kontext oder die Handlungsempfehlung eine förmliche Anhörung oder eine Schulleitungsentscheidung? Dann ist 'gruen' FALSCH. Fülle ZUERST 'ampel_begruendung' aus (1-2 Sätze: welches Kriterium trifft zu) und leite DANN 'ampel' aus dieser Begründung ab - nicht umgekehrt.",
          "ZUSTÄNDIGKEITEN (responsibilities): nenne die tatsächlich passende Ebene, nicht automatisch Schulleitung. Bei echten Alltagsroutinen (ampel='gruen') ist meist die Lehrkraft, Klassenleitung, Abteilungsleitung oder Ausbildungskoordination zuständig - Schulleitung NUR nennen, wenn der Sachverhalt das nach den obigen Ampel-Kriterien tatsächlich erfordert (ampel='gelb'/'rot').",
        ].join(" ");

        const relevantSections = filterRelevantSections(
          body.sections ?? [],
          [title, sketch, body.topic ?? ""].join(" "),
        );

        const user = {
          idee_titel: title,
          idee_sachverhalt: sketch,
          themenbereich: body.topic ?? "",
          verfuegbare_kategorien: body.categories ?? [],
          verfuegbare_schlagwoerter: body.keywords ?? [],
          verfuegbare_vorlagen: body.templates ?? [],
          verfuegbare_rechtsgrundlagen: relevantSections,
          bekannte_praxisfaelle: body.cases ?? [],
          hinweis:
            "Fülle möglichst alle Felder aus. Halte Texte konkret, kurz und handlungsorientiert - Lehrkräfte lesen das im Alltag auf einen Blick, keine Fließtext-Absätze in Listen. Checkliste 5–10 Punkte, Doku 3–7 Punkte, FAQ 4–8 Q&A, Praxistipp MINDESTENS 5 und maximal 8 knappe fallbezogene Do's (jede als eigene Zeile mit '- ', max. 20 Wörter/Zeile), Typische Fehler 3-6 SEPARATE Don'ts-Array-Elemente (max. 20 Wörter/Element, niemals verketten). Zuständigkeiten (Lehrkraft, Klassenleitung, ggf. Abteilungsleitung/Ausbildungskoordination oder Schulleitung - je nach Ampel-Einstufung) klar benennen. Rechtsgrundlagen: Ziel mindestens 3 belastbare Treffer, keine künstliche Auffüllung, kein § 53 SchulG NRW ohne fachlichen Bezug (Fehlverhalten, Ordnungsmaßnahme, Verhältnismäßigkeit, Ausschluss). 'open_questions' leer lassen, wenn alles belastbar aus der Wissensbasis folgt - nur befüllen, wenn eine konkrete Stelle im Entwurf tatsächlich unsicher ist.",
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
            escalation: { type: "string" },
            risks: { type: "string" },
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
            open_questions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  field: { type: "string" },
                  question: { type: "string" },
                },
                required: ["field", "question"],
              },
            },
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
            "ampel_begruendung",
            "ampel",
          ],
        };

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
                jsonSchema: { name: "praxisfall_batch_entwurf", schema },
                // Fund 2026-08-21: der Provider-Default (4096) reicht für dieses
                // - mit Abstand größte - Schema (FAQ, Checkliste, Dokumentation,
                // Rechtsgrundlagen-Begründungen, alle mit Label-Präfix-Pflicht)
                // bei fachlich anspruchsvollen Sachverhalten nicht aus: die
                // Antwort brach reproduzierbar mitten im Tool-Call ab (fehlende
                // Spätfelder, Array-Felder als abgeschnittener String).
                maxTokens: 8000,
              });
              return result.json;
            },
            schema,
            // Größtes/komplexestes der vier Schemas dieser Pipeline (viele
            // Array-Felder + Label-Konvention) - Fund 2026-08-21: schlägt bei
            // Standard-maxAttempts=2 bei anspruchsvollen Sachverhalten
            // reproduzierbar zweimal in Folge fehl (Array-Felder als
            // zusammengefasster String statt einzelner Elemente). Ein
            // dritter Versuch statt stillschweigend abzubrechen.
            3,
          );
        } catch (err) {
          if (err instanceof CompletionValidationError) {
            return new Response(
              JSON.stringify({ error: "KI-Entwurf war fehlerhaft strukturiert (auch nach Wiederholung).", detail: err.errors.join("; ") }),
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
