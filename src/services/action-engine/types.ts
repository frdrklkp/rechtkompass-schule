/**
 * Sprint 4.6D – Action Engine: Basistypen.
 * Deterministische Ableitung priorisierter Handlungsschritte aus SituationCase
 * und AssessmentResult. Keine KI, keine Rechtsauslegung, keine Dokumentengenerierung.
 */
import type { SituationCase } from "@/services/situation-analyzer";
import type {
  AssessmentResult,
  AssessmentSeverity,
  AssessmentStatus,
  ConfidenceLevel,
  TrafficLight,
} from "@/services/assessment-engine";

export const ACTION_SCHEMA_VERSION = 1;

/** Kontextbereich im Navigator-State. */
export const ACTION_CONTEXT_KEY = "actions";

/* --------------------------------- Basis --------------------------------- */

export type ActionGroup = "now" | "today" | "later" | "optional";

export type ActionPriority = "critical" | "high" | "normal" | "low";

export type ActionStatus =
  | "open"
  | "inProgress"
  | "completed"
  | "skipped"
  | "blocked"
  | "notApplicable"
  | "cancelled";

export type ActionPlanStatus =
  | "notGenerated"
  | "generated"
  | "inProgress"
  | "completed"
  | "incomplete"
  | "conflicted"
  | "stale"
  | "failed";

/** Offen erweiterbare Rollenunion – es werden nie konkrete Personen zugeordnet. */
export type ResponsibleRole =
  | "teacher"
  | "classTeacher"
  | "schoolLeadership"
  | "departmentLeadership"
  | "counsellingTeacher"
  | "schoolSocialWork"
  | "secretariat"
  | "dataProtectionOfficer"
  | "safetyOfficer"
  | "externalAuthority"
  | "emergencyServices"
  | "guardian"
  | "other"
  | "unknown"
  | (string & {});

export type ActionEffort = "low" | "medium" | "high" | "unknown";

export type ActionRuleCategory =
  | "safety"
  | "clarification"
  | "documentation"
  | "coordination"
  | "followUp"
  | "fallback"
  | (string & {});

/* ------------------------------- Bedingungen ------------------------------ */

export type ActionConditionSource = "situation" | "assessment" | "actionContext";

export type ActionConditionOperator =
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
  | "countEquals"
  | "trafficLightIs"
  | "severityIs"
  | "confidenceLevelIs"
  | "assessmentStatusIs"
  | "ruleMatched"
  | "reasonExists";

export type ActionConditionValueType =
  | "string"
  | "number"
  | "boolean"
  | "knowledgeState"
  | "array"
  | "none";

export interface ActionCondition {
  source: ActionConditionSource;
  /** Punktnotierter Pfad innerhalb der Quelle, z. B. "incident.isOngoing". */
  field: string;
  operator: ActionConditionOperator;
  value?: string | number | boolean | Array<string | number>;
  valueType: ActionConditionValueType;
  negate?: boolean;
}

/* --------------------------------- Trigger -------------------------------- */

export type ActionTriggerType =
  | "assessmentTrafficLight"
  | "assessmentRule"
  | "situationFact"
  | "progress"
  | "fallback";

export interface ActionTrigger {
  triggerType: ActionTriggerType;
  assessmentRuleIds: string[];
  assessmentReasonIds: string[];
  trafficLight: TrafficLight;
  severity: AssessmentSeverity;
  sourceFields: string[];
  userFacingReason: string;
}

export interface ActionReason {
  ruleId: string;
  title: string;
  userFacingText: string;
}

/* ----------------------------- Voraussetzungen ---------------------------- */

export interface ActionPrerequisite {
  /** Fachliche ID einer anderen Maßnahme oder ein Datenfeld. */
  type: "action" | "field";
  reference: string;
  label: string;
  fulfilled: boolean;
}

export interface ActionCompletionData {
  completedAt: string | null;
  completedByRole: ResponsibleRole | null;
  note: string;
  result: string;
  confirmation: boolean;
  /** Begründung für „übersprungen“ oder „nicht zutreffend“. */
  justification: string;
}

/* -------------------------------- Maßnahme -------------------------------- */

export interface ActionItem {
  id: string;
  /** Stabile fachliche ID zur Zusammenführung und Statusübernahme. */
  actionKey: string;
  ruleId: string;
  ruleIds: string[];
  version: number;
  title: string;
  description: string;
  group: ActionGroup;
  priority: ActionPriority;
  status: ActionStatus;
  required: boolean;
  visible: boolean;
  responsibleRole: ResponsibleRole;
  alternativeResponsibleRoles: ResponsibleRole[];
  trigger: ActionTrigger;
  reason: ActionReason[];
  prerequisites: ActionPrerequisite[];
  dependencies: string[];
  blocks: string[];
  blockedReason: string | null;
  estimatedEffort: ActionEffort;
  documentationRequired: boolean;
  confirmationRequired: boolean;
  allowSkip: boolean;
  allowNotApplicable: boolean;
  completionData: ActionCompletionData;
  sourceFields: string[];
  /** Nach Neugenerierung: Inhalt hat sich wesentlich geändert, Status prüfen. */
  carryOverReviewRequired: boolean;
  /** Maßnahme entfällt im aktuellen Plan, bleibt im Verlauf erhalten. */
  noLongerCurrent: boolean;
  /** Stabiler Hash über die inhaltsrelevanten Felder. */
  signature: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------- Regeln -------------------------------- */

export interface ActionTemplate {
  actionKey: string;
  title: string;
  description: string;
  group: ActionGroup;
  priority: ActionPriority;
  required: boolean;
  responsibleRole: ResponsibleRole;
  alternativeResponsibleRoles?: ResponsibleRole[];
  dependsOn?: string[];
  prerequisites?: Array<Omit<ActionPrerequisite, "fulfilled">>;
  estimatedEffort?: ActionEffort;
  documentationRequired?: boolean;
  confirmationRequired?: boolean;
  allowSkip?: boolean;
  allowNotApplicable?: boolean;
  triggerType: ActionTriggerType;
  userFacingReason: string;
  sourceFields: string[];
  metadata?: Record<string, unknown>;
}

export interface ActionRule {
  id: string;
  version: number;
  title: string;
  description: string;
  category: ActionRuleCategory;
  enabled: boolean;
  priority: ActionPriority;
  /** Alle Bedingungen müssen zutreffen (UND-Verknüpfung). */
  conditions: ActionCondition[];
  actions: ActionTemplate[];
  requiredAssessmentStatus: AssessmentStatus[];
  requiredFields: string[];
  stopProcessing: boolean;
  metadata?: Record<string, unknown>;
}

/* -------------------------------- Konflikte ------------------------------- */

export type ActionConflictType =
  | "contradictory_actions"
  | "duplicate_priority_mismatch"
  | "dependency_cycle"
  | "required_and_not_applicable"
  | "responsibility_conflict"
  | "missing_assessment_reason"
  | "missing_required_field";

export interface ActionConflict {
  id: string;
  type: ActionConflictType;
  description: string;
  actionKeys: string[];
  ruleIds: string[];
  blocksPlan: boolean;
}

export interface ActionMissingPrerequisite {
  actionKey: string;
  actionTitle: string;
  reference: string;
  label: string;
  reason: string;
}

/* -------------------------------- Fortschritt ----------------------------- */

export interface ActionProgress {
  totalActions: number;
  requiredActions: number;
  optionalActions: number;
  completedActions: number;
  openActions: number;
  blockedActions: number;
  skippedActions: number;
  completionPercentage: number;
  requiredCompletionPercentage: number;
  isComplete: boolean;
}

/* ----------------------------------- Plan --------------------------------- */

export interface ActionGroupView {
  group: ActionGroup;
  label: string;
  description: string;
  actionKeys: string[];
}

export interface ActionPlan {
  schemaVersion: number;
  actionPlanId: string;
  caseId: string;
  navigatorId: string;
  workflowId: string;
  status: ActionPlanStatus;
  assessmentId: string;
  assessmentInputHash: string;
  generatedFromAssessmentHash: string;
  sourceAssessmentHash: string;
  currentAssessmentHash: string;
  rulesVersionHash: string;
  groups: ActionGroupView[];
  actions: ActionItem[];
  /** Entfallene Maßnahmen früherer Generationen – keine stille Löschung. */
  history: ActionItem[];
  conflicts: ActionConflict[];
  missingPrerequisites: ActionMissingPrerequisite[];
  limitations: string[];
  progress: ActionProgress;
  isStale: boolean;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------- Inputmodell ----------------------------- */

export interface ActionInput {
  navigatorId: string;
  workflowId: string;
  caseId: string;
  situation: SituationCase;
  assessment: AssessmentResult;
  /** Zusätzlicher, rein struktureller Kontext (z. B. Bearbeitungsstand). */
  actionContext: Record<string, unknown>;
  schemaVersion: number;
  generatedAt: string;
  /** Wird die Bewertung als veraltet geführt? */
  assessmentIsStale?: boolean;
}

export type ActionIssueCode =
  | "situation_missing"
  | "situation_invalid"
  | "assessment_missing"
  | "assessment_stale"
  | "assessment_conflicted"
  | "assessment_status_not_evaluable"
  | "rule_definition_invalid"
  | "plan_incompatible";

export interface ActionValidationIssue {
  code: ActionIssueCode;
  message: string;
  field?: string;
}

export interface ActionValidationResult {
  valid: boolean;
  issues: ActionValidationIssue[];
}

/* --------------------------- Session-Kontextmodell ------------------------ */

export interface ActionContextEntry {
  schemaVersion: number;
  plan: ActionPlan | null;
  status: ActionPlanStatus;
  sourceAssessmentId: string;
  sourceAssessmentHash: string;
  rulesVersionHash: string;
  isStale: boolean;
  generatedAt: string | null;
  updatedAt: string | null;
}

/* ----------------------------------- Delta -------------------------------- */

export interface ActionPlanDelta {
  added: ActionItem[];
  unchanged: ActionItem[];
  changed: Array<{ previous: ActionItem; next: ActionItem }>;
  removed: ActionItem[];
}

/* ---------------------------------- Events -------------------------------- */

export type ActionEventName =
  | "ActionPlanGenerationStarted"
  | "ActionRuleMatched"
  | "ActionCreated"
  | "ActionUpdated"
  | "ActionCompleted"
  | "ActionReopened"
  | "ActionSkipped"
  | "ActionMarkedNotApplicable"
  | "ActionBlocked"
  | "ActionConflictDetected"
  | "ActionPlanGenerated"
  | "ActionPlanRegenerated"
  | "ActionPlanMarkedStale"
  | "ActionPlanCompleted"
  | "ActionPlanFailed"
  | "ActionPlanReset";

export interface ActionEvent {
  name: ActionEventName;
  caseId: string;
  at: string;
  detail?: Record<string, unknown>;
}

export type ActionEventListener = (event: ActionEvent) => void;

/* ------------------------------ Textbausteine ----------------------------- */

export const ACTION_GROUP_LABEL: Record<ActionGroup, string> = {
  now: "Jetzt",
  today: "Heute",
  later: "Später",
  optional: "Optional",
};

export const ACTION_GROUP_DESCRIPTION: Record<ActionGroup, string> = {
  now: "Unmittelbar zu prüfen oder zu veranlassen.",
  today: "Zeitnah am selben Arbeitstag zu bearbeiten.",
  later: "Nachgelagerte Bearbeitung, Nachverfolgung oder Vorbereitung.",
  optional: "Ergänzende Schritte, die nicht verpflichtend sind.",
};

export const ACTION_GROUP_ORDER: ActionGroup[] = ["now", "today", "later", "optional"];

export const ACTION_PRIORITY_LABEL: Record<ActionPriority, string> = {
  critical: "sehr hoch",
  high: "hoch",
  normal: "mittel",
  low: "gering",
};

export const ACTION_PRIORITY_ORDER: Record<ActionPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  open: "offen",
  inProgress: "in Bearbeitung",
  completed: "erledigt",
  skipped: "übersprungen",
  blocked: "blockiert",
  notApplicable: "nicht zutreffend",
  cancelled: "nicht mehr aktuell",
};

export const ACTION_PLAN_STATUS_LABEL: Record<ActionPlanStatus, string> = {
  notGenerated: "noch nicht erstellt",
  generated: "erstellt",
  inProgress: "in Bearbeitung",
  completed: "alle verpflichtenden Schritte dokumentiert",
  incomplete: "unvollständig",
  conflicted: "widersprüchlich",
  stale: "nicht mehr aktuell",
  failed: "fehlgeschlagen",
};

export const RESPONSIBLE_ROLE_LABEL: Record<string, string> = {
  teacher: "Lehrkraft",
  classTeacher: "Klassenleitung",
  schoolLeadership: "Schulleitung",
  departmentLeadership: "Abteilungs- oder Bereichsleitung",
  counsellingTeacher: "Beratungslehrkraft",
  schoolSocialWork: "Schulsozialarbeit",
  secretariat: "Sekretariat",
  dataProtectionOfficer: "Datenschutzbeauftragte Person",
  safetyOfficer: "Sicherheitsbeauftragte Person",
  externalAuthority: "Externe Stelle oder Behörde",
  emergencyServices: "Notfall- oder Rettungsstelle",
  guardian: "Erziehungsberechtigte Person",
  other: "Andere Rolle",
  unknown: "Rolle noch offen",
};

export function labelForRole(role: ResponsibleRole): string {
  return RESPONSIBLE_ROLE_LABEL[role] ?? String(role);
}

export const ACTION_EFFORT_LABEL: Record<ActionEffort, string> = {
  low: "gering",
  medium: "mittel",
  high: "hoch",
  unknown: "nicht eingeschätzt",
};

export const ACTION_STANDARD_LIMITATIONS: string[] = [
  "Die vorgeschlagenen Schritte basieren ausschließlich auf den erfassten Angaben und der aktuellen Bewertung.",
  "Die Vorschläge ersetzen keine Einzelfallprüfung.",
  "Zuständigkeiten können schul- oder fallbezogen abweichen; genannt werden nur möglicherweise zuständige Rollen.",
  "Bei neuen Informationen muss die Bewertung erneut ausgeführt werden.",
  "Die Reihenfolge kann aufgrund örtlicher Vorgaben abweichen.",
  "Es erfolgt in dieser Ausbaustufe keine Verknüpfung mit konkreten Rechtsgrundlagen.",
  "Es erfolgt in dieser Ausbaustufe keine automatische Dokumentengenerierung.",
];

export type { AssessmentResult, TrafficLight, AssessmentSeverity, ConfidenceLevel };
