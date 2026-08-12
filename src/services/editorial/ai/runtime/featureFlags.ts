// Feature Flags für den AI-Layer. Environment-gesteuert (server) oder
// setzbar zur Laufzeit (in-memory). Bewusst schlank – kein Provider-System.

type FlagValue = boolean | string | number;

const store = new Map<string, FlagValue>();

export const AI_FLAGS = {
  /** Wenn false: nur MockProvider verwenden (z. B. für Tests/Preview ohne Key). */
  ENABLE_GATEWAY: "ai.gateway.enable",
  /** Wenn true: Retry-Kette aktivieren. */
  ENABLE_RETRY: "ai.retry.enable",
  /** Wenn true: Fallback-Kette aus Router verwenden. */
  ENABLE_FALLBACK: "ai.fallback.enable",
  /** Wenn true: In-Memory Telemetrie aktiv. */
  ENABLE_TELEMETRY: "ai.telemetry.enable",
  /** Wenn true: Structured Output erzwingt Schemavalidierung. */
  ENFORCE_SCHEMA: "ai.schema.enforce",
} as const;

const DEFAULTS: Record<string, FlagValue> = {
  [AI_FLAGS.ENABLE_GATEWAY]: true,
  [AI_FLAGS.ENABLE_RETRY]: true,
  [AI_FLAGS.ENABLE_FALLBACK]: true,
  [AI_FLAGS.ENABLE_TELEMETRY]: true,
  [AI_FLAGS.ENFORCE_SCHEMA]: true,
};

function readEnv(name: string): FlagValue | undefined {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    if (!env) return undefined;
    const key = name.toUpperCase().replace(/\./g, "_"); // ai.gateway.enable => AI_GATEWAY_ENABLE
    const v = env[key];
    if (v === undefined) return undefined;
    if (v === "true") return true;
    if (v === "false") return false;
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return n;
    return v;
  } catch {
    return undefined;
  }
}

export function getFlag<T extends FlagValue = FlagValue>(name: string): T {
  if (store.has(name)) return store.get(name) as T;
  const fromEnv = readEnv(name);
  if (fromEnv !== undefined) return fromEnv as T;
  return DEFAULTS[name] as T;
}

export function setFlag(name: string, value: FlagValue): void {
  store.set(name, value);
}

export function resetFlags(): void {
  store.clear();
}
