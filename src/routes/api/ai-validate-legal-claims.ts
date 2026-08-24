import { createFileRoute } from "@tanstack/react-router";
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import { AIError } from "@/services/editorial/ai/types";
import { completeWithValidation, CompletionValidationError } from "@/services/editorial/ai/runtime/completionGuard";
import {
  computeReleaseGate,
  LEGAL_FLAG_TYPES,
  LEGAL_TRIGGER_WORDS,
  type ClaimClassification,
  type ClassifiedClaim,
  type LegalFlagType,
} from "@/services/editorial/quality/legalClaimGate";

/**
 * Legal Export Quality Gate (Nutzer-Regelwerk 2026-08-21, erweitert um den
 * "LEGAL EXPORT RELEASE BLOCKER" vom selben Tag): zweiter, unabhängiger
 * KI-Durchlauf NACH dem Entwurf und der Rechtsgrundlagen-Verknüpfung. Prüft
 * jedes bereits gelabelte Element (Checkliste/Do's/Don'ts/Dokumentation)
 * und die Rechtlich-vorgegeben/Einordnung/Kurzfassung/Empfehlung-Absätze
 * GEGEN den tatsächlichen Volltext der verlinkten Rechtsgrundlagen.
 *
 * Zwei getrennte Ausgaben pro geprüftem Element/Absatz:
 * 1) verdict/new_label (bestehender Mechanismus) - steuert, welcher TEXT/
 *    LABEL tatsächlich gespeichert wird (reklassifizierend, nicht
 *    neuformulierend, um keine neue Halluzination beim "Verbessern" zu
 *    riskieren).
 * 2) classification/is_central/flag_type (NEU) - reine Klassifikations-
 *    Metadaten (DIRECT/DERIVED/ORGANIZATIONAL/OPEN/UNSUPPORTED/CONFLICT),
 *    aus denen computeReleaseGate() DETERMINISTISCH (kein KI-Aufruf, siehe
 *    legalClaimGate.ts) den finalen GRÜN/GELB/ROT-Status berechnet - "GRÜN
 *    muss verdient werden", nicht von der KI behauptet. Die KI liefert nur
 *    noch quality_color als PLAUSIBILITÄTS-Vergleichswert; maßgeblich ist
 *    ausschließlich computeReleaseGate().
 */

type TieredInput = { id: string; label: string | null; text: string };
type SourceInput = {
  id: string;
  reference?: string;
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
  checklist?: TieredInput[];
  practice_tip?: TieredInput[];
  common_mistakes?: TieredInput[];
  documentation?: TieredInput[];
  sources?: SourceInput[];
};

export const Route = createFileRoute("/api/ai-validate-legal-claims")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const sources = body.sources ?? [];
        const allItems: TieredInput[] = [
          ...(body.checklist ?? []),
          ...(body.practice_tip ?? []),
          ...(body.common_mistakes ?? []),
          ...(body.documentation ?? []),
        ];
        const validItemIds = new Set(allItems.map((i) => i.id));
        const validSourceIds = new Set(sources.map((s) => s.id));

        const system = [
          "Du bist juristischer Prüfassistent für den RechtKompass Schule (NRW). Du erzeugst KEINEN neuen Text - du beurteilst bereits vorhandene, mit einem Ebenen-Label versehene Aussagen gegen den tatsächlichen Text der verlinkten Rechtsgrundlagen.",
          "OBERSTES PRINZIP: Für jede Aussage muss beantwortbar sein, welche konkrete Fundstelle sie trägt. Kann das nicht eindeutig bejaht werden, darf sie NICHT als 'Rechtlich erforderlich'/'Rechtlich vorgegeben'/'Rechtlich problematisch' stehen bleiben.",
          "VIER AUSSAGEKLASSEN: 'Rechtlich erforderlich'/'Rechtlich vorgegeben' (nur unmittelbarer, durch die Quelle gedeckter Norminhalt) - 'Rechtliche Einordnung' (nachvollziehbare Schlussfolgerung, geht nicht über die Quelle hinaus) - 'Organisatorisch empfohlen'/'Praktisch empfohlen'/'Organisatorisch ungünstig' (sinnvolle Praxis ohne Rechtspflicht) - offene Frage (Quellen beantworten es nicht).",
          "Prüfe jedes Element einzeln: 1) Existiert eine konkrete Quelle unter 'rechtsgrundlagen'? 2) Trägt ihr Volltext genau diese Aussage? 3) Ist die Formulierung stärker als die Quelle (z. B. 'muss zwingend' obwohl die Quelle nur 'kann' sagt)? 4) Wird eine Frist, Zuständigkeit, Schriftform oder Rechtsfolge behauptet, die im Quellentext nicht vorkommt?",
          "SCHRIFTFORM BESONDERS PRÜFEN: 'muss schriftlich' / 'schriftliche Bestellung erforderlich' nur bestätigen, wenn die Quelle das ausdrücklich verlangt. § 10 VwVfG NRW ('Nichtförmlichkeit des Verwaltungsverfahrens') darf NIEMALS zur Herleitung einer Schriftformpflicht dienen - im Gegenteil, es spricht GEGEN eine solche Pflicht.",
          "RECHTSFOLGEN NICHT ERGÄNZEN: aus einem Verfahrensvorgabe folgt nicht automatisch 'unwirksam'/'nichtig'/'wird angefochten'/'Schulaufsicht muss einschreiten', wenn das nicht ausdrücklich in der Quelle steht.",
          "VERFAHRENSART DER QUELLE PRÜFEN: prüfe bei jeder Quelle unter 'rechtsgrundlagen', ob sie überhaupt für das im Sachverhalt beschriebene Verfahren gilt (z. B. Nachprüfung Berufskolleg vs. Externenprüfung/Abitur vs. Ordnungsmaßnahme). Stammt eine Quelle erkennbar aus einem ANDEREN Prüfungsverfahren, darf sie ein Element nicht als 'bestaetigt' tragen, selbst wenn der Wortlaut thematisch passt - 'funktional analog' reicht nicht. In diesem Fall herabstufen oder als offene Frage kennzeichnen.",
          "Wenn ein Element eindeutig durch die Quelle gedeckt ist: verdict 'bestaetigt', label unverändert lassen (new_label weglassen).",
          "Wenn ein Element eine plausible, aber nicht unmittelbar belegte rechtliche Formulierung trägt (z. B. als 'Rechtlich erforderlich' markiert, aber nur Einordnung oder Empfehlung): verdict 'herabgestuft', new_label setzen - AUSSCHLIESSLICH aus dem Vokabular des jeweiligen Feldes (erkennbar am Präfix der Element-'id' vor dem Bindestrich), NIE ein Label aus einem anderen Feld übernehmen: 'checklist-*' → 'Organisatorisch empfohlen', 'Rechtlich zu prüfen' oder 'Optional'; 'practice_tip-*' → 'Praktisch empfohlen' oder 'Bei Unsicherheit'; 'common_mistakes-*' → 'Organisatorisch ungünstig'; 'documentation-*' → GENAU 'Zur Nachvollziehbarkeit empfohlen' (documentation kennt NUR diese beiden Label: 'Rechtlich erforderlich'/'Zur Nachvollziehbarkeit empfohlen' - niemals 'Organisatorisch empfohlen' oder ein anderes Checklisten-Label für ein documentation-Element).",
          "Wenn ein Element eine Frage aufwirft, die die vorliegenden Quellen nicht beantworten (z. B. eine behauptete Zuständigkeit oder Frist ohne jede Grundlage): verdict 'offene_frage', kurze, konkrete Frage in 'note'.",
          "Wenn ein Element schlicht falsch oder durch die Quelle widerlegt ist: verdict 'entfernen'.",
          "legal_explanation_revision SETZEN (changed=true) in ZWEI Fällen: (1) 'RECHTLICH VORGEGEBEN'/'RECHTLICHE EINORDNUNG' enthalten tatsächlich unbelegte Behauptungen - dann vorsichtigere Neufassung liefern. (2) 'legal_vorgegeben_claim.contains_non_direct_sentence' ist true - dann den Absatz so umschreiben, dass NUR NOCH DIRECT-Aussagen unter 'RECHTLICH VORGEGEBEN:' stehen und der/die nicht-direkten Sätze (sofern inhaltlich haltbar) nach 'RECHTLICHE EINORDNUNG:' verschoben werden (Inhalt erhalten, nur die Zuordnung korrigieren) - UNSUPPORTED-Sätze dabei ersatzlos streichen, nicht verschieben. In BEIDEN Fällen MIT DENSELBEN ZWEI MARKERN liefern (Struktur bleibt). Sonst changed=false, vorgegeben/einordnung leer lassen.",
          "short_answer_revision NUR setzen (changed=true), wenn 'Das Wichtigste auf einen Blick' (short_answer) eine Aussage enthält, die stärker ist als das, was 'legal_vorgegeben'/'legal_einordnung' bzw. die Quellen tragen (z. B. eine dort nicht vorkommende Pflicht oder Frist) - dann vorsichtigere, gleich kurze Neufassung liefern. Sonst changed=false, text leer lassen.",
          "ERHÖHTE PRÜFPFLICHT BEI SIGNALWÖRTERN: enthält ein Element oder legal_vorgegeben/legal_einordnung/short_answer eines der folgenden Wörter, prüfe besonders streng, ob GENAU dieses Wort (nicht nur eine ähnliche Aussage) im Quellentext eine Entsprechung hat, bevor du 'bestaetigt' vergibst: 'muss', 'darf nicht', 'ausschließlich', 'zwingend', 'schriftlich', 'nicht zulässig', 'unwirksam', 'nichtig', 'anfechtbar', 'verantwortlich', 'zuständig', 'genehmigt', 'verpflichtet'. Findest du keine Entsprechung, stufe herab oder markiere als offene Frage.",
          "new_open_questions: zusätzliche, im bisherigen Text noch nicht als offene Frage erfasste Lücken, kurz und konkret formuliert - keine Wiederholung bereits als 'offene_frage' klassifizierter Elemente.",
          "KREUZWEISE KONSISTENZ PRÜFEN: vergleiche legal_vorgegeben, legal_einordnung, short_answer, recommendation und ALLE Elemente (checklist/practice_tip/common_mistakes/documentation) MITEINANDER, nicht nur einzeln gegen die Quellen. Widersprechen sich zwei Aussagen (z. B. ein Punkt verlangt Schriftform, ein anderer nennt dieselbe Handlung als formfrei möglich; oder short_answer behauptet etwas, das recommendation nicht stützt), trage JEDEN gefundenen Widerspruch als eigenen, konkreten Eintrag in 'consistency_conflicts' ein (welche zwei Aussagen widersprechen sich, wie).",
          "REGELUNGSINHALT KOMPAKT ZUSAMMENFASSEN: liefere für JEDE Quelle in 'rechtsgrundlagen' genau einen Eintrag in 'source_summaries' mit der für DIESEN Fall relevanten Kernaussage der Quelle - so kurz wie möglich (1-3 Sätze), ohne den gesamten Normtext zu wiederholen. 'kind' ist 'wortlaut' NUR wenn du den Text wörtlich oder nahezu wörtlich zitierst und er bereits kurz ist (max. ca. 300 Zeichen); sonst 'zusammengefasst'. 'precise_reference' NUR setzen, wenn im Quellentext eine konkrete Absatz-/Satz-/Nummerngliederung erkennbar ist, die genau diese Aussage trägt (z. B. 'Abs. 2 Satz 1') - sonst weglassen, KEINE Gliederung erfinden. Nenne in 'precise_reference' NIE mehr als die im Text tatsächlich erkennbare Gliederungsebene.",
          "GESAMTURTEIL quality_color: 'gruen' NUR wenn alle zentralen Aussagen (insbesondere 'Rechtlich erforderlich'/'Rechtlich vorgegeben'/'Rechtlich problematisch') hinreichend belegt sind UND 'consistency_conflicts' leer ist. 'gelb' wenn die Kernaussage belegt ist, aber einzelne Nebenpunkte offen/herabgestuft wurden ODER kleinere, nicht sachentscheidende Konsistenzabweichungen bestehen. 'rot' wenn eine oder mehrere zentrale Rechtsbehauptungen NICHT ausreichend belegt sind, der Text einer Quelle widerspricht, oder ein sachentscheidender Konflikt in 'consistency_conflicts' steht. Der Export erhält solange keinen Status GRÜN, bis alle in 'consistency_conflicts' gemeldeten Konflikte inhaltlich geklärt (also: gar nicht erst gemeldet) sind. quality_reasoning: 1-2 Sätze, konkret, sachlich. WICHTIG: dieses Feld ist nur ein Plausibilitäts-Vergleichswert - der tatsächlich veröffentlichte Status wird serverseitig deterministisch aus deinen Claim-Klassifikationen (unten) berechnet, nicht aus diesem Feld.",
          "Du darfst KEINE neue Rechtslogik erfinden und keine fachlichen Annahmen ergänzen - nur bewerten, was bereits an Aussage und Quelle vorliegt.",
          "CLAIM-KLASSIFIKATION (zusätzlich zu verdict/new_label, für jedes Element in 'zu_pruefende_elemente' UND für 'legal_vorgegeben_claim'/'legal_einordnung_claim'/'short_answer_claim'/'recommendation_claim'): jede rechtlich relevante Aussage bekommt GENAU EINEN von sechs Status. 'DIRECT': Aussage wird unmittelbar durch eine konkrete Rechtsquelle getragen (der Quellentext sagt im Kern dasselbe). 'DERIVED': nachvollziehbare rechtliche Einordnung/Schlussfolgerung auf Basis einer Quelle, geht aber selbst nicht wortwörtlich aus ihr hervor - darf NIEMALS im Abschnitt 'Rechtlich vorgegeben' stehen. 'ORGANIZATIONAL': organisatorisch sinnvolles Vorgehen ohne unmittelbare Rechtspflicht. 'OPEN': die vorhandenen Quellen beantworten die Frage nicht hinreichend - NICHT halluzinieren, NICHT aus allgemeiner Verwaltungspraxis oder ähnlichen Verfahren ergänzen. 'UNSUPPORTED': die Aussage besitzt keine ausreichende Quellenbasis oder geht über die Quelle hinaus (z. B. eine erfundene Schriftformpflicht, ein erfundenes Verbot, eine erfundene Rechtsfolge, eine erfundene Frist, eine erfundene Zuständigkeit). 'CONFLICT': die Aussage widerspricht einer Quelle oder einem anderen Claim im selben Fall.",
          `TRIGGER-WÖRTER FÜR ERHÖHTE PRÜFUNG (nicht automatisch verboten, nur Auslöser für genauere Prüfung, ob die Quelle GENAU das trägt): ${LEGAL_TRIGGER_WORDS.join(", ")}.`,
          "is_central setzen (true/false): betrifft dieser Claim die ZENTRALE Rechtsfrage dieses Praxisfalls (also den Kern dessen, was der Fall-Titel fragt), oder nur eine Nebenfrage/einen Randaspekt? Ein UNSUPPORTED/CONFLICT/OPEN-Claim zur zentralen Rechtsfrage sperrt die Freigabe vollständig (Status Rot) - bei Nebenfragen führt derselbe Claim-Status nur zu Gelb. Im Zweifel: is_central = true (lieber zu vorsichtig als zu nachsichtig).",
          `flag_type NUR setzen, wenn classification UNSUPPORTED, CONFLICT oder eine zentrale OPEN-Frage ist - wähle exakt EINEN Wert aus: ${LEGAL_FLAG_TYPES.join(", ")}. 'problem' ist eine konkrete, kurze Erklärung (kein generisches "Rechtslage prüfen") - z. B. "Der Claim 'Vertretung muss schriftlich bestellt werden' besitzt keine Quelle, die eine Schriftform verlangt."`,
          "legal_vorgegeben_claim: bewerte den GESAMTEN Absatz 'RECHTLICH VORGEGEBEN:'. Da dieser Abschnitt per Definition NUR unmittelbaren Normtext enthalten darf, muss JEDER Satz darin DIRECT sein. classification = 'DIRECT' NUR wenn WIRKLICH JEDER Satz darin unmittelbar durch eine Quelle getragen wird. Enthält der Absatz auch nur EINEN Satz, der tatsächlich DERIVED/ORGANIZATIONAL/OPEN/UNSUPPORTED ist: setze contains_non_direct_sentence=true, classification auf die Klassifikation DIESES problematischen Satzes, und kopiere den Satz wörtlich in non_direct_excerpt. Nicht schönfärben - das System sperrt daraufhin automatisch die Freigabe, DEINE Aufgabe ist nur die ehrliche Klassifikation.",
          "legal_einordnung_claim/short_answer_claim/recommendation_claim: jeweils GENAU EINE Gesamtklassifikation für den kompletten Abschnitt (nicht satzweise) - trägt der Abschnitt als Ganzes eine unbelegte oder widersprüchliche Aussage, ist er UNSUPPORTED bzw. CONFLICT, auch wenn nur EIN Satz darin das Problem verursacht.",
          "KEINE KI-KOSMETIK: klassifiziere zuerst ehrlich (Quellenlogik), erst danach kannst du optional in verdict/new_label eine vorsichtigere Formulierung vorschlagen. Verschleiere niemals ein UNSUPPORTED-Problem durch bloße Abschwächung der Wortwahl (z. B. 'muss schriftlich' -> 'sollte wohl schriftlich') ohne dass eine sachliche Grundlage für die abgeschwächte Aussage besteht - dann lieber OPEN oder entfernen.",
        ].join(" ");

        const user = {
          fall: {
            title: body.title ?? "",
            category: body.category ?? "",
            legal_vorgegeben: body.legal_vorgegeben ?? "",
            legal_einordnung: body.legal_einordnung ?? "",
            short_answer: body.short_answer ?? "",
            recommendation: body.recommendation ?? "",
          },
          zu_pruefende_elemente: allItems.map((i) => ({ id: i.id, label: i.label, text: i.text })),
          rechtsgrundlagen: sources.map((s) => ({
            id: s.id,
            fundstelle: s.reference ?? "",
            titel: s.title ?? "",
            quelle: s.source_name ?? "",
            volltext: (s.full_text ?? "").slice(0, 4000),
          })),
        };

        const CLASSIFICATIONS = ["DIRECT", "DERIVED", "ORGANIZATIONAL", "OPEN", "UNSUPPORTED", "CONFLICT"];
        const claimClassificationProps = {
          classification: { type: "string", enum: CLASSIFICATIONS },
          is_central: { type: "boolean" },
          flag_type: { type: "string", enum: [...LEGAL_FLAG_TYPES] },
          problem: { type: "string" },
          // Fund 2026-08-21: das Modell vermengt gelegentlich Feldnamen
          // zwischen den strukturell ähnlichen item_verdicts-Objekten (die
          // ein 'note'-Feld haben) und diesen Klassifikations-Objekten -
          // 'note' hier zusätzlich erlauben statt die ganze Antwort deswegen
          // zu verwerfen (wird ohnehin serverseitig ignoriert/nicht gelesen).
          note: { type: "string" },
        };

        const schema = {
          type: "object",
          // Fund 2026-08-21: additionalProperties:false auf oberster Ebene
          // führte reproduzierbar zu Abbrüchen, wenn das Modell zusätzlich zu
          // 'legal_vorgegeben_claims' noch ein rohes 'legal_vorgegeben'-Echo
          // des Eingabefelds mitschickte - inhaltlich harmlos (wird unten nie
          // gelesen), aber strukturell tödlich für die Validierung. Oberste
          // Ebene bewusst tolerant, die tatsächlich strukturkritischen Arrays
          // (legal_vorgegeben_claims-Items, item_verdicts, source_summaries)
          // bleiben strikt.
          additionalProperties: true,
          properties: {
            // Fund 2026-08-21: eine satzweise Array-Klassifikation dieses
            // Absatzes schlug reproduzierbar fehl (fehlendes Pflichtfeld,
            // vermutlich Modell-Überforderung bei Arrays strukturierter
            // Objekte unter einem bereits sehr großen Schema - dasselbe
            // Muster wie zuvor bei ai-draft-batch-item.ts). Robusteres
            // Format: EIN Objekt wie bei den anderen drei Absatz-Feldern,
            // mit einem zusätzlichen Exzerpt-Feld für den konkret
            // problematischen Satz statt einer vollständigen Satzliste.
            legal_vorgegeben_claim: {
              type: "object",
              additionalProperties: true,
              properties: {
                ...claimClassificationProps,
                contains_non_direct_sentence: { type: "boolean" },
                non_direct_excerpt: { type: "string" },
              },
              required: ["classification", "is_central", "contains_non_direct_sentence"],
            },
            legal_einordnung_claim: {
              type: "object",
              additionalProperties: true,
              properties: claimClassificationProps,
              required: ["classification", "is_central"],
            },
            short_answer_claim: {
              type: "object",
              additionalProperties: true,
              properties: claimClassificationProps,
              required: ["classification", "is_central"],
            },
            recommendation_claim: {
              type: "object",
              additionalProperties: true,
              properties: claimClassificationProps,
              required: ["classification", "is_central"],
            },
            legal_explanation_revision: {
              type: "object",
              additionalProperties: false,
              properties: {
                changed: { type: "boolean" },
                vorgegeben: { type: "string" },
                einordnung: { type: "string" },
              },
              required: ["changed"],
            },
            short_answer_revision: {
              type: "object",
              additionalProperties: false,
              properties: {
                changed: { type: "boolean" },
                text: { type: "string" },
              },
              required: ["changed"],
            },
            consistency_conflicts: { type: "array", items: { type: "string" } },
            source_summaries: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  kind: { type: "string", enum: ["wortlaut", "zusammengefasst"] },
                  text: { type: "string" },
                  precise_reference: { type: "string" },
                },
                required: ["id", "kind", "text"],
              },
            },
            item_verdicts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  verdict: { type: "string", enum: ["bestaetigt", "herabgestuft", "offene_frage", "entfernen"] },
                  new_label: { type: "string" },
                  ...claimClassificationProps,
                },
                required: ["id", "verdict", "classification", "is_central"],
              },
            },
            new_open_questions: { type: "array", items: { type: "string" } },
            quality_color: { type: "string", enum: ["gruen", "gelb", "rot"] },
            quality_reasoning: { type: "string" },
          },
          required: [
            "legal_vorgegeben_claim",
            "legal_einordnung_claim",
            "short_answer_claim",
            "recommendation_claim",
            "item_verdicts",
            "new_open_questions",
            "consistency_conflicts",
            "source_summaries",
            "quality_color",
            "quality_reasoning",
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
                jsonSchema: { name: "legal_claim_validation", schema },
                // Fund 2026-08-21 (siehe ai-draft-batch-item.ts): Provider-
                // Default (4096) reicht nach Erweiterung um source_summaries/
                // consistency_conflicts/short_answer-Prüfung nicht mehr sicher.
                maxTokens: 8000,
              });
              return result.json;
            },
            schema,
          );
        } catch (err) {
          if (err instanceof CompletionValidationError) {
            return new Response(
              JSON.stringify({ error: "KI-Prüfung war fehlerhaft strukturiert (auch nach Wiederholung).", detail: err.errors.join("; ") }),
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

        // Fund 2026-08-21: der Legal Export Quality Gate kann beim Herabstufen
        // ein Label aus dem FALSCHEN Feld-Vokabular vergeben (z. B.
        // "Organisatorisch empfohlen" für ein documentation-Element) - live
        // beobachtet, führte zum stillen Verschwinden des Punkts im Export
        // (siehe practiceCaseSummaryMarkdown.ts groupByLabel-Fund). Sicherheits-
        // netz zusätzlich zur Prompt-Korrektur: new_label serverseitig auf das
        // Vokabular des per id-Präfix erkennbaren Feldes klemmen.
        const LABEL_VOCAB: Record<string, string[]> = {
          checklist: ["Rechtlich erforderlich", "Organisatorisch empfohlen", "Rechtlich zu prüfen", "Optional"],
          practice_tip: ["Rechtlich erforderlich", "Praktisch empfohlen", "Bei Unsicherheit"],
          common_mistakes: ["Rechtlich problematisch", "Organisatorisch ungünstig"],
          documentation: ["Rechtlich erforderlich", "Zur Nachvollziehbarkeit empfohlen"],
        };
        const LABEL_FALLBACK: Record<string, string> = {
          checklist: "Organisatorisch empfohlen",
          practice_tip: "Praktisch empfohlen",
          common_mistakes: "Organisatorisch ungünstig",
          documentation: "Zur Nachvollziehbarkeit empfohlen",
        };
        const fieldOf = (id: string) => id.slice(0, id.lastIndexOf("-"));

        const CLASSIFICATION_SET = new Set(["DIRECT", "DERIVED", "ORGANIZATIONAL", "OPEN", "UNSUPPORTED", "CONFLICT"]);
        const sanitizeClassification = (v: any): ClaimClassification =>
          typeof v === "string" && CLASSIFICATION_SET.has(v) ? (v as ClaimClassification) : "OPEN";
        const sanitizeFlagType = (v: any): LegalFlagType | undefined =>
          typeof v === "string" && (LEGAL_FLAG_TYPES as readonly string[]).includes(v) ? (v as LegalFlagType) : undefined;

        // Fund 2026-08-21 (Legal Export Release Blocker, Regel 28 "keine
        // KI-Kosmetik"): ein Element darf nicht als classification=UNSUPPORTED/
        // CONFLICT eingestuft UND gleichzeitig per verdict='bestaetigt'
        // unverändert (mit vollem Label) durchgereicht werden - sonst könnte
        // die KI ein Problem "erkennen", ohne dass es sich auf den
        // gespeicherten Text/Label auswirkt. Sicherheitsnetz erzwingt
        // Konsistenz zwischen beiden Ausgaben.
        type ItemVerdict = {
          id: string;
          verdict: string;
          new_label?: string;
          note?: string;
          classification: ClaimClassification;
          isCentral: boolean;
          flagType?: LegalFlagType;
          problem?: string;
        };
        const itemVerdicts: ItemVerdict[] = Array.isArray(parsed.item_verdicts)
          ? parsed.item_verdicts
              .filter((v: any) => v && typeof v.id === "string" && validItemIds.has(v.id))
              .filter((v: any) => ["bestaetigt", "herabgestuft", "offene_frage", "entfernen"].includes(v.verdict))
              .map((v: any) => {
                const field = fieldOf(v.id);
                const vocab = LABEL_VOCAB[field];
                let newLabel = typeof v.new_label === "string" ? v.new_label : undefined;
                let verdict = v.verdict as string;
                const classification = sanitizeClassification(v.classification);
                if ((classification === "UNSUPPORTED" || classification === "CONFLICT") && verdict === "bestaetigt") {
                  verdict = "herabgestuft";
                }
                if (verdict === "herabgestuft" && vocab && (!newLabel || !vocab.includes(newLabel))) {
                  newLabel = LABEL_FALLBACK[field];
                }
                return {
                  id: v.id,
                  verdict,
                  new_label: newLabel,
                  note: typeof v.note === "string" ? v.note.slice(0, 300) : undefined,
                  classification,
                  isCentral: v.is_central === true,
                  flagType: sanitizeFlagType(v.flag_type),
                  problem: typeof v.problem === "string" ? v.problem.slice(0, 300) : undefined,
                };
              })
          : [];

        const rev = parsed.legal_explanation_revision;
        const legalExplanationRevision =
          rev && rev.changed === true && typeof rev.vorgegeben === "string" && typeof rev.einordnung === "string"
            ? { changed: true as const, vorgegeben: rev.vorgegeben, einordnung: rev.einordnung }
            : { changed: false as const };

        const sRev = parsed.short_answer_revision;
        const shortAnswerRevision =
          sRev && sRev.changed === true && typeof sRev.text === "string" && sRev.text.trim()
            ? { changed: true as const, text: sRev.text }
            : { changed: false as const };

        const consistencyConflicts = Array.isArray(parsed.consistency_conflicts)
          ? parsed.consistency_conflicts.filter((c: any) => typeof c === "string" && c.trim())
          : [];

        const sourceSummaries = Array.isArray(parsed.source_summaries)
          ? parsed.source_summaries
              .filter((s: any) => s && typeof s.id === "string" && validSourceIds.has(s.id) && typeof s.text === "string" && s.text.trim())
              .map((s: any) => ({
                id: s.id,
                kind: s.kind === "wortlaut" ? "wortlaut" : "zusammengefasst",
                text: s.text.trim(),
                preciseReference: typeof s.precise_reference === "string" && s.precise_reference.trim() ? s.precise_reference.trim() : undefined,
              }))
          : [];

        // Fund 2026-08-21 (Legal Export Release Blocker): der veröffentlichte
        // GRÜN/GELB/ROT-Status wird NICHT mehr aus der Selbstauskunft des
        // Modells (quality_color) übernommen, sondern deterministisch aus den
        // Claim-Klassifikationen berechnet (computeReleaseGate, reiner Code,
        // per 16 Regressionstests abgesichert) - "Quellenlogik vor
        // Sprachlogik" (Regel 28). quality_color bleibt als Vergleichswert im
        // Response, ist aber nicht mehr maßgeblich.
        const paragraphClaim = (raw: any, id: string, section: ClassifiedClaim["section"], text: string): ClassifiedClaim => ({
          id,
          section,
          text,
          classification: sanitizeClassification(raw?.classification),
          isCentral: raw?.is_central !== false, // im Zweifel zentral (Regel: "im Zweifel is_central=true")
          flagType: sanitizeFlagType(raw?.flag_type),
          problem: typeof raw?.problem === "string" ? raw.problem.slice(0, 300) : undefined,
        });

        // legal_vorgegeben_claim: EIN Objekt für den ganzen Absatz (Fund
        // 2026-08-21: eine satzweise Array-Klassifikation war für das Modell
        // reproduzierbar zu instabil - siehe Schema-Kommentar oben). Enthält
        // der Absatz laut Modell einen nicht-direkten Satz, wird GENAU dieser
        // Satz (non_direct_excerpt) als Claim-Text verwendet, sonst gilt der
        // ganze Absatz als sauber (DIRECT).
        const vgClaimRaw = parsed.legal_vorgegeben_claim;
        const vgContainsIssue = vgClaimRaw?.contains_non_direct_sentence === true;
        const legalVorgegebenClaim: ClassifiedClaim = vgContainsIssue
          ? paragraphClaim(
              vgClaimRaw,
              "legal_vorgegeben-0",
              "legal_vorgegeben",
              typeof vgClaimRaw?.non_direct_excerpt === "string" && vgClaimRaw.non_direct_excerpt.trim()
                ? vgClaimRaw.non_direct_excerpt.trim()
                : (body.legal_vorgegeben ?? ""),
            )
          : {
              id: "legal_vorgegeben-0",
              section: "legal_vorgegeben",
              text: body.legal_vorgegeben ?? "",
              classification: "DIRECT",
              isCentral: true,
            };
        const allClaims: ClassifiedClaim[] = [
          legalVorgegebenClaim,
          paragraphClaim(parsed.legal_einordnung_claim, "legal_einordnung", "legal_einordnung", body.legal_einordnung ?? ""),
          paragraphClaim(parsed.short_answer_claim, "short_answer", "short_answer", body.short_answer ?? ""),
          paragraphClaim(parsed.recommendation_claim, "recommendation", "recommendation", body.recommendation ?? ""),
          ...itemVerdicts
            .filter((v) => v.verdict !== "entfernen") // ein entferntes Element trägt keine veröffentlichte Aussage mehr
            .map((v) => ({
              id: v.id,
              section: fieldOf(v.id) as ClassifiedClaim["section"],
              text: allItems.find((i) => i.id === v.id)?.text ?? v.id,
              classification: v.classification,
              isCentral: v.isCentral,
              flagType: v.flagType,
              problem: v.problem,
            })),
        ];

        const consistencyConflictClaims: ClassifiedClaim[] = consistencyConflicts.map((c: string, i: number) => ({
          id: `consistency-${i}`,
          section: "legal_einordnung",
          text: c,
          classification: "CONFLICT",
          isCentral: true,
          flagType: "LEGAL_SOURCE_CONFLICT",
          problem: c,
        }));

        const releaseGate = computeReleaseGate([...allClaims, ...consistencyConflictClaims]);

        const modelColor = ["gruen", "gelb", "rot"].includes(parsed.quality_color) ? parsed.quality_color : "gelb";

        return new Response(
          JSON.stringify({
            legal_explanation_revision: legalExplanationRevision,
            short_answer_revision: shortAnswerRevision,
            consistency_conflicts: consistencyConflicts,
            source_summaries: sourceSummaries,
            item_verdicts: itemVerdicts,
            new_open_questions: Array.isArray(parsed.new_open_questions)
              ? parsed.new_open_questions.filter((q: any) => typeof q === "string" && q.trim()).slice(0, 10)
              : [],
            // Maßgeblicher, deterministisch berechneter Status:
            quality_color: releaseGate.color,
            release_gate_blockers: releaseGate.blockers,
            release_gate_flags: releaseGate.flags,
            claims: allClaims,
            model_quality_color: modelColor,
            // Fund 2026-08-21: ein hartes .slice(0, N) schneidet mitten im Satz ab -
            // genau die "Scheinpräzision durch stilles Abschneiden", die das
            // Regelwerk selbst verbietet (Regel 11). An der letzten Satzgrenze
            // vor dem Limit kürzen statt mitten im Wort.
            quality_reasoning: (() => {
              const s = typeof parsed.quality_reasoning === "string" ? parsed.quality_reasoning : "";
              if (s.length <= 800) return s;
              const cut = s.slice(0, 800);
              const lastSentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
              return lastSentenceEnd > 400 ? cut.slice(0, lastSentenceEnd + 1) : cut.trim() + " …";
            })(),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
