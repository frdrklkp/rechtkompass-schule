/**
 * Sprint 4.6F – Auswahl gezielter Rückfragen.
 *
 * Es werden nur Fragen des bestehenden Standardschemas gestellt, damit jede
 * Antwort unmittelbar in den Sachverhalt zurückfließt. Priorisiert werden
 * fehlende Pflichtangaben und Angaben, die die Trefferlage begrenzen.
 */
import type { PracticeCaseMatchResult } from "@/services/practice-case-matching";
import type { SituationCase } from "@/services/situation-analyzer";
import type { AssistantQuestion } from "./types";

const ORT_OPTIONS = [
  { value: "classroom", label: "Klassenraum" },
  { value: "schoolyard", label: "Schulhof" },
  { value: "hallway", label: "Flur oder Treppenhaus" },
  { value: "gym", label: "Sporthalle" },
  { value: "schoolTrip", label: "Schulveranstaltung außerhalb" },
  { value: "online", label: "Digitaler Raum" },
  { value: "outsideSchool", label: "Außerhalb der Schule" },
  { value: "unknown", label: "Unbekannt" },
];

const KATEGORIE_OPTIONS = [
  { value: "verhalten", label: "Verhalten im Schulalltag" },
  { value: "konflikt", label: "Konflikt zwischen Personen" },
  { value: "kommunikation", label: "Kommunikation und Medien" },
  { value: "organisation", label: "Organisation und Abläufe" },
  { value: "sonstiges", label: "Sonstiges" },
];

/** Katalog der möglichen Rückfragen in fester Reihenfolge. */
const CATALOGUE: AssistantQuestion[] = [
  {
    questionId: "gefahren.gemeldet",
    title: "Wurden Angaben zu einer möglichen Gefahr gemacht?",
    help: "Reine Tatsachenangabe, zum Beispiel eine Verletzung oder ein Notruf. Es erfolgt keine Einschätzung.",
    kind: "boolean",
    reason: "Gefahrenangaben bestimmen, welche Praxisfälle überhaupt in Betracht kommen.",
    priority: 1,
    required: true,
  },
  {
    questionId: "zeit-ort.ortstyp",
    title: "An welcher Art von Ort hat sich die Situation ereignet?",
    help: "Der Ort ist ein eigenes Zuordnungsmerkmal der Praxisfälle.",
    kind: "singleChoice",
    options: ORT_OPTIONS,
    reason: "Ohne Ortsangabe entfällt eine Bewertungsdimension des Abgleichs.",
    priority: 2,
    required: true,
  },
  {
    questionId: "kurzbeschreibung.kategorie",
    title: "Welche grobe Einordnung passt am besten?",
    help: "Nur eine Zuordnung zur Sortierung, keine rechtliche Einordnung.",
    kind: "singleChoice",
    options: KATEGORIE_OPTIONS,
    reason: "Die Kategorie ist das stärkste Zuordnungsmerkmal der Praxisfälle.",
    priority: 3,
    required: false,
  },
  {
    questionId: "betroffene.vorhanden",
    title: "Gibt es unmittelbar betroffene Personen?",
    help: "Betroffen ist, wer durch die Situation unmittelbar berührt ist.",
    kind: "boolean",
    reason: "Pflichtangabe des Sachverhalts.",
    priority: 4,
    required: true,
  },
  {
    questionId: "fortdauer.andauernd",
    title: "Dauert die Situation aktuell noch an?",
    help: "Fortdauer beeinflusst die Auswahl der Praxisfälle.",
    kind: "boolean",
    reason: "Pflichtangabe des Sachverhalts.",
    priority: 5,
    required: true,
  },
  {
    questionId: "fortdauer.wiederholt",
    title: "Hat sich der Vorgang wiederholt?",
    help: "Wiederholung ist ein eigenes Zuordnungsmerkmal.",
    kind: "boolean",
    reason: "Wiederholung unterscheidet vergleichbare Praxisfälle voneinander.",
    priority: 6,
    required: true,
  },
  {
    questionId: "zeugen.vorhanden",
    title: "Gab es Personen, die die Situation beobachtet haben?",
    help: "Nur Tatsachenangabe, keine Bewertung der Aussagen.",
    kind: "boolean",
    reason: "Pflichtangabe des Sachverhalts.",
    priority: 7,
    required: true,
  },
  {
    questionId: "nachweise.vorhanden",
    title: "Liegen Nachweise oder Unterlagen vor?",
    help: "Zum Beispiel Notizen, Nachrichten, Fotos oder Berichte.",
    kind: "boolean",
    reason: "Pflichtangabe des Sachverhalts.",
    priority: 8,
    required: true,
  },
  {
    questionId: "massnahmen.durchgefuehrt",
    title: "Wurden bereits Maßnahmen ergriffen?",
    help: "Zum Beispiel ein Gespräch oder eine Information an die Schulleitung.",
    kind: "boolean",
    reason: "Pflichtangabe des Sachverhalts.",
    priority: 9,
    required: true,
  },
  {
    questionId: "informierte.stellen",
    title: "Wer wurde bereits informiert?",
    help: "Mehrfachauswahl ist im Sachverhalt möglich; hier genügt die wichtigste Stelle.",
    kind: "singleChoice",
    options: [
      { value: "schoolLeadership", label: "Schulleitung" },
      { value: "classTeacher", label: "Klassenleitung" },
      { value: "parents", label: "Eltern oder Erziehungsberechtigte" },
      { value: "socialWork", label: "Schulsozialarbeit" },
      { value: "authority", label: "Schulaufsicht" },
      { value: "police", label: "Polizei" },
      { value: "none", label: "Bisher niemand" },
    ],
    reason: "Pflichtangabe des Sachverhalts.",
    priority: 10,
    required: true,
  },
  {
    questionId: "dokumentation.notizen",
    title: "Liegen eigene Notizen vor?",
    help: "Auch handschriftliche Notizen zählen.",
    kind: "boolean",
    reason: "Pflichtangabe des Sachverhalts.",
    priority: 11,
    required: true,
  },
  {
    questionId: "dokumentation.vorfallsbericht",
    title: "Existiert bereits ein Vorfallsbericht?",
    help: "Gemeint ist ein schriftlicher Bericht zum Vorgang.",
    kind: "boolean",
    reason: "Pflichtangabe des Sachverhalts.",
    priority: 12,
    required: true,
  },
  {
    questionId: "zeit-ort.zeitraum",
    title: "In welchem Zeitraum hat sich die Situation ereignet?",
    help: "Freie Angabe, zum Beispiel „vergangene Woche“.",
    kind: "text",
    reason: "Das genaue Datum wurde nicht angegeben.",
    priority: 13,
    required: true,
  },
];

/** Höchstzahl gleichzeitig gestellter Rückfragen. */
export const MAX_FOLLOW_UP_QUESTIONS = 5;

function isAnswered(situation: SituationCase, questionId: string): boolean {
  const answer = situation.answers[questionId];
  if (!answer) return false;
  return answer.answerStatus !== "notAnswered";
}

export class AssistantQuestionPlanner {
  /**
   * Wählt die nächsten Rückfragen aus. Berücksichtigt fehlende Pflichtangaben
   * und – falls ein Abgleich vorliegt – die Merkmale, die die Trefferlage
   * begrenzen.
   */
  plan(
    situation: SituationCase,
    result: PracticeCaseMatchResult | null,
    answeredQuestionIds: string[] = [],
  ): AssistantQuestion[] {
    const missing = new Set(situation.completeness.missingRequiredQuestions);
    const answered = new Set(answeredQuestionIds);

    const open = CATALOGUE.filter(
      (q) => !answered.has(q.questionId) && !isAnswered(situation, q.questionId),
    );

    const scored = open.map((question) => {
      let weight = question.priority;
      if (missing.has(question.questionId)) weight -= 20;
      if (result && result.matches.length === 0 && question.priority <= 3) weight -= 10;
      return { question, weight };
    });

    scored.sort((a, b) => a.weight - b.weight || a.question.priority - b.question.priority);
    return scored.slice(0, MAX_FOLLOW_UP_QUESTIONS).map((s) => s.question);
  }

  /** Vollständiger Katalog – für Tests und Dokumentation. */
  catalogue(): AssistantQuestion[] {
    return [...CATALOGUE];
  }
}

export const defaultQuestionPlanner = new AssistantQuestionPlanner();
