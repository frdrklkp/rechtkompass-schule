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
  INFORMATION: ["was ist", "was bedeutet", "wie funktioniert", "erklar", "was heisst"],
  PERMISSION: ["darf ich", "darf man", "durfen", "erlaubt", "zulassig", "gestattet"],
  OBLIGATION: ["muss ich", "mussen", "verpflicht", "obliegt", "pflicht", "verpflichtung"],
  PROHIBITION: ["darf nicht", "verboten", "unzulassig", "untersagt", "kein recht"],
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
    "notfall", "sofort", "gefahr", "gefahrd", "verletzt", "waffe", "messer",
    "kindeswohl", "misshandl", "selbst verletz", "suizid",
  ],
};

const PARTICIPANT_TRIGGERS: Record<ParticipantTag, string[]> = {
  Schüler: ["schuler", "schulerin", "lernende", "klasse", "kind"],
  Eltern: ["eltern", "mutter", "vater", "erziehungsberechtig", "sorgeberechtig", "familie"],
  Lehrkraft: ["lehrkraft", "lehrer", "lehrerin", "kollege", "kollegin", "padagog", "ich als lehr"],
  Schulleitung: ["schulleit", "direktion", "rektor", "konrektor"],
  Kollegium: ["kollegium", "lehrerzimmer", "gesamtkonferenz"],
  Schulträger: ["schultrager", "trager", "kommune"],
  Ausbildungsbetrieb: ["ausbildungsbetrieb", "betrieb", "ausbilder", "berufsschule"],
  "externe Person": ["externe", "besucher", "polizei", "jugendamt", "anwalt", "presse", "journalist"],
};

const SITUATION_TRIGGERS: Record<SituationTag, string[]> = {
  Unterricht: ["unterricht", "stunde", "klassenraum", "klassenzimmer", "im unterricht"],
  Prüfung: ["prufung", "klausur", "test", "leistungsuberprufung", "abschlusspruf", "abitur", "klassenarbeit"],
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
    "freizeit", "22 uhr", "23 uhr", "24 uhr", "spatabend", "nach dienstschluss", "am wochenende",
  ],
  Schulveranstaltung: ["schulveranstaltung", "schulfest", "elternabend", "tag der offenen tur", "projekttag"],
  Ausbildungsbetrieb: ["ausbildungsbetrieb", "betrieb", "praktikum", "duales system"],
};

const ACTION_TRIGGERS: Record<ActionTag, string[]> = {
  filmen: ["film", "video", "mitschneid", "aufzeichn video"],
  fotografieren: ["foto", "bild", "fotografier", "klassenfoto"],
  aufnehmen: ["aufnahme", "aufnehm", "mitschneid", "aufzeichn"],
  // "fehlt"/"fehlen" bewusst NICHT hier: siehe hasAbsencePattern() weiter unten.
  fehlen: ["unentschuldigt", "schwanz", "abwesenh", "kommt nicht"],
  verspäten: ["verspat", "zu spat", "kommt zu spat"],
  beleidigen: ["beleidig", "beschimpf", "mobbing", "cybermobb", "diffamier", "fertigmach"],
  verweigern: ["verweiger", "weigert", "boykott"],
  täuschen: ["tausch", "spick", "abschreib", "betrug", "cheat", "schummel"],
  kommunizieren: ["schreib", "nachricht", "chatt", "kontaktier", "anruf", "erreichbar", "kommunizier"],
  veröffentlichen: ["veroffentlich", "posten", "hochlad", "teil auf", "teilen auf", "geht online"],
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

/**
 * Fund 2026-08-20: checklist/documentation sind Handlungsempfehlungen für
 * die Nachbearbeitung ("Was ist zu dokumentieren/prüfen?"), keine Beschreibung
 * des tatsächlichen Sachverhalts - sie nennen dabei oft bewusst beide Seiten
 * einer Unterscheidung ("unentschuldigter [oder entschuldigter] Fehlzeiten").
 * Das ließ z. B. bei einem Fall über eine ärztlich begründete Abmeldung vom
 * Sportunterricht dennoch das Handlungs-Tag "fehlen" (unentschuldigtes
 * Fehlen) zuschlagen, nur weil die Checkliste den Begriff zur Abgrenzung
 * erwähnt. Betrifft 53 von 425 Fällen (Stichprobe). Beide Felder werden
 * daher aus der Signal-Extraktion (Intent/Beteiligte/Situation/Handlung)
 * ausgeschlossen; die eigentliche Stichwortsuche in intelligentSearch.ts
 * nutzt eine eigene, unabhängige Haystack-Funktion und ist nicht betroffen.
 */
function collectHay(c: CaseData): string {
  return [
    c.title, c.category, c.subcategory,
    c.shortDescription, c.shortAnswer, c.recommendation, c.legalExplanation,
    ...(c.tags ?? []),
    ...(c.searchTerms ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fund 2026-08-20: reines `hay.includes(trigger)` lässt einen Trigger wie
 * "unterricht" auch innerhalb zusammengesetzter Wörter wie "sportunterricht"
 * zuschlagen. Dadurch wurden "Unterricht" (Situation) und andere Trigger
 * fälschlich als übereinstimmend erkannt, obwohl es sich um ein anderes,
 * durch ein Bestimmungswort geändertes Kompositum handelt - mit der Folge,
 * dass die Situations-Mismatch-Penalty in computeSignalScores() nicht
 * auslöste. Nur eine linke Wortgrenze wird verlangt (kein Zeichen oder ein
 * Nicht-Wortzeichen davor): das lässt Flexionsformen weiterhin zu (z. B.
 * "verspaet" trifft "verspaetete"), verhindert aber das Zuschlagen als
 * Suffix eines größeren Kompositums (z. B. nicht mehr "sportunterricht").
 */
function containsWholeTrigger(hay: string, trigger: string): boolean {
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(trigger)}`);
  return pattern.test(hay);
}

function matchTags<T extends string>(
  hay: string,
  triggers: Record<T, string[]>,
): T[] {
  const found: T[] = [];
  for (const [tag, keys] of Object.entries(triggers) as Array<[T, string[]]>) {
    if (keys.some((k) => containsWholeTrigger(hay, k))) found.push(tag);
  }
  return found;
}

const FEHLEN_PERSON_HINTS = ["schuler", "schulerin", "lernende", "kind", "azubi", "auszubildende"];

/**
 * Fund 2026-08-20: "fehlen"/"fehlt" ist im Deutschen ein Homograph - "der
 * Schüler fehlt" (abwesend) und "das Attest fehlt" (nicht vorhanden) sind
 * dieselbe Wortform, aber fachlich Gegenteiliges. Ein reiner Substring-
 * Trigger auf "fehlt"/"fehlen" ließ daher z. B. einen Fall über ein
 * fehlendes ärztliches Attest fälschlich als "Handlung: fehlen" (im Sinne
 * von Schulabwesenheit) einordnen (betraf Stichprobe: 35 von 425 Fällen
 * enthalten "fehlt"/"fehlen", davon ein relevanter Teil in der
 * "nicht vorhanden"-Bedeutung). Statt eines bloßen Substring-Treffers wird
 * verlangt, dass ein Personenwort (Schüler, Azubi, Kind, …) im Fenster kurz
 * davor steht - das deckt die realen Formulierungen im Bestand ("Ein
 * Schüler fehlt regelmäßig", "Schüler des Berufskollegs fehlt zu einer
 * Klausur") ab, ohne auf "Attest fehlt" oder "es fehlt eine Regelung"
 * anzuschlagen.
 */
function hasAbsencePattern(hay: string): boolean {
  const re = /(?:^|[^a-z0-9])fehl(?:t|en)(?:[^a-z0-9]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay))) {
    const windowStart = Math.max(0, m.index - 45);
    const before = hay.slice(windowStart, m.index);
    if (FEHLEN_PERSON_HINTS.some((p) => containsWholeTrigger(before, p))) return true;
  }
  return false;
}

// ─── Signal-Struktur ───────────────────────────────────────────────────────

export type CaseSignals = {
  intents: IntentTag[];
  participants: ParticipantTag[];
  situations: SituationTag[];
  actions: ActionTag[];
};

function matchActions(hay: string): ActionTag[] {
  const found = matchTags(hay, ACTION_TRIGGERS);
  if (!found.includes("fehlen") && hasAbsencePattern(hay)) found.push("fehlen");
  return found;
}

export function extractCaseSignals(c: CaseData): CaseSignals {
  const hay = normalize(collectHay(c));
  return {
    intents: matchTags(hay, INTENT_TRIGGERS),
    participants: matchTags(hay, PARTICIPANT_TRIGGERS),
    situations: matchTags(hay, SITUATION_TRIGGERS),
    actions: matchActions(hay),
  };
}

export function extractQuerySignals(query: string): CaseSignals {
  const hay = normalize(query);
  return {
    intents: matchTags(hay, INTENT_TRIGGERS),
    participants: matchTags(hay, PARTICIPANT_TRIGGERS),
    situations: matchTags(hay, SITUATION_TRIGGERS),
    actions: matchActions(hay),
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
