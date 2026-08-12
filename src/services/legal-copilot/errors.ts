/** Fehlerklassen der Copilot-Domäne. */
export type CopilotErrorCode =
  | "invalid_input"
  | "disabled"
  | "retrieval_failed"
  | "no_sources"
  | "prompt_failed"
  | "llm_failed"
  | "answer_invalid"
  | "hallucination_detected"
  | "safety_block";

export class CopilotError extends Error {
  readonly code: CopilotErrorCode;
  readonly cause?: unknown;
  constructor(code: CopilotErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "CopilotError";
    this.code = code;
    this.cause = cause;
  }
}

export class CopilotDisabledError extends CopilotError {
  constructor(msg = "Legal Copilot ist deaktiviert.") { super("disabled", msg); }
}
