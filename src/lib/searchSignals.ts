/**
 * Deterministische Extraktion fachlicher Signale aus einem Praxisfall
 * bzw. einer Nutzerfrage. Rein clientsafe (keine DB, keine KI).
 *
 * Zentrale Quelle für:
 *  - Intent-Erkennung
 *  - Beteiligte, Situation, Handlung
 *  - Signal-Overlap-Score (positiv)
 *  - Negative Mismatch-Penalty
 *
 * Wird von buildPracticeCaseSearchDocument (Embedding-Text)
 * UND vom Ranking (hybridRanking) verwendet. Keine Duplikation
 * in UI-Komponenten.
 */

import type { CaseData } from "@/data/cases";

// ─── Tag-Typen ─────────────────────────────────────────────────────────────

export type IntentTag =
  | "INFORMATION"
  | "PERMISSION"
  | "OBLIGATION"
  | "PROHIBITION"
  | "CONSEQUENCE"
  | "PROCEDURE"
  | "DOCUMENTATION"
  | "COMMUNICATION"
  | "CONFLICT"
  | "EMERGENCY";

export type ParticipantTag =
  | "Schüler"
  | "Eltern"
  | "Lehrkraft"
  | "Schulleitung"
  | "Kollegium"
  | "Schulträger"
  | "Ausbildungsbetrieb"
  | "externe Person";

export type SituationTag =
  | "Unterricht"
  | "Prüfung"
  | "Pause"
  | "Klassenfahrt"
  | "Lehrerzimmer"
  | "Konferenz"
  | "digitale Kommunikation"
  | "außerdienstliche Zeit"
  | "Schulveranstaltung"
  | "Ausbildungsbetrieb";

export type ActionTag =
  | "filmen"
  | "fotografieren"
  | "aufnehmen"
  | "fehlen"
  | "verspäten"
  | "beleidigen"
  | "verweigern"
  | "täuschen"
  | "kommunizieren"
  | "veröffentlichen"
  | "speichern"
  | "weitergeben"
  | "beaufsichtigen"
  | "bewerten"
  | "anweisen"
  | "dokumentieren";

// ─── Trigger-Wörterbücher (normalisiert: ohne ß/Umlaute) ───────────────────

const INTENT_TRIGGERS: Record<IntentTag, string[]> = {
  INFORMATION: ["was ist", "was bedeutet", "wie funktioniert", "erklaer", "was heisst"],
  PERMISSION: ["darf ich", "darf man", "duerfen", "erlaubt", "zulaessig", "gestattet"],
  OBLIGATION: ["muss ich", "muessen", "verpflicht", "obliegt", "pflicht", "verpflichtung"],
  PROHIBITION: ["darf nicht", "verboten", "unzulaessig", "untersagt", "kein recht"],
  CONSEQUENCE: [
    "was passiert", "welche folge", "konsequenz", "sanktion", "strafe", "haftung", "schadenersatz",
    "ordnungsmassnahme", "disziplin",
  ],
  PROCEDURE: ["wie gehe ich vor", "vorgehen", "verfahren", "ablauf", "schritt", "wie geht das"],
  DOCUMENTATION: ["dokumentier", "protokoll", "aktenvermerk", "schriftlich festhalten", "vermerk"],
  COMMUNICATION: [
    "schreib", "nachricht", "chatt", "kontaktier", "anruf", "erreichbar", "kommunizier",
    "whatsapp", "email", "e-mail", "messenger", "signal", "telegram", "sms", "telefon",
  ],
  CONFLICT: [
    "streit", "beschwerde", "widerspruch", "eskaliert", "droht", "anwalt", "konflikt", "beleidig",
    "mobbing", "cybermobb", "fertigmach",
  ],
  EMERGENCY: [
    "notfall", "sofort", "gefahr", "gefaehrd", "verletzt", "waffe", "messer",
    "kindeswohl", "misshandl", "selbst verletz", "suizid",
  ],
};

const PARTICIPANT_TRIGGERS: Record<ParticipantTag, string[]> = {
  Schüler: ["schueler", "schuelerin", "lernende", "klasse", "kind"],
  Eltern: ["eltern", "mutter", "vater", "erziehungsberechtig", "sorgeberechtig", "familie"],
  Lehrkraft: ["lehrkraft", "lehrer", "lehrerin", "kollege", "kollegin", "paedagog", "ich als lehr"],
  Schulleitung: ["schulleit", "direktion", "rektor", "konrektor"],
  Kollegium: ["kollegium", "lehrerzimmer", "gesamtkonferenz"],
  Schulträger: ["schultraeger", "traeger", "kommune"],
  Ausbildungsbetrieb: ["ausbildungsbetrieb", "betrieb", "ausbilder", "berufsschule"],
  "externe Person": ["externe", "besucher", "polizei", "jugendamt", "anwalt", "presse", "journalist"],
};

const SITUATION_TRIGGERS: Record<SituationTag, string[]> = {
  Unterricht: ["unterricht", "stunde", "klassenraum", "klassenzimmer", "im unterricht"],
  Prüfung: ["pruefung", "klausur", "test", "leistungsueberpruefung", "abschlusspruef", "abitur", "klassenarbeit"],
  Pause: ["pause", "hofpause", "grosse pause"],
  Klassenfahrt: ["klassenfahrt", "exkursion", "wandertag", "studienfahrt", "schulfahrt", "hotelzimmer"],
  Lehrerzimmer: ["lehrerzimmer"],
  Konferenz: ["konferenz", "zeugniskonferenz", "klassenkonferenz", "notenkonferenz"],
  "digitale Kommunikation": [
    "whatsapp", "messenger", "signal", "telegram", "e-mail", "email", "chat", "tiktok",
    "instagram", "sms", "online", "cloud", "digital", "posten", "hochlad",
  ],
  "außerdienstliche Zeit": [
    "abends", "nachts", "wochenende", "feierabend", "ausserhalb der dienstzeit",
    "freizeit", "22 uhr", "23 uhr", "24 uhr", "spaetabend", "nach dienstschluss", "am wochenende",
  ],
  Schulveranstaltung: ["schulveranstaltung", "schulfest", "elternabend", "tag der offenen tuer", "projekttag"],
  Ausbildungsbetrieb: ["ausbildungsbetrieb", "betrieb", "praktikum", "duales system"],
};

const ACTION_TRIGGERS: Record<ActionTag, string[]> = {
  filmen: ["film", "video", "mitschneid", "aufzeichn video"],
  fotografieren: ["foto", "bild", "fotografier", "klassenfoto"],
  aufnehmen: ["aufnahme", "aufnehm", "mitschneid", "aufzeichn"],
  fehlen: ["fehlt", "fehlen", "unentschuldigt", "schwaenz", "abwesenh", "kommt nicht"],
  verspäten: ["verspaet", "zu spaet", "kommt zu spaet"],
  beleidigen: ["beleidig", "beschimpf", "mobbing", "cybermobb", "diffamier", "fertigmach"],
  verweigern: ["verweiger", "weigert", "boykott"],
  täuschen: ["taeusch", "spick", "abschreib", "betrug", "cheat", "schummel"],
  kommunizieren: ["schreib", "nachricht", "chatt", "kontaktier", "anruf", "erreichbar", "kommunizier"],
  veröffentlichen: ["veroeffentlich", "posten", "hochlad", "teil auf", "teilen auf", "geht online"],
  speichern: ["speicher", "abspeicher", "cloud", "server", "usb"],
  weitergeben: ["weitergeb", "weitergab", "weiterleit", "verbreit", "an dritte"],
  beaufsichtigen: ["aufsicht", "beaufsichtig", "aufsichtspflicht"],
  bewerten: ["bewert", "note", "zensur", "leistungsbewert", "benot"],
  anweisen: ["anweis", "weisung", "verpflicht mich", "zwing", "beordert"],
  dokumentieren: ["dokumentier", "protokoll", "aktenvermerk", "vermerk"],
};

// ─── Normalisierung ────────────────────────────────────────────────────────

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[äáàâ]/g, "a")
    .replace(/[öóòô]/g, "o")
    .replace(/[üúùû]/g, "u");
}

function collectHay(c: CaseData): string {
  return [
    c.title, c.category, c.subcategory,
    c.shortDescription, c.shortAnswer, c.recommendation, c.legalExplanation,
    ...(c.checklist ?? []),
    ...(c.documentation ?? []),
    ...(c.tags ?? []),
    ...(c.searchTerms ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function matchTags<T extends string>(
  hay: string,
  triggers: Record<T, string[]>,
): T[] {
  const found: T[] = [];
  for (const [tag, keys] of Object.entries(triggers) as Array<[T, string[]]>) {
    if (keys.some((k) => hay.includes(k))) found.push(tag);
  }
  return found;
}

// ─── Signal-Struktur ───────────────────────────────────────────────────────

export type CaseSignals = {
  intents: IntentTag[];
  participants: ParticipantTag[];
  situations: SituationTag[];
  actions: ActionTag[];
};

export function extractCaseSignals(c: CaseData): CaseSignals {
  const hay = normalize(collectHay(c));
  return {
    intents: matchTags(hay, INTENT_TRIGGERS),
    participants: matchTags(hay, PARTICIPANT_TRIGGERS),
    situations: matchTags(hay, SITUATION_TRIGGERS),
    actions: matchTags(hay, ACTION_TRIGGERS),
  };
}

export function extractQuerySignals(query: string): CaseSignals {
  const hay = normalize(query);
  return {
    intents: matchTags(hay, INTENT_TRIGGERS),
    participants: matchTags(hay, PARTICIPANT_TRIGGERS),
    situations: matchTags(hay, SITUATION_TRIGGERS),
    actions: matchTags(hay, ACTION_TRIGGERS),
  };
}

// ─── Positive Signal-Scores (0..1) ─────────────────────────────────────────

function overlapRatio<T>(a: T[], b: T[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  const inter = b.filter((x) => set.has(x)).length;
  // Overlap relativ zur Query-Menge (was der Suchende erwähnt hat, ist wichtiger)
  return inter / a.length;
}

export type SignalScores = {
  intentScore: number;
  participantScore: number;
  situationScore: number;
  actionScore: number;
  /** Gewichteter Gesamtscore der positiven Signale (0..1). */
  signalScore: number;
  /** Negative Penalty (0..1) — vom Basisscore abzuziehen. */
  negativeMismatchPenalty: number;
  matchedIntents: IntentTag[];
  matchedSituations: SituationTag[];
  matchedActions: ActionTag[];
  matchedParticipants: ParticipantTag[];
  penaltyReasons: string[];
};

/**
 * Vergleicht Query-Signale mit Kandidaten-Signalen und liefert
 * positive Scores + belastbare Negativ-Penalty.
 */
export function computeSignalScores(
  qs: CaseSignals,
  cs: CaseSignals,
): SignalScores {
  const intentScore = overlapRatio(qs.intents, cs.intents);
  const participantScore = overlapRatio(qs.participants, cs.participants);
  const situationScore = overlapRatio(qs.situations, cs.situations);
  const actionScore = overlapRatio(qs.actions, cs.actions);

  // Gewichtung innerhalb des Signal-Scores:
  // Situation und Handlung sind fachlich diskriminativer als Intent oder
  // ein einzelner gemeinsamer Beteiligter.
  const signalScore =
    0.35 * situationScore +
    0.35 * actionScore +
    0.15 * intentScore +
    0.15 * participantScore;

  const matchedIntents = qs.intents.filter((t) => cs.intents.includes(t));
  const matchedSituations = qs.situations.filter((t) => cs.situations.includes(t));
  const matchedActions = qs.actions.filter((t) => cs.actions.includes(t));
  const matchedParticipants = qs.participants.filter((t) => cs.participants.includes(t));

  // ── Negative Mismatch-Penalty ─────────────────────────────────────────
  //
  // Nur belastbare Widersprüche. Fehlende Signale beim Kandidaten sind
  // KEIN harter Widerspruch — nur wenn Kandidat aktiv andere zentrale
  // Signale trägt und keinen der Query-Kerne teilt.
  const penaltyReasons: string[] = [];
  let penalty = 0;

  // Situation: Query nennt zentrale Situation, Kandidat trägt Situations-
  // Signale, aber keines davon deckt sich.
  if (qs.situations.length > 0 && cs.situations.length > 0 && matchedSituations.length === 0) {
    penalty += 0.15;
    penaltyReasons.push(
      `Situation weicht ab (Query: ${qs.situations.join("/")}, Fall: ${cs.situations.join("/")})`,
    );
  }
  // Handlung: analog
  if (qs.actions.length > 0 && cs.actions.length > 0 && matchedActions.length === 0) {
    penalty += 0.15;
    penaltyReasons.push(
      `Handlung weicht ab (Query: ${qs.actions.join("/")}, Fall: ${cs.actions.join("/")})`,
    );
  }
  // Intent: schwächer, weil Intent oft implizit
  if (qs.intents.length > 0 && cs.intents.length > 0 && matchedIntents.length === 0) {
    penalty += 0.05;
    penaltyReasons.push(
      `Anderer Kern-Intent (Query: ${qs.intents.join("/")}, Fall: ${cs.intents.join("/")})`,
    );
  }
  // Beteiligte: nur Penalty, wenn zusätzlich Situation UND Handlung nicht matchen
  if (
    qs.participants.length > 0 &&
    cs.participants.length > 0 &&
    matchedParticipants.length === 0 &&
    matchedSituations.length === 0 &&
    matchedActions.length === 0
  ) {
    penalty += 0.1;
    penaltyReasons.push("Andere Beteiligtenkonstellation ohne Situations-/Handlungsüberlappung");
  }

  return {
    intentScore,
    participantScore,
    situationScore,
    actionScore,
    signalScore: Math.min(1, signalScore),
    negativeMismatchPenalty: Math.min(0.4, penalty),
    matchedIntents,
    matchedSituations,
    matchedActions,
    matchedParticipants,
    penaltyReasons,
  };
}
