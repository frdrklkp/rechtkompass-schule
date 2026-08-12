/**
 * Fehlerklassen für die Embedding-Plattform.
 * Klassifikation entscheidet über automatische Retries.
 */

export type EmbeddingErrorClass =
  | "provider"
  | "rate_limit"
  | "timeout"
  | "authentication"
  | "model_unavailable"
  | "input_too_large"
  | "dimension_mismatch"
  | "persistence"
  | "job_cancelled"
  | "validation"
  | "config";

export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorClass;
  readonly retryable: boolean;
  readonly cause?: unknown;
  constructor(code: EmbeddingErrorClass, message: string, opts?: { retryable?: boolean; cause?: unknown }) {
    super(message);
    this.name = "EmbeddingError";
    this.code = code;
    this.retryable = opts?.retryable ?? defaultRetryable(code);
    this.cause = opts?.cause;
  }
}

function defaultRetryable(code: EmbeddingErrorClass): boolean {
  switch (code) {
    case "rate_limit":
    case "timeout":
    case "provider":
      return true;
    default:
      return false;
  }
}

export class EmbeddingProviderError extends EmbeddingError {
  constructor(message: string, opts?: { cause?: unknown }) { super("provider", message, opts); }
}
export class EmbeddingRateLimitError extends EmbeddingError {
  constructor(message = "Rate limit exceeded", opts?: { cause?: unknown }) {
    super("rate_limit", message, { retryable: true, cause: opts?.cause });
  }
}
export class EmbeddingTimeoutError extends EmbeddingError {
  constructor(message = "Provider timeout", opts?: { cause?: unknown }) {
    super("timeout", message, { retryable: true, cause: opts?.cause });
  }
}
export class EmbeddingAuthenticationError extends EmbeddingError {
  constructor(message = "Authentication failed", opts?: { cause?: unknown }) {
    super("authentication", message, { retryable: false, cause: opts?.cause });
  }
}
export class EmbeddingModelUnavailableError extends EmbeddingError {
  constructor(message: string, opts?: { cause?: unknown }) { super("model_unavailable", message, { retryable: false, cause: opts?.cause }); }
}
export class EmbeddingInputTooLargeError extends EmbeddingError {
  constructor(message: string) { super("input_too_large", message, { retryable: false }); }
}
export class EmbeddingDimensionMismatchError extends EmbeddingError {
  constructor(expected: number, actual: number) {
    super("dimension_mismatch", `Dimension mismatch: expected ${expected}, got ${actual}`, { retryable: false });
  }
}
export class EmbeddingPersistenceError extends EmbeddingError {
  constructor(message: string, opts?: { cause?: unknown }) { super("persistence", message, { retryable: false, cause: opts?.cause }); }
}
export class EmbeddingJobCancelledError extends EmbeddingError {
  constructor(message = "Job cancelled") { super("job_cancelled", message, { retryable: false }); }
}

export function classifyHttpError(status: number, body: string): EmbeddingError {
  if (status === 429) return new EmbeddingRateLimitError(`HTTP 429: ${body.slice(0, 200)}`);
  if (status === 408 || status === 504) return new EmbeddingTimeoutError(`HTTP ${status}`);
  if (status === 401 || status === 403) return new EmbeddingAuthenticationError(`HTTP ${status}`);
  if (status === 400) return new EmbeddingProviderError(`HTTP 400: ${body.slice(0, 200)}`);
  if (status >= 500) return new EmbeddingProviderError(`HTTP ${status}: ${body.slice(0, 200)}`);
  return new EmbeddingProviderError(`HTTP ${status}: ${body.slice(0, 200)}`);
}
