/**
 * Sprint 4.6B – Situation Analyzer: Basistypen.
 * Rein strukturelle Erfassung eines Sachverhalts. Keine rechtliche Bewertung.
 */

export const SITUATION_SCHEMA_VERSION = 1;

/** Ausdrückliche Abbildung unbekannter Angaben. */
export type KnowledgeState = "known" | "unknown" | "notApplicable" | "notAnswered";

export type AnswerStatus = "answered" | "unknown" | "notApplicable" | "notAnswered";

export type AnswerSource = "user" | "systemDefault" | "imported" | "derived";

export type SituationStatus =
  | "notStarted"
  | "inProgress"
  | "complete"
  | "paused"
  | "cancelled";

/* ------------------------------- Fragemodell ------------------------------ */

export type SituationQuestionType =
  | "text"
  | "textarea"
  | "boolean"
  | "singleChoice"
  | "multiChoice"
  | "date"
  | "time"
  | "dateTime"
  | "participant"
  | "participants"
  | "location"
  | "evidence"
  | "measures"
  | "information"
  | (string & {});

export type ConditionOperator =
  | "equals"
  | "notEquals"
  | "includes"
  | "exists"
  | "isTrue"
  | "isFalse";

export interface SituationCondition {
  questionId: string;
  operator: ConditionOperator;
  value?: SituationAnswerValue;
}

export interface SituationQuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface SituationQuestionValidation {
  minLength?: number;
  maxLength?: number;
  minSelected?: number;
  maxSelected?: number;
  pattern?: string;
}

export interface SituationQuestionDefinition {
  id: string;
  section: string;
  title: string;
  description?: string;
  type: SituationQuestionType;
  required: boolean;
  visible: boolean;
  order: number;
  options?: SituationQuestionOption[];
  defaultValue?: SituationAnswerValue;
  validation?: SituationQuestionValidation;
  /** Frage erscheint nur, wenn ALLE Bedingungen erfüllt sind. */
  dependsOn?: SituationCondition[];
  /** Frage ist nur verpflichtend, wenn ALLE Bedingungen erfüllt sind. */
  requiredWhen?: SituationCondition[];
  metadata?: Record<string, unknown>;
}

export interface SituationSectionDefinition {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface SituationSchemaDefinition {
  id: string;
  version: number;
  title: string;
  description: string;
  sections: SituationSectionDefinition[];
  questions: SituationQuestionDefinition[];
}

/* ------------------------------ Antwortmodell ----------------------------- */

export type SituationAnswerPrimitive = string | number | boolean | null;
export type SituationAnswerValue = SituationAnswerPrimitive | SituationAnswerPrimitive[];

export interface SituationAnswer {
  questionId: string;
  value: SituationAnswerValue;
  answerStatus: AnswerStatus;
  answeredAt: string | null;
  updatedAt: string;
  source: AnswerSource;
  notes?: string;
}

/* ------------------------------- Fallmodell ------------------------------- */

export type ParticipantRole =
  | "student"
  | "teacher"
  | "schoolLeadership"
  | "parent"
  | "guardian"
  | "schoolStaff"
  | "externalPerson"
  | "unknown"
  | (string & {});

export type AgeGroup = "child" | "adolescent" | "adult" | "unknown" | (string & {});

export interface SituationParticipant {
  id: string;
  displayName: string;
  role: ParticipantRole;
  ageGroup: AgeGroup;
  schoolRelation: string;
  isAffected: boolean;
  isAccused: boolean;
  isWitness: boolean;
  isResponsiblePerson: boolean;
  additionalInformation: string;
}

export interface SituationWitness {
  id: string;
  participantId: string | null;
  displayName: string;
  role: ParticipantRole;
  statementAvailable: boolean;
  statementDocumented: boolean;
  notes: string;
}

export type EvidenceType =
  | "document"
  | "photo"
  | "video"
  | "audio"
  | "message"
  | "email"
  | "witnessStatement"
  | "systemLog"
  | "other"
  | (string & {});

export interface SituationEvidence {
  id: string;
  type: EvidenceType;
  description: string;
  available: boolean;
  secured: boolean;
  storageLocation: string;
  createdAt: string;
  notes: string;
}

export type MeasureType =
  | "conversation"
  | "separation"
  | "parentContact"
  | "report"
  | "documentation"
  | "escalation"
  | "other"
  | (string & {});

export interface SituationMeasure {
  id: string;
  type: MeasureType;
  description: string;
  performedAt: string;
  performedBy: string;
  documented: boolean;
  result: string;
}

export type LocationType =
  | "classroom"
  | "schoolyard"
  | "hallway"
  | "gym"
  | "schoolTrip"
  | "online"
  | "outsideSchool"
  | "unknown"
  | (string & {});

export interface SituationIncident {
  occurredAt: string | null;
  dateKnown: KnowledgeState;
  timeKnown: KnowledgeState;
  location: string;
  locationType: LocationType;
  isOngoing: KnowledgeState;
  wasRepeated: KnowledgeState;
  description: string;
}

export interface SituationDangerInformation {
  acuteDangerReported: KnowledgeState;
  dangerType: string;
  affectedPersons: string[];
  ongoing: KnowledgeState;
  emergencyServicesInvolved: KnowledgeState;
  details: string;
}

export interface SituationDocumentationStatus {
  notesAvailable: KnowledgeState;
  incidentReportAvailable: KnowledgeState;
  conversationRecordAvailable: KnowledgeState;
  parentContactDocumented: KnowledgeState;
  schoolLeadershipInformed: KnowledgeState;
  otherDocumentation: string;
}

export interface SituationUncertainty {
  questionId: string;
  section: string;
  title: string;
  reason: "unknown" | "notAnswered";
}

export interface SituationCompleteness {
  totalRelevantQuestions: number;
  answeredQuestions: number;
  unknownQuestions: number;
  notApplicableQuestions: number;
  missingRequiredQuestions: string[];
  completionPercentage: number;
  isComplete: boolean;
}

export interface SituationCase {
  schemaVersion: number;
  schemaId: string;
  caseId: string;
  navigatorId: string;
  workflowId: string;
  title: string;
  rawDescription: string;
  category: string;
  incident: SituationIncident;
  participants: SituationParticipant[];
  witnesses: SituationWitness[];
  evidence: SituationEvidence[];
  dangerInformation: SituationDangerInformation;
  measuresTaken: SituationMeasure[];
  documentationStatus: SituationDocumentationStatus;
  responsiblePersonsInformed: string[];
  answers: Record<string, SituationAnswer>;
  uncertainties: SituationUncertainty[];
  completeness: SituationCompleteness;
  createdAt: string;
  updatedAt: string;
  status: SituationStatus;
}

/* -------------------------------- Validierung ----------------------------- */

export type SituationIssueCode =
  | "required_missing"
  | "conditional_required_missing"
  | "invalid_date"
  | "invalid_time"
  | "invalid_datetime"
  | "duplicate_participant_id"
  | "unknown_participant_reference"
  | "type_mismatch"
  | "validation_rule";

export interface SituationValidationIssue {
  code: SituationIssueCode;
  questionId: string | null;
  section: string | null;
  message: string;
}

export interface SituationValidationResult {
  valid: boolean;
  issues: SituationValidationIssue[];
}

/* --------------------------------- Events --------------------------------- */

export type SituationEventName =
  | "SituationAnalysisStarted"
  | "SituationDescriptionUpdated"
  | "SituationAnswerChanged"
  | "SituationParticipantAdded"
  | "SituationParticipantRemoved"
  | "SituationWitnessAdded"
  | "SituationWitnessRemoved"
  | "SituationEvidenceAdded"
  | "SituationEvidenceRemoved"
  | "SituationMeasureAdded"
  | "SituationMeasureRemoved"
  | "SituationValidationFailed"
  | "SituationCompleted"
  | "SituationReset";

export interface SituationEvent {
  name: SituationEventName;
  caseId: string;
  at: string;
  detail?: Record<string, unknown>;
}

export type SituationEventListener = (event: SituationEvent) => void;

/** Kontextbereich im Navigator-State. */
export const SITUATION_CONTEXT_KEY = "situation";
