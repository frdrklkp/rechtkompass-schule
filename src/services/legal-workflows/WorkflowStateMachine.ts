/**
 * Deterministische State Machine für Session und Step.
 * Erlaubte Übergänge sind hier zentralisiert – nirgends sonst.
 */
import { WorkflowError } from "./errors";
import type { WorkflowSessionStatus, WorkflowStepStatus } from "./types";

const SESSION_TRANSITIONS: Record<WorkflowSessionStatus, WorkflowSessionStatus[]> = {
  draft:     ["ready", "cancelled"],
  ready:     ["running", "cancelled"],
  running:   ["paused", "completed", "cancelled"],
  paused:    ["running", "cancelled"],
  completed: [],
  cancelled: [],
};

const STEP_TRANSITIONS: Record<WorkflowStepStatus, WorkflowStepStatus[]> = {
  open:      ["active", "skipped", "blocked"],
  active:    ["completed", "waiting", "blocked", "skipped"],
  waiting:   ["active", "completed", "blocked", "skipped"],
  blocked:   ["open", "active", "skipped"],
  completed: [],
  skipped:   [],
};

export const WorkflowStateMachine = {
  canSession(from: WorkflowSessionStatus, to: WorkflowSessionStatus): boolean {
    return SESSION_TRANSITIONS[from].includes(to);
  },
  assertSession(from: WorkflowSessionStatus, to: WorkflowSessionStatus): void {
    if (!this.canSession(from, to)) {
      throw new WorkflowError("invalid_transition",
        `Session-Übergang ${from} → ${to} ist nicht erlaubt.`);
    }
  },
  canStep(from: WorkflowStepStatus, to: WorkflowStepStatus): boolean {
    return STEP_TRANSITIONS[from].includes(to);
  },
  assertStep(from: WorkflowStepStatus, to: WorkflowStepStatus): void {
    if (!this.canStep(from, to)) {
      throw new WorkflowError("invalid_transition",
        `Step-Übergang ${from} → ${to} ist nicht erlaubt.`);
    }
  },
  terminalSession(s: WorkflowSessionStatus): boolean {
    return s === "completed" || s === "cancelled";
  },
  terminalStep(s: WorkflowStepStatus): boolean {
    return s === "completed" || s === "skipped";
  },
};
