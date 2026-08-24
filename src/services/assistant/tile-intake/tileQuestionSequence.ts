/**
 * Tier 3 – feste Kern-Fragefolge der Kachel-Erfassung.
 * Fragetitel/-hilfetexte/-optionen werden aus dem Standardschema gelesen
 * (keine doppelte Pflege), Reihenfolge und Sprungbedingungen sind hier
 * definiert. Identisch für beide Modi ("Schnelle Einschätzung" und
 * "Fall dokumentieren") - siehe Plan lazy-drifting-mango.md.
 */
import {
  buildStandardSituationSchema,
  type SituationCase,
} from "@/services/situation-analyzer";

export type TileSequenceStepKind =
  | "text"
  | "textarea"
  | "boolean"
  | "singleChoice"
  | "multiChoice"
  | "date"
  | "time"
  | "participants"
  | "evidence"
  | "witnesses"
  | "measures";

export interface TileSequenceOption {
  value: string;
  label: string;
}

export interface TileSequenceStep {
  id: string;
  kind: TileSequenceStepKind;
  questionId: string;
  title: string;
  help?: string;
  options?: TileSequenceOption[];
  /** Schritt wird übersprungen, wenn dies true zurückgibt. */
  skipIf?: (situation: SituationCase) => boolean;
}

const schema = buildStandardSituationSchema();
const byId = new Map(schema.questions.map((q) => [q.id, q]));

function question(id: string) {
  const q = byId.get(id);
  if (!q) throw new Error(`Frage "${id}" existiert im Standardschema nicht.`);
  return q;
}

function answerBoolean(situation: SituationCase, questionId: string): boolean | null {
  const answer = situation.answers[questionId];
  if (!answer || answer.answerStatus !== "answered") return null;
  return answer.value === true;
}

/** Kern-Fragefolge, identisch für beide Modi. */
export function buildCoreSequence(): TileSequenceStep[] {
  return [
    { id: "titel", kind: "text", questionId: "kurzbeschreibung.titel", title: question("kurzbeschreibung.titel").title, help: question("kurzbeschreibung.titel").description },
    { id: "kategorie", kind: "singleChoice", questionId: "kurzbeschreibung.kategorie", title: question("kurzbeschreibung.kategorie").title, help: question("kurzbeschreibung.kategorie").description, options: question("kurzbeschreibung.kategorie").options },
    { id: "text", kind: "textarea", questionId: "kurzbeschreibung.text", title: question("kurzbeschreibung.text").title, help: question("kurzbeschreibung.text").description },
    { id: "datumBekannt", kind: "boolean", questionId: "zeit-ort.datumBekannt", title: question("zeit-ort.datumBekannt").title },
    {
      id: "datum",
      kind: "date",
      questionId: "zeit-ort.datum",
      title: question("zeit-ort.datum").title,
      skipIf: (s) => answerBoolean(s, "zeit-ort.datumBekannt") !== true,
    },
    {
      id: "zeitraum",
      kind: "text",
      questionId: "zeit-ort.zeitraum",
      title: question("zeit-ort.zeitraum").title,
      help: question("zeit-ort.zeitraum").description,
      // requiredWhen datumBekannt isFalse (Schema) - Gegenstück zu "datum".
      skipIf: (s) => answerBoolean(s, "zeit-ort.datumBekannt") !== false,
    },
    { id: "andauernd", kind: "boolean", questionId: "fortdauer.andauernd", title: question("fortdauer.andauernd").title },
    { id: "wiederholt", kind: "boolean", questionId: "fortdauer.wiederholt", title: question("fortdauer.wiederholt").title },
    {
      id: "haeufigkeit",
      kind: "text",
      questionId: "fortdauer.haeufigkeit",
      title: question("fortdauer.haeufigkeit").title,
      // requiredWhen fortdauer.wiederholt isTrue (Schema).
      skipIf: (s) => answerBoolean(s, "fortdauer.wiederholt") !== true,
    },
    { id: "gefahrGemeldet", kind: "boolean", questionId: "gefahren.gemeldet", title: question("gefahren.gemeldet").title, help: question("gefahren.gemeldet").description },
    {
      id: "gefahrArt",
      kind: "text",
      questionId: "gefahren.art",
      title: question("gefahren.art").title,
      // requiredWhen gefahren.gemeldet isTrue (Schema).
      skipIf: (s) => answerBoolean(s, "gefahren.gemeldet") !== true,
    },
    {
      id: "gefahrAndauernd",
      kind: "boolean",
      questionId: "gefahren.andauernd",
      title: question("gefahren.andauernd").title,
      skipIf: (s) => answerBoolean(s, "gefahren.gemeldet") !== true,
    },
    {
      id: "gefahrRettungsdienste",
      kind: "boolean",
      questionId: "gefahren.rettungsdienste",
      title: question("gefahren.rettungsdienste").title,
      skipIf: (s) => answerBoolean(s, "gefahren.gemeldet") !== true,
    },
    { id: "beteiligte", kind: "participants", questionId: "beteiligte.liste", title: question("beteiligte.liste").title, help: question("beteiligte.liste").description },
    { id: "ortstyp", kind: "singleChoice", questionId: "zeit-ort.ortstyp", title: question("zeit-ort.ortstyp").title, options: question("zeit-ort.ortstyp").options },
    { id: "nachweiseVorhanden", kind: "boolean", questionId: "nachweise.vorhanden", title: question("nachweise.vorhanden").title },
    {
      id: "nachweise",
      kind: "evidence",
      questionId: "nachweise.liste",
      title: question("nachweise.liste").title,
      help: question("nachweise.liste").description,
      skipIf: (s) => answerBoolean(s, "nachweise.vorhanden") !== true,
    },
    { id: "notizen", kind: "boolean", questionId: "dokumentation.notizen", title: question("dokumentation.notizen").title },
  ];
}

/** Sichtbare (nicht übersprungene) Schritte für den aktuellen Stand. */
export function resolveVisibleSequence(situation: SituationCase): TileSequenceStep[] {
  return buildCoreSequence().filter((step) => !step.skipIf?.(situation));
}

/**
 * Optionale Zusatzfragen (progressive disclosure): alle Schema-Fragen, die
 * nicht Teil der Kernfolge sind. Vollständig überspringbar - siehe
 * TileIntakeOrchestrator.skipOptionalDetails()/skip().
 */
export function buildOptionalSequence(): TileSequenceStep[] {
  return [
    { id: "uhrzeit", kind: "time", questionId: "zeit-ort.uhrzeit", title: question("zeit-ort.uhrzeit").title, help: question("zeit-ort.uhrzeit").description },
    { id: "ort", kind: "text", questionId: "zeit-ort.ort", title: question("zeit-ort.ort").title },
    { id: "betroffeneVorhanden", kind: "boolean", questionId: "betroffene.vorhanden", title: question("betroffene.vorhanden").title },
    {
      id: "betroffeneBeschreibung",
      kind: "textarea",
      questionId: "betroffene.beschreibung",
      title: question("betroffene.beschreibung").title,
      help: question("betroffene.beschreibung").description,
      skipIf: (s) => answerBoolean(s, "betroffene.vorhanden") !== true,
    },
    { id: "zeugenVorhanden", kind: "boolean", questionId: "zeugen.vorhanden", title: question("zeugen.vorhanden").title },
    {
      id: "zeugenListe",
      kind: "witnesses",
      questionId: "zeugen.liste",
      title: question("zeugen.liste").title,
      skipIf: (s) => answerBoolean(s, "zeugen.vorhanden") !== true,
    },
    { id: "massnahmenDurchgefuehrt", kind: "boolean", questionId: "massnahmen.durchgefuehrt", title: question("massnahmen.durchgefuehrt").title },
    {
      id: "massnahmenListe",
      kind: "measures",
      questionId: "massnahmen.liste",
      title: question("massnahmen.liste").title,
      skipIf: (s) => answerBoolean(s, "massnahmen.durchgefuehrt") !== true,
    },
    { id: "informierteStellen", kind: "multiChoice", questionId: "informierte.stellen", title: question("informierte.stellen").title, options: question("informierte.stellen").options },
    { id: "vorfallsbericht", kind: "boolean", questionId: "dokumentation.vorfallsbericht", title: question("dokumentation.vorfallsbericht").title },
    { id: "gespraechsnotiz", kind: "boolean", questionId: "dokumentation.gespraechsnotiz", title: question("dokumentation.gespraechsnotiz").title },
    { id: "elternkontakt", kind: "boolean", questionId: "dokumentation.elternkontakt", title: question("dokumentation.elternkontakt").title },
    { id: "sonstigeDokumentation", kind: "textarea", questionId: "dokumentation.sonstiges", title: question("dokumentation.sonstiges").title },
    { id: "offeneFragen", kind: "textarea", questionId: "offene-fragen.text", title: question("offene-fragen.text").title },
  ];
}

export function resolveVisibleOptionalSequence(situation: SituationCase): TileSequenceStep[] {
  return buildOptionalSequence().filter((step) => !step.skipIf?.(situation));
}
