/**
 * Sprint 4.6C – Assessment Engine: Basistypen.
 * Deterministische, regelbasierte Bewertung strukturierter Situationsangaben.
 * Keine KI, keine Freitextinterpretation, keine Rechtsauslegung.
 */
import type { SituationCase } from "@/services/situation-analyzer";

export const ASSESSMENT_SCHEMA_VERSION = 1;

/** Kontextbereich im Navigator-State. */
export const ASSESSMENT_CONTEXT_KEY = "assessment";

/* --------------------------------- Status --------------------------------- */

export type AssessmentStatus =
  | "notStarted"
  | "inProgress"
  | "completed"
  | "incomplete"
  | "conflicted"
  | "failed";

export type TrafficLight = "green" | "yellow" | "red" | "unknown";

export type AssessmentSeverity =
  | "none"
  | "low"
  | "moderate"
  | "high"
  | "critical"
  | "unknown";

export type ConfidenceLevel = "low" | "medium" | "high" | "unknown";

export type RulePriority = "critical" | "high" | "normal" | "low";

export type RuleCategory =
  | "danger"
  | "continuity"
  | "repetition"
  | "documentation"
  | "evidence"
  | "completeness"
  | "fallback"
  | (string & {});

/* -------------------------------- Bedingungen ------------------------------ */

export type ConditionOperator =
  | "equals"
  | "notEquals"
  | "isTrue"
  | "isFalse"
  | "exists"
  | "notExists"
  | "includes"
  | "notIncludes"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "isUnknown"
  | "isNotApplicable"
  | "countGreaterThan"
  | "countEquals";

export type ConditionValueType = "string" | "number" | "boolean" | "knowledgeState" | "array" | "none";

export type OperatorGroup = "comparison" | "existence" | "collection" | "knowledge";

export interface AssessmentCondition {
  /** Punktnotierter Pfad in das SituationCase, z. B. "incident.isOngoing". */
  field: string;
  operator: ConditionOperator;
  value?: string | number | boolean | Array<string | number>;
  valueType: ConditionValueType;
  operatorGroup: OperatorGroup;
  negate?: boolean;
}

/* ---------------------------------- Regeln --------------------------------- */

export interface AssessmentRuleResult {
  trafficLightContribution: TrafficLight;
  severityContribution: AssessmentSeverity;
  /** Positive Werte stärken die Datengrundlage, negative schwächen sie. */
  confidenceImpact: number;
  reason: string;
  missingInformation?: AssessmentMissingInformation[];
  limitation?: string;
  flag?: string;
}

export interface AssessmentRule {
  id: string;
  version: number;
  title: string;
  description: string;
  category: RuleCategory;
  priority: RulePriority;
  enabled: boolean;
  /** Alle Bedingungen müssen zutreffen (UND-Verknüpfung). */
  conditions: AssessmentCondition[];
  result: AssessmentRuleResult;
  reasonTemplate: string;
  requiredFields: string[];
  stopProcessing: boolean;
  metadata?: Record<string, unknown>;
}

/* ------------------------------ Ergebnismodell ----------------------------- */

export type ReasonImpact = "critical" | "negative" | "neutral" | "positive" | "informational";

export interface AssessmentReason {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  impact: ReasonImpact;
  priority: RulePriority;
  sourceFields: string[];
  sourceValues: Record<string, unknown>;
  userFacingText: string;
}

export type MissingInformationSeverity = "info" | "relevant" | "critical";

export interface AssessmentMissingInformation {
  field: string;
  label: string;
  reason: string;
  requiredFor: string;
  answerStatus: "unknown" | "notAnswered" | "invalid";
  severity: MissingInformationSeverity;
}

export interface AssessmentMatchedRule {
  ruleId: string;
  version: number;
  title: string;
  priority: RulePriority;
  trafficLightContribution: TrafficLight;
  severityContribution: AssessmentSeverity;
  confidenceImpact: number;
}

export type ConflictType =
  | "contradictory_traffic_lights"
  | "contradictory_input"
  | "ambiguous_field_state"
  | "incompatible_requirements";

export interface AssessmentConflict {
  id: string;
  type: ConflictType;
  description: string;
  ruleIds: string[];
  fields: string[];
  blocksAssessment: boolean;
}

export interface AssessmentConfidence {
  score: number;
  level: ConfidenceLevel;
  reasons: string[];
  dataCompleteness: number;
  ruleCoverage: number;
  uncertaintyCount: number;
}

export interface AssessmentUnresolvedQuestion {
  field: string;
  question: string;
}

export interface AssessmentResult {
  schemaVersion: number;
  assessmentId: string;
  caseId: string;
  navigatorId: string;
  workflowId: string;
  status: AssessmentStatus;
  trafficLight: TrafficLight;
  severity: AssessmentSeverity;
  confidence: AssessmentConfidence;
  summary: string;
  reasons: AssessmentReason[];
  matchedRules: AssessmentMatchedRule[];
  unresolvedQuestions: AssessmentUnresolvedQuestion[];
  missingInformation: AssessmentMissingInformation[];
  conflicts: AssessmentConflict[];
  limitations: string[];
  inputHash: string;
  evaluatedInputHash: string;
  evaluatedAt: string;
  updatedAt: string;
}

/* -------------------------------- Inputmodell ------------------------------ */

export interface AssessmentInput {
  navigatorId: string;
  workflowId: string;
  caseId: string;
  situation: SituationCase;
  assessmentContext: Record<string, unknown>;
  schemaVersion: number;
  evaluatedAt: string;
}

export type AssessmentIssueCode =
  | "situation_missing"
  | "situation_invalid"
  | "situation_incompatible"
  | "rule_definition_invalid";

export interface AssessmentValidationIssue {
  code: AssessmentIssueCode;
  message: string;
  field?: string;
}

export interface AssessmentValidationResult {
  valid: boolean;
  issues: AssessmentValidationIssue[];
}

/* --------------------------- Session-Kontextmodell ------------------------- */

export interface AssessmentContextEntry {
  schemaVersion: number;
  inputSnapshotReference: string;
  inputHash: string;
  result: AssessmentResult | null;
  status: AssessmentStatus;
  evaluatedAt: string | null;
  isStale: boolean;
}

/* ---------------------------------- Events --------------------------------- */

export type AssessmentEventName =
  | "AssessmentStarted"
  | "AssessmentRuleMatched"
  | "AssessmentRuleSkipped"
  | "AssessmentConflictDetected"
  | "AssessmentIncomplete"
  | "AssessmentCompleted"
  | "AssessmentFailed"
  | "AssessmentReset";

export interface AssessmentEvent {
  name: AssessmentEventName;
  caseId: string;
  at: string;
  detail?: Record<string, unknown>;
}

export type AssessmentEventListener = (event: AssessmentEvent) => void;

/* ------------------------------ Textbausteine ------------------------------ */

export const TRAFFIC_LIGHT_LABEL: Record<TrafficLight, string> = {
  red: "Rot – Kritische Merkmale erfasst",
  yellow: "Gelb – Weitere Klärung erforderlich",
  green: "Grün – Keine unmittelbar kritischen Merkmale erfasst",
  unknown: "Unklar – Bewertung nicht möglich",
};

export const TRAFFIC_LIGHT_MEANING: Record<TrafficLight, string> = {
  red: "Nach den erfassten Angaben liegt mindestens ein ausdrücklich als kritisch definiertes Merkmal vor.",
  yellow:
    "Die Situation erfordert erhöhte Aufmerksamkeit, weitere Klärung oder eine zeitnahe Bearbeitung.",
  green:
    "Nach den aktuell erfassten Tatsachen liegt kein Hinweis auf eine unmittelbar kritische Situation vor. Das bedeutet nicht, dass keine weitere Bearbeitung notwendig ist.",
  unknown:
    "Mit den vorhandenen Angaben ist keine belastbare Einstufung möglich.",
};

/** Symbol als zusätzlicher, nicht-farblicher Informationsträger. */
export const TRAFFIC_LIGHT_SYMBOL: Record<TrafficLight, string> = {
  red: "!",
  yellow: "?",
  green: "✓",
  unknown: "–",
};

export const SEVERITY_LABEL: Record<AssessmentSeverity, string> = {
  none: "kein Schweregrad erfasst",
  low: "gering",
  moderate: "mittel",
  high: "hoch",
  critical: "sehr hoch",
  unknown: "nicht bestimmbar",
};

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: "gering",
  medium: "mittel",
  high: "hoch",
  unknown: "nicht bestimmbar",
};

export const STANDARD_LIMITATIONS: string[] = [
  "Die Bewertung basiert ausschließlich auf den eingegebenen strukturierten Angaben.",
  "Die Freitextbeschreibung wird nicht automatisch interpretiert.",
  "Es findet keine juristische Einzelfallprüfung statt.",
  "Die Bewertung ist keine Rechtsberatung.",
  "In dieser Ausbaustufe werden keine Handlungsempfehlungen erzeugt.",
  "Unbekannte oder fehlerhafte Eingaben können das Ergebnis verändern.",
];
