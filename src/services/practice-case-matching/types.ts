/**
 * Sprint 4.6E – Practice Case Matching Foundation: Basistypen.
 *
 * Grundsätze:
 * - Rein deterministisch (keine KI, keine Embeddings, keine Freitextinterpretation
 *   über die definierte Token-/Signalgrammatik hinaus).
 * - Keine Praxisfälle fest im Code. Alle Merkmale stammen aus den Falldaten
 *   oder aus einem redaktionell kuratierten Matching-Profil.
 */

/** Schemaversion des Matching-Profils. Änderungen erzwingen Neuaufbau des Index. */
export const MATCHING_PROFILE_VERSION = 1;

/** Schemaversion des Matching-Index. */
export const MATCHING_INDEX_VERSION = 1;

/** Kontextbereich im Navigator-State. */
export const PRACTICE_CASE_MATCH_CONTEXT_KEY = "practiceCaseMatch";

/* ------------------------------- Vokabulare ------------------------------- */

/** Rollenvokabular, kompatibel zu `ParticipantRole` des Situation Analyzers. */
export type MatchRole =
  | "student"
  | "teacher"
  | "schoolLeadership"
  | "parent"
  | "guardian"
  | "schoolStaff"
  | "externalPerson"
  | (string & {});

/** Ortsvokabular, kompatibel zu `LocationType` des Situation Analyzers. */
export type MatchLocationType =
  | "classroom"
  | "schoolyard"
  | "hallway"
  | "gym"
  | "schoolTrip"
  | "online"
  | "outsideSchool"
  | (string & {});

/**
 * Geschlossenes Signalvokabular. Signale werden deterministisch aus dem
 * SituationCase abgeleitet und im Matching-Profil als erwartet, verpflichtend
 * oder ausschließend hinterlegt.
 */
export const MATCH_SIGNALS = [
  "akuteGefahr",
  "gefahrAnhaltend",
  "notdienstBeteiligt",
  "wiederholung",
  "andauernderVorgang",
  "betroffenePerson",
  "beschuldigtePerson",
  "zeugenVorhanden",
  "nachweiseVorhanden",
  "nachweiseGesichert",
  "minderjaehrigBeteiligt",
  "volljaehrigBeteiligt",
  "schuelerBeteiligt",
  "lehrkraftBeteiligt",
  "elternBeteiligt",
  "schulleitungBeteiligt",
  "externeBeteiligt",
  "ortUnterricht",
  "ortSchulgelaende",
  "ortOnline",
  "ortAusserhalbSchule",
  "ortSchulfahrt",
  "dokumentationVorhanden",
  "dokumentationFehlt",
  "schulleitungInformiert",
  "elternkontaktDokumentiert",
  "massnahmenErgriffen",
  "keineMassnahmen",
  "zeitpunktUnbekannt",
] as const;

export type MatchSignal = (typeof MATCH_SIGNALS)[number];

export function isMatchSignal(value: unknown): value is MatchSignal {
  return typeof value === "string" && (MATCH_SIGNALS as readonly string[]).includes(value);
}

/* ---------------------------- Matching-Profil ----------------------------- */

/** Redaktioneller Status des Profils. */
export type MatchProfileStatus = "derived" | "draft" | "review" | "approved";

/** Herkunft des Profils. */
export type MatchProfileOrigin = "derived" | "curated";

export interface MatchingProfile {
  profileVersion: number;
  status: MatchProfileStatus;
  origin: MatchProfileOrigin;
  /** Fachliche Hauptkategorien (mindestens eine). */
  categories: string[];
  subcategories: string[];
  /** Fachliche Schlagwörter (redaktionell oder aus Verknüpfungen). */
  keywords: string[];
  /** Zusätzliche Suchbegriffe/Synonyme. */
  synonyms: string[];
  /** Betroffene bzw. handelnde Rollen. */
  roles: MatchRole[];
  /** Typische Orte des Vorgangs. */
  locationTypes: MatchLocationType[];
  /** Erwartete Situationsmerkmale (bewertet positiv). */
  expectedSignals: MatchSignal[];
  /** Merkmale, die für einen Treffer zwingend vorliegen müssen. */
  requiredSignals: MatchSignal[];
  /** Ausschlussmerkmale: liegt eines vor, ist der Fall kein Treffer. */
  excludedSignals: MatchSignal[];
  /** Verknüpfte Rechtsgrundlagen (nur Nachweis, kein Scoring-Faktor). */
  legalSectionIds: string[];
  ampel: "gruen" | "gelb" | "rot" | null;
  notes: string;
  /**
   * Redaktionelle Steuerung: false schließt den Fall bewusst vom Index aus.
   * Standard ist true.
   */
  matchingEnabled?: boolean;
  /** Redaktionelle Priorität 1–5 (nur Reihenfolge bei Gleichstand, kein Scoring). */
  priority?: number;
  /** Redaktionelle Spezifität 1–5 (Dokumentationswert, kein Scoring). */
  specificity?: number;
  updatedAt: string | null;
  updatedBy: string | null;
}


/* --------------------------- Quelldatensatz ------------------------------- */

export type PracticeCaseStatus = "draft" | "review" | "published" | "archived";

/**
 * Neutrale Projektion eines Praxisfalls. Wird aus der Datenbank oder aus
 * statischen Falldaten erzeugt; die Matching-Schicht kennt keine Datenquelle.
 */
export interface PracticeCaseSource {
  id: string;
  title: string;
  status: PracticeCaseStatus;
  ampel: "gruen" | "gelb" | "rot";
  category: string | null;
  subcategory: string | null;
  shortDescription: string | null;
  shortAnswer: string | null;
  recommendation: string | null;
  responsibilities: string | null;
  legalExplanation: string | null;
  checklist: string[];
  documentation: string[];
  keywords: string[];
  legalSectionIds: string[];
  templateIds: string[];
  hasDecisionTree: boolean;
  updatedAt: string | null;
  /** Redaktionell gepflegtes Profil, falls vorhanden. */
  curatedProfile: Partial<MatchingProfile> | null;
}

/* ------------------------------ Reifegrad -------------------------------- */

export type MatchReadinessLevel = "ready" | "partial" | "notReady";

export interface MatchReadinessCheck {
  id: string;
  label: string;
  required: boolean;
  passed: boolean;
  hint: string;
}

export interface MatchReadinessResult {
  caseId: string;
  level: MatchReadinessLevel;
  /** 0..100, gewichtet über alle Prüfungen. */
  score: number;
  checks: MatchReadinessCheck[];
  missingRequired: string[];
  indexable: boolean;
}

/* -------------------------------- Index ---------------------------------- */

export interface PracticeCaseIndexEntry {
  caseId: string;
  title: string;
  status: PracticeCaseStatus;
  ampel: "gruen" | "gelb" | "rot";
  profile: MatchingProfile;
  /** Normalisierte Tokens aus Titel, Kategorien, Schlagwörtern, Synonymen. */
  tokens: string[];
  readiness: MatchReadinessResult;
  profileHash: string;
  indexedAt: string;
}

export interface PracticeCaseIndexSkip {
  caseId: string;
  title: string;
  reason: "not_published" | "not_indexable" | "invalid_profile";
  details: string[];
}

export interface PracticeCaseIndexStats {
  sourceCount: number;
  publishedCount: number;
  indexedCount: number;
  skippedCount: number;
  curatedCount: number;
  derivedCount: number;
  approvedCount: number;
  byCategory: Array<{ category: string; count: number }>;
  readiness: { ready: number; partial: number; notReady: number };
}

export interface PracticeCaseMatchIndex {
  indexVersion: number;
  profileVersion: number;
  builtAt: string;
  /** Reproduzierbarer Hash über alle Einträge. */
  indexHash: string;
  entries: PracticeCaseIndexEntry[];
  skipped: PracticeCaseIndexSkip[];
  stats: PracticeCaseIndexStats;
}

/** Ergebnis eines Index-Updates (Delta gegenüber vorherigem Index). */
export interface PracticeCaseIndexDelta {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
  indexHashBefore: string | null;
  indexHashAfter: string;
}

/* ------------------------- Situationsmerkmale ---------------------------- */

export interface SituationMatchFeatures {
  situationId: string;
  categoryHints: string[];
  tokens: string[];
  roles: MatchRole[];
  locationTypes: MatchLocationType[];
  signals: MatchSignal[];
  /** Merkmale, zu denen keine belastbare Angabe vorliegt. */
  unknownAspects: string[];
  /** Vollständigkeit der Situationserfassung in Prozent. */
  completionPercentage: number;
}

/* --------------------------------- Match --------------------------------- */

export type MatchLevel = "strong" | "moderate" | "weak" | "none";

export type MatchDimension =
  | "category"
  | "subcategory"
  | "keywords"
  | "roles"
  | "signals"
  | "location";

export interface MatchDimensionScore {
  dimension: MatchDimension;
  weight: number;
  /** 0..1 Erfüllungsgrad der Dimension. */
  ratio: number;
  /** Gewichteter Punktwert. */
  points: number;
  matched: string[];
  missed: string[];
}

export interface MatchReason {
  code:
    | "category_match"
    | "subcategory_match"
    | "keyword_match"
    | "role_match"
    | "signal_match"
    | "location_match"
    | "required_signal_missing"
    | "excluded_signal_present"
    | "incomplete_situation"
    | "no_overlap";
  label: string;
  detail: string;
  positive: boolean;
}

export interface PracticeCaseMatch {
  caseId: string;
  title: string;
  ampel: "gruen" | "gelb" | "rot";
  /** 0..100 */
  score: number;
  level: MatchLevel;
  /** 0..100, reduziert durch unklare Angaben. */
  confidence: number;
  dimensions: MatchDimensionScore[];
  reasons: MatchReason[];
  excluded: boolean;
  exclusionReasons: string[];
  profileStatus: MatchProfileStatus;
}

export interface PracticeCaseMatchResult {
  situationId: string;
  matchedAt: string;
  inputHash: string;
  indexHash: string;
  indexVersion: number;
  matches: PracticeCaseMatch[];
  excluded: PracticeCaseMatch[];
  /** Merkmale, die die Trefferqualität begrenzen. */
  limitations: string[];
  features: SituationMatchFeatures;
  stats: { evaluated: number; excludedCount: number; strong: number; moderate: number; weak: number };
}

/* --------------------------------- Events -------------------------------- */

export type PracticeCaseMatchEventName =
  | "MatchIndexBuilt"
  | "MatchIndexUpdated"
  | "MatchProfileDerived"
  | "MatchProfileValidationFailed"
  | "MatchingExecuted"
  | "MatchingSkipped";

export interface PracticeCaseMatchEvent {
  name: PracticeCaseMatchEventName;
  at: string;
  detail?: Record<string, unknown>;
}

export type PracticeCaseMatchEventListener = (event: PracticeCaseMatchEvent) => void;

/* ------------------------------ Validierung ------------------------------ */

export type MatchProfileIssueCode =
  | "missing_category"
  | "missing_keywords"
  | "unknown_signal"
  | "signal_conflict"
  | "duplicate_entry"
  | "version_mismatch";

export interface MatchProfileIssue {
  code: MatchProfileIssueCode;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface MatchProfileValidationResult {
  valid: boolean;
  issues: MatchProfileIssue[];
}
