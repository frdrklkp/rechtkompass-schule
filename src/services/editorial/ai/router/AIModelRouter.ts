// Taskbasiertes Routing + konfigurierbare Fallback-Kette + Retry + Telemetrie
// + Schema-Validierung. Ausschließlicher Zugangspunkt für Aufrufer.

import { AIError } from "../types";
import type { AITaskType } from "../types";
import { AIProviderFactory } from "../providers/AIProviderFactory";
import type {
  AICompletionRequest,
  AICompletionResult,
  AIProvider,
  AIProviderId,
} from "../providers/types";
import { AIModelRegistry } from "../registry/AIModelRegistry";
import { AI_FLAGS, getFlag } from "../runtime/featureFlags";
import { withRetry } from "../runtime/retry";
import {
  SchemaViolationError,
  validateAgainstSchema,
} from "../runtime/schemaValidator";
import { record as recordUsage } from "../runtime/telemetry";

export interface TaskRoute {
  primaryModel: string;
  /** Provider-Reihenfolge; leer => Registry-Provider für primaryModel. */
  providers?: AIProviderId[];
  /** Weitere Modelle, die versucht werden, falls primär+Provider komplett fehlschlagen. */
  fallbackModels?: string[];
}

// Vorher: google/gemini-3.6-flash über Lovables Gateway. Umgestellt auf
// Anthropic direkt (siehe AnthropicProvider). Der Pro-Tier für juristische
// Nuancen (vorher gemini-2.5-pro) ist jetzt Sonnet statt Haiku.
const DEFAULT_MODEL = "anthropic/claude-haiku-4-5";
const PRO_MODEL = "anthropic/claude-sonnet-5";

const TASK_ROUTES: Record<AITaskType, TaskRoute> = {
  "improve.title": { primaryModel: DEFAULT_MODEL },
  "improve.shortDescription": { primaryModel: DEFAULT_MODEL },
  "improve.recommendation": { primaryModel: DEFAULT_MODEL },
  "improve.legalExplanation": { primaryModel: PRO_MODEL, fallbackModels: [DEFAULT_MODEL] },
  "generate.checklist": { primaryModel: DEFAULT_MODEL },
  "generate.faq": { primaryModel: DEFAULT_MODEL },
  "generate.documentation": { primaryModel: DEFAULT_MODEL },
  "generate.practiceTips": { primaryModel: DEFAULT_MODEL },
  "generate.decisionTree": { primaryModel: PRO_MODEL, fallbackModels: [DEFAULT_MODEL] },
  "summarize.changes": { primaryModel: DEFAULT_MODEL },
  "detect.duplicates": { primaryModel: DEFAULT_MODEL },
  "quality.improve": { primaryModel: PRO_MODEL, fallbackModels: [DEFAULT_MODEL] },
  "review.readiness": { primaryModel: PRO_MODEL, fallbackModels: [DEFAULT_MODEL] },
  // Legal Intelligence – bevorzugt Sonnet für juristische Nuancen.
  "legal.analyzeCompleteness": { primaryModel: PRO_MODEL, fallbackModels: [DEFAULT_MODEL] },
  "legal.suggestSources": { primaryModel: PRO_MODEL, fallbackModels: [DEFAULT_MODEL] },
  "legal.checkConsistency": { primaryModel: PRO_MODEL, fallbackModels: [DEFAULT_MODEL] },
  "legal.checkDocumentation": { primaryModel: DEFAULT_MODEL },
  "legal.compareCases": { primaryModel: PRO_MODEL, fallbackModels: [DEFAULT_MODEL] },
  "legal.explainCitation": { primaryModel: DEFAULT_MODEL },
  "legal.riskIndicators": { primaryModel: DEFAULT_MODEL },
  "legal.summarize": { primaryModel: DEFAULT_MODEL },
};

/** Erweiterungspunkt: Route zur Laufzeit anpassen (z. B. Admin-Konsole). */
export function overrideRoute(task: AITaskType, route: Partial<TaskRoute>) {
  TASK_ROUTES[task] = { ...TASK_ROUTES[task], ...route };
}

export function getRoute(task: AITaskType): TaskRoute {
  return TASK_ROUTES[task];
}

interface RouteAttempt {
  model: string;
  providerId: AIProviderId;
}

function planAttempts(task: AITaskType): RouteAttempt[] {
  const route = TASK_ROUTES[task];
  const models = [route.primaryModel, ...(route.fallbackModels ?? [])];
  const attempts: RouteAttempt[] = [];
  const fallbackEnabled = getFlag<boolean>(AI_FLAGS.ENABLE_FALLBACK);
  for (const model of models) {
    const desc = AIModelRegistry.get(model);
    if (!desc) continue;
    const providers = route.providers && route.providers.length > 0 ? route.providers : desc.providers;
    for (const providerId of providers) {
      if (!AIProviderFactory.has(providerId)) continue;
      attempts.push({ model, providerId });
      if (!fallbackEnabled) return attempts;
    }
  }
  // Sicherheitsnetz: falls kein bekanntes Modell gefunden wurde, versuche
  // Default über Gateway/Mock (Factory entscheidet fallback).
  if (attempts.length === 0) {
    attempts.push({ model: DEFAULT_MODEL, providerId: "anthropic-native" });
  }
  return attempts;
}

export interface RunTaskInput {
  task: AITaskType;
  request: Omit<AICompletionRequest, "model">;
  /** Wenn true: Antwort gegen jsonSchema validieren (Standard: Feature-Flag). */
  enforceSchema?: boolean;
}

export async function runTask(input: RunTaskInput): Promise<AICompletionResult> {
  const attempts = planAttempts(input.task);
  const enforce = input.enforceSchema ?? getFlag<boolean>(AI_FLAGS.ENFORCE_SCHEMA);
  const telemetryOn = getFlag<boolean>(AI_FLAGS.ENABLE_TELEMETRY);
  const retryOn = getFlag<boolean>(AI_FLAGS.ENABLE_RETRY);

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { model, providerId } = attempts[i];
    let provider: AIProvider;
    try {
      provider = AIProviderFactory.get(providerId);
    } catch (err) {
      lastErr = err;
      continue;
    }
    if (!provider.supportsModel(model)) {
      lastErr = new AIError({
        code: "bad_request",
        userMessage: `Provider ${providerId} unterstützt Modell ${model} nicht.`,
      });
      continue;
    }
    const req: AICompletionRequest = { ...input.request, model, taskId: input.task };
    const started = Date.now();
    try {
      const call = () =>
        retryOn
          ? withRetry((signal) => provider.complete({ ...req, signal }), {
              signal: req.signal,
              maxAttempts: 3,
              initialDelayMs: 400,
              timeoutMs: 30_000,
            })
          : provider.complete(req);
      const result = await call();
      if (enforce && req.jsonSchema && result.json !== undefined) {
        const v = validateAgainstSchema(result.json, req.jsonSchema.schema);
        if (!v.ok) throw new SchemaViolationError(v.errors, result.json);
      }
      if (i > 0) result.meta.fromFallback = true;
      if (telemetryOn) {
        recordUsage({
          providerId,
          model,
          taskId: input.task,
          latencyMs: Date.now() - started,
          usage: result.usage,
          ok: true,
          fromFallback: i > 0,
        });
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (telemetryOn) {
        recordUsage({
          providerId,
          model,
          taskId: input.task,
          latencyMs: Date.now() - started,
          ok: false,
          errorCode:
            err instanceof AIError ? err.code : err instanceof Error ? err.name : "unknown",
          fromFallback: i > 0,
        });
      }
      // aborted → nicht weiter probieren.
      if (err instanceof AIError && err.code === "aborted") throw err;
      continue;
    }
  }
  if (lastErr instanceof AIError) throw lastErr;
  if (lastErr instanceof SchemaViolationError) {
    throw new AIError({
      code: "invalid_response",
      userMessage: "KI-Antwort entspricht nicht dem erwarteten Schema.",
      detail: lastErr.errors.join("; "),
    });
  }
  throw new AIError({
    code: "server_error",
    userMessage: "Kein Provider konnte die Anfrage bedienen.",
    detail: lastErr instanceof Error ? lastErr.message : String(lastErr ?? ""),
  });
}

export async function healthAll(): Promise<
  Array<{ providerId: AIProviderId; ok: boolean; latencyMs: number; detail?: string }>
> {
  const ids = AIProviderFactory.registeredIds();
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const p = AIProviderFactory.get(id);
        const r = await p.healthCheck();
        return { providerId: id, ok: r.ok, latencyMs: r.latencyMs, detail: r.detail };
      } catch (err) {
        return { providerId: id, ok: false, latencyMs: 0, detail: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  return results;
}
