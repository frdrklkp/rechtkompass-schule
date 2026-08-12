/** Fehlerklassen der Workflow-Domäne. */
export type WorkflowErrorCode =
  | "invalid_input"
  | "disabled"
  | "not_found"
  | "invalid_state"
  | "invalid_transition"
  | "step_blocked"
  | "validation_failed"
  | "forbidden";

export class WorkflowError extends Error {
  readonly code: WorkflowErrorCode;
  readonly cause?: unknown;
  constructor(code: WorkflowErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
    this.cause = cause;
  }
}
