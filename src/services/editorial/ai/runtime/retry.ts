// Retry + Backoff + Timeout Utilities. Provider-unabhängig.

export interface RetryOptions {
  maxAttempts?: number; // inkl. erstem Versuch
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Fehlerklassifikation. Rückgabe true => retryable.
   * Default: 429/5xx/Netzfehler.
   */
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (attempt: number, err: unknown) => void;
}

export class RetryTimeoutError extends Error {
  constructor(msg = "AI request timed out") {
    super(msg);
    this.name = "RetryTimeoutError";
  }
}

function defaultRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { status?: number; code?: string; name?: string };
  if (anyErr.name === "AbortError") return false;
  if (anyErr.status === 429) return true;
  if (typeof anyErr.status === "number" && anyErr.status >= 500) return true;
  if (anyErr.code === "network" || anyErr.code === "ECONNRESET") return true;
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(to);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function withRetry<T>(
  op: (signal: AbortSignal) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const initial = opts.initialDelayMs ?? 300;
  const max = opts.maxDelayMs ?? 4000;
  const factor = opts.factor ?? 2;
  const jitter = opts.jitter ?? true;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const isRetryable = opts.isRetryable ?? defaultRetryable;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const link = opts.signal
      ? () => ctrl.abort(opts.signal!.reason)
      : undefined;
    if (link) opts.signal!.addEventListener("abort", link, { once: true });
    const timeoutHandle = setTimeout(
      () => ctrl.abort(new RetryTimeoutError()),
      timeoutMs,
    );
    try {
      return await op(ctrl.signal);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetryable(err)) throw err;
      opts.onRetry?.(attempt, err);
      const base = Math.min(max, initial * Math.pow(factor, attempt - 1));
      const delay = jitter ? Math.floor(base * (0.5 + Math.random())) : base;
      await sleep(delay, opts.signal);
    } finally {
      clearTimeout(timeoutHandle);
      if (link) opts.signal!.removeEventListener("abort", link);
    }
  }
  throw lastErr;
}
