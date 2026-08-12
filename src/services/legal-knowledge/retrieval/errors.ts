/** Retrieval-Fehlerklassen. */
export type RetrievalErrorCode =
  | "invalid_query"
  | "embedding_failed"
  | "keyword_failed"
  | "repository_failed"
  | "validation_failed"
  | "disabled"
  | "config";

export class RetrievalError extends Error {
  readonly code: RetrievalErrorCode;
  readonly cause?: unknown;
  constructor(code: RetrievalErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "RetrievalError";
    this.code = code;
    this.cause = cause;
  }
}

export class RetrievalDisabledError extends RetrievalError {
  constructor(message = "Retrieval ist deaktiviert.") { super("disabled", message); }
}
