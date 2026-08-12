/**
 * Sprint 4.6A – Decision Navigator Engine: Basistypen.
 * Rein technisches Navigationsmodell, keine fachlichen Inhalte.
 */

/** Offene Typliste: bekannte Kernwerte + Erweiterbarkeit über String. */
export type NavigatorStepType =
  | "information"
  | "frage"
  | "analyse"
  | "entscheidung"
  | "dokumentation"
  | "rechtsgrundlage"
  | "vorlage"
  | "abschluss"
  | (string & {});

export const NAVIGATOR_STEP_TYPES = [
  "information",
  "frage",
  "analyse",
  "entscheidung",
  "dokumentation",
  "rechtsgrundlage",
  "vorlage",
  "abschluss",
] as const;

export type NavigatorStepStatus = "pending" | "current" | "completed" | "skipped";

export type NavigatorStatus = "idle" | "running" | "paused" | "cancelled" | "finished";

/** Statische Definition eines Schritts (Template-Ebene). */
export interface NavigatorStepDefinition {
  id: string;
  title: string;
  description: string;
  type: NavigatorStepType;
  /** Optionale Schritte dürfen übersprungen werden. */
  optional?: boolean;
  /** Unsichtbare Schritte werden weder angezeigt noch angesteuert. */
  visible?: boolean;
  metadata?: Record<string, unknown>;
}

/** Laufzeitsicht eines Schritts – von der Engine abgeleitet. */
export interface NavigatorStep {
  id: string;
  title: string;
  description: string;
  type: NavigatorStepType;
  status: NavigatorStepStatus;
  optional: boolean;
  visible: boolean;
  completed: boolean;
  nextStep: string | null;
  previousStep: string | null;
  metadata: Record<string, unknown>;
}

export interface NavigatorFlowDefinition {
  id: string;
  title: string;
  description: string;
  steps: NavigatorStepDefinition[];
}

export interface NavigatorProgress {
  totalSteps: number;
  processedSteps: number;
  openSteps: number;
  percent: number;
  currentStep: string | null;
  lastStep: string | null;
}

/** Serialisierbarer Navigationszustand. */
export interface NavigatorState {
  navigatorId: string;
  workflowId: string;
  flowId: string;
  currentStep: string | null;
  visitedSteps: string[];
  completedSteps: string[];
  skippedSteps: string[];
  startedAt: string;
  updatedAt: string;
  status: NavigatorStatus;
  progress: NavigatorProgress;
  /** Freier, serialisierbarer Kontext für spätere fachliche Integrationen. */
  context: Record<string, unknown>;
}

export type NavigatorEventName =
  | "NavigatorStarted"
  | "StepEntered"
  | "StepCompleted"
  | "StepSkipped"
  | "NavigatorPaused"
  | "NavigatorResumed"
  | "NavigatorCancelled"
  | "NavigatorRestarted"
  | "NavigatorFinished";

export interface NavigatorEvent {
  name: NavigatorEventName;
  navigatorId: string;
  stepId: string | null;
  at: string;
  detail?: Record<string, unknown>;
}

export type NavigatorEventListener = (event: NavigatorEvent) => void;
