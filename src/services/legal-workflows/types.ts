/**
 * Sprint 4.3 – Data-Driven Workflow Platform.
 * Alle Typen der Workflow-Engine. Rein datengetrieben.
 */

export type WorkflowTemplateStatus =
  | "draft" | "in_review" | "approved" | "published" | "archived";

export type WorkflowPublicationTier = "internal" | "public";

export type WorkflowSessionStatus =
  | "draft" | "ready" | "running" | "paused" | "completed" | "cancelled";

export type WorkflowStepStatus =
  | "open" | "active" | "waiting" | "completed" | "skipped" | "blocked";

export type WorkflowStepType =
  | "information" | "decision" | "action" | "document"
  | "review" | "communication" | "wait";

export type WorkflowPriority = "low" | "normal" | "high" | "critical";
export type WorkflowRiskLevel = "low" | "medium" | "high";

export type WorkflowRole =
  | "teacher" | "class_lead" | "principal" | "deputy"
  | "office" | "social_worker" | "admin";

export interface WorkflowCategory {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  sortOrder: number;
}

export interface WorkflowChecklistItem {
  id: string;
  sortOrder: number;
  title: string;
  isRequired: boolean;
}

export interface WorkflowDocumentRef {
  id: string;
  templateSlug: string;
  title: string;
  note?: string | null;
}

export interface WorkflowRoleAssignment {
  id: string;
  role: WorkflowRole;
  canEdit: boolean;
  canComplete: boolean;
}

export interface WorkflowSourceRef {
  id: string;
  legalSectionId?: string | null;
  citationHint?: string | null;
  note?: string | null;
}

export interface WorkflowStep {
  id: string;
  templateId: string;
  phaseId: string;
  sortOrder: number;
  title: string;
  description?: string | null;
  goal?: string | null;
  stepType: WorkflowStepType;
  priority: WorkflowPriority;
  isRequired: boolean;
  estimatedMinutes?: number | null;
  primaryRole?: WorkflowRole | null;
  riskLevel: WorkflowRiskLevel;
  dependsOn: string[]; // step ids
  checklists: WorkflowChecklistItem[];
  documents: WorkflowDocumentRef[];
  roles: WorkflowRoleAssignment[];
  sources: WorkflowSourceRef[];
}

export interface WorkflowPhase {
  id: string;
  templateId: string;
  sortOrder: number;
  title: string;
  description?: string | null;
  isRequired: boolean;
  completionCondition?: string | null;
  steps: WorkflowStep[];
}

export interface WorkflowRule {
  id: string;
  templateId: string;
  whenType: string;
  whenRef?: string | null;
  thenAction: string;
  thenRef?: string | null;
  priority: number;
}

export interface WorkflowTemplate {
  id: string;
  categoryId?: string | null;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  workflowStatus: WorkflowTemplateStatus;
  publicationTier: WorkflowPublicationTier;
  currentVersionId?: string | null;
  phases: WorkflowPhase[];
  rules: WorkflowRule[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowTemplateVersion {
  id: string;
  templateId: string;
  version: number;
  snapshot: WorkflowTemplate;
  createdAt: string;
  createdBy?: string | null;
}

export interface WorkflowChecklistState {
  itemId: string;
  done: boolean;
  note?: string;
  at?: string;
  by?: string;
}

export interface WorkflowExecutionStep {
  id: string;
  sessionId: string;
  stepId: string;
  status: WorkflowStepStatus;
  checklistState: WorkflowChecklistState[];
  note?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface WorkflowExecutionSession {
  id: string;
  templateId: string;
  templateVersionId?: string | null;
  userId: string;
  status: WorkflowSessionStatus;
  context: Record<string, unknown>;
  startedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  steps: WorkflowExecutionStep[];
}

export type WorkflowEventType =
  | "workflow_started"
  | "workflow_completed"
  | "workflow_cancelled"
  | "workflow_paused"
  | "workflow_resumed"
  | "workflow_blocked"
  | "workflow_step_started"
  | "workflow_step_completed"
  | "workflow_step_skipped"
  | "workflow_step_blocked";

export interface WorkflowEvent {
  id: string;
  sessionId: string;
  eventType: WorkflowEventType;
  actor?: string | null;
  payload: Record<string, unknown>;
  at: string;
}

export interface WorkflowRecommendation {
  stepId: string;
  reason: string;
  priority: WorkflowPriority;
  riskLevel: WorkflowRiskLevel;
}

export interface WorkflowProgress {
  workflowPercent: number;
  requiredOpenSteps: number;
  estimatedRemainingMinutes: number;
  phases: Array<{ phaseId: string; percent: number; requiredOpen: number }>;
}

export interface WorkflowValidationIssue {
  code: string;
  message: string;
  ref?: string;
}

export interface WorkflowValidationReport {
  valid: boolean;
  issues: WorkflowValidationIssue[];
  reachableStepIds: string[];
  cycles: string[][];
}
