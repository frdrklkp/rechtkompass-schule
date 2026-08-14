/**
 * Sprint 4.6F – Assistant-Sitzungsmodell (Assistent → Matching → Navigator).
 *
 * Grundsätze:
 * - Vollständig deterministisch. Keine KI, keine Rechtsauslegung, keine
 *   erfundenen Tatsachen.
 * - Es entsteht keine zweite Situations-, Matching- oder Navigatorlogik. Der
 *   Assistent orchestriert ausschließlich die bestehenden Engines.
 */
import type { SituationCase } from "@/services/situation-analyzer";
import type {
  MatchLocationType,
  MatchRole,
  PracticeCaseMatchResult,
} from "@/services/practice-case-matching";

/** Schemaversion der Assistenten-Sitzung. Änderungen erzwingen Neubeginn. */
export const ASSISTANT_SESSION_VERSION = 1;

/** Speicherort der Sitzung im Browser. */
export const ASSISTANT_SESSION_STORAGE_KEY = "rk:assistant:session:v1";

/** Navigator-/Workflow-Kennungen der Assistenten-Übergabe. */
export const ASSISTANT_NAVIGATOR_ID = "aktueller-vorgang";
export const ASSISTANT_WORKFLOW_ID = "assistent-uebergabe";

/** Kontext-Schlüssel, unter dem die Herkunft im Navigator hinterlegt wird. */
export const ASSISTANT_CONTEXT_KEY = "assistantHandoff";

/** Kontext-Schlüssel der Sitzungsreferenz (Nachvollziehbarkeit der Herkunft). */
export const ASSISTANT_SESSION_REFERENCE_KEY = "assistantSessionReference";

/** Kontext-Schlüssel des ausdrücklich bestätigten Praxisfalls. */
export const ASSISTANT_SELECTED_CASE_KEY = "selectedPracticeCase";

/** Phase, an der der Navigator nach der Übergabe geöffnet wird. */
export const ASSISTANT_HANDOFF_STEP_ID = "analyse";

/**
 * Im Navigator hinterlegte Angaben zum bestätigten Praxisfall. Es werden
 * ausschließlich vorhandene Falldaten übernommen – keine Ergänzungen.
 */
export interface AssistantSelectedCaseContext {
  caseId: string;
  title: string;
  /** Stand des Praxisfalls (Änderungszeitpunkt) als Versionsangabe. */
  version: string | null;
  /** true, wenn ein kuratierter Entscheidungsbaum vorliegt. */
  curated: boolean;
  legalSectionIds: string[];
  templateIds: string[];
  matchLevel: string | null;
  matchScore: number | null;
}

/** Referenz auf die Assistenten-Sitzung im Navigator-Kontext. */
export interface AssistantSessionReference {
  sessionId: string;
  startedAt: string;
  handedOverAt: string;
  answeredQuestionIds: string[];
  coverageLevel: AssistantCoverageLevel | null;
}


export type AssistantPhase =
  | "beschreibung"
  | "struktur"
  | "treffer"
  | "rueckfragen"
  | "uebergabe";

export const ASSISTANT_PHASES: AssistantPhase[] = [
  "beschreibung",
  "struktur",
  "treffer",
  "rueckfragen",
  "uebergabe",
];

export const ASSISTANT_PHASE_LABELS: Record<AssistantPhase, string> = {
  beschreibung: "Fall schildern",
  struktur: "Erfasste Angaben",
  treffer: "Passende Praxisfälle",
  rueckfragen: "Rückfragen",
  uebergabe: "Fall bearbeiten",
};

export type AssistantStatus = "idle" | "running" | "paused" | "handedOff" | "cancelled";

export const ASSISTANT_STATUS_LABELS: Record<AssistantStatus, string> = {
  idle: "bereit",
  running: "in Bearbeitung",
  paused: "pausiert",
  handedOff: "zur Fallbearbeitung übergeben",
  cancelled: "abgebrochen",
};


/** Abdeckungsgrad der Trefferlage. */
export type AssistantCoverageLevel = "high" | "medium" | "low" | "none";

export const ASSISTANT_COVERAGE_LABELS: Record<AssistantCoverageLevel, string> = {
  high: "Hohe Abdeckung",
  medium: "Mittlere Abdeckung",
  low: "Geringe Abdeckung",
  none: "Keine Abdeckung",
};

/** Eine aus der Schilderung abgeleitete Angabe – immer mit Textbelegstelle. */
export interface AssistantFinding {
  /** Feldkennung, z. B. `incident.locationType`. */
  field: string;
  label: string;
  /** Verständlicher Wert für die Anzeige. */
  display: string;
  /** Wörtliche Fundstelle aus der Schilderung (Nachweis, keine Deutung). */
  evidence: string;
}

/** Ergebnis der deterministischen Strukturierung einer freien Schilderung. */
export interface AssistantDescriptionAnalysis {
  wordCount: number;
  category: string | null;
  locationType: MatchLocationType | null;
  roles: MatchRole[];
  repeated: boolean | null;
  ongoing: boolean | null;
  dangerReported: boolean | null;
  witnessesPresent: boolean | null;
  evidencePresent: boolean | null;
  measuresTaken: boolean | null;
  leadershipInformed: boolean | null;
  parentContact: boolean | null;
  findings: AssistantFinding[];
  /** Aspekte, die die Schilderung nicht hergibt. */
  openAspects: string[];
}

export type AssistantQuestionKind = "boolean" | "singleChoice" | "text";

/**
 * Gezielte Rückfrage. `questionId` verweist auf eine Frage des
 * Standardschemas des Situation Analyzers, damit die Antwort unmittelbar in
 * den Sachverhalt zurückfließt.
 */
export interface AssistantQuestion {
  questionId: string;
  title: string;
  help: string;
  kind: AssistantQuestionKind;
  options?: { value: string; label: string }[];
  /** Nachvollziehbarer Grund der Rückfrage. */
  reason: string;
  /** Kleinere Zahl = wichtiger. */
  priority: number;
  /** Pflichtangabe des Sachverhalts. */
  required: boolean;
}

export interface AssistantCoverage {
  level: AssistantCoverageLevel;
  /** 0..100, aus Trefferlage und Erfassungsgrad. */
  score: number;
  reasons: string[];
  /** Fehlende Angaben, die die Trefferlage begrenzen. */
  missing: string[];
  strongMatches: number;
  evaluated: number;
}

export interface AssistantSession {
  version: number;
  sessionId: string;
  navigatorId: string;
  workflowId: string;
  status: AssistantStatus;
  phase: AssistantPhase;
  description: string;
  analysis: AssistantDescriptionAnalysis | null;
  situation: SituationCase | null;
  matchResult: PracticeCaseMatchResult | null;
  coverage: AssistantCoverage | null;
  /** Bereits beantwortete Rückfragen (Schema-Fragekennungen). */
  answeredQuestionIds: string[];
  /** Vom Nutzer gewählter Praxisfall für die Übergabe. */
  selectedCaseId: string | null;
  startedAt: string;
  updatedAt: string;
  handoffAt: string | null;
}

export type AssistantEventName =
  | "AssistantStarted"
  | "DescriptionStructured"
  | "MatchingRequested"
  | "FollowUpAnswered"
  | "HandoffPrepared"
  | "AssistantReset";

export interface AssistantEvent {
  name: AssistantEventName;
  at: string;
  sessionId: string;
  detail?: Record<string, unknown>;
}

export type AssistantEventListener = (event: AssistantEvent) => void;

/** Gründe, aus denen ein Ergebnis veraltet ist. */
export type AssistantStaleReason = "none" | "index_changed" | "situation_changed" | "no_result";

export const ASSISTANT_STALE_MESSAGES: Record<AssistantStaleReason, string | null> = {
  none: null,
  no_result: "Es liegt noch kein Abgleich vor.",
  index_changed:
    "Der Bestand der Praxisfälle hat sich geändert. Bitte den Abgleich erneut ausführen.",
  situation_changed:
    "Die Angaben zum Sachverhalt haben sich geändert. Bitte den Abgleich erneut ausführen.",
};
