// In-Memory Telemetry für KI-Aufrufe. KEIN Persist, KEIN Netzwerk.
// Dient als Erweiterungspunkt – ein späterer Persist-Adapter (Supabase,
// Datadog, …) kann via subscribe() angeschlossen werden, ohne dass die
// Provider-Schicht angepasst werden muss.

import type { AIProviderId, AITokenUsage } from "../providers/types";

export interface AIUsageRecord {
  id: string;
  ts: string;
  providerId: AIProviderId;
  model: string;
  taskId?: string;
  latencyMs: number;
  usage?: AITokenUsage;
  estCostUsd?: number;
  ok: boolean;
  errorCode?: string;
  fromFallback?: boolean;
}

export interface AIUsageSummary {
  totalCalls: number;
  totalOk: number;
  totalFail: number;
  totalTokens: number;
  totalCostUsd: number;
  byProvider: Record<string, { calls: number; tokens: number; costUsd: number }>;
  byModel: Record<string, { calls: number; tokens: number; costUsd: number }>;
}

type Listener = (record: AIUsageRecord) => void;

// Bewusst kleiner Ringpuffer (in-memory).
const MAX_RECORDS = 500;
const records: AIUsageRecord[] = [];
const listeners = new Set<Listener>();

function newId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto)
      return crypto.randomUUID();
  } catch {
    /* noop */
  }
  return `usg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Vereinfachte, konservative Preisliste (USD / 1M Tokens). Der Lovable AI
 * Gateway rechnet in Credits ab; diese Werte sind Richtwerte, um lokale
 * Aufwandssichten zu ermöglichen. Kein Vertragspreis.
 */
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  "google/gemini-3.6-flash": { in: 0.1, out: 0.4 },
  "google/gemini-3-flash-preview": { in: 0.1, out: 0.4 },
  "google/gemini-2.5-flash": { in: 0.075, out: 0.3 },
  "google/gemini-2.5-pro": { in: 1.25, out: 5.0 },
  "openai/gpt-5-mini": { in: 0.25, out: 2.0 },
  "openai/gpt-5-nano": { in: 0.05, out: 0.4 },
  "openai/gpt-5": { in: 1.25, out: 10.0 },
  "mock/echo": { in: 0, out: 0 },
};

export function estimateCostUsd(model: string, usage?: AITokenUsage): number {
  if (!usage) return 0;
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  return (usage.promptTokens / 1_000_000) * p.in +
    (usage.completionTokens / 1_000_000) * p.out;
}

export function record(entry: Omit<AIUsageRecord, "id" | "ts" | "estCostUsd"> & { estCostUsd?: number }) {
  const rec: AIUsageRecord = {
    id: newId(),
    ts: new Date().toISOString(),
    estCostUsd: entry.estCostUsd ?? estimateCostUsd(entry.model, entry.usage),
    ...entry,
  };
  records.push(rec);
  if (records.length > MAX_RECORDS) records.shift();
  for (const l of listeners) {
    try {
      l(rec);
    } catch {
      /* noop */
    }
  }
  return rec;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function listRecent(limit = 100): AIUsageRecord[] {
  return records.slice(-limit).reverse();
}

export function clearRecords() {
  records.length = 0;
}

export function summarize(): AIUsageSummary {
  const s: AIUsageSummary = {
    totalCalls: records.length,
    totalOk: 0,
    totalFail: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    byProvider: {},
    byModel: {},
  };
  for (const r of records) {
    if (r.ok) s.totalOk++;
    else s.totalFail++;
    const t = r.usage?.totalTokens ?? 0;
    s.totalTokens += t;
    s.totalCostUsd += r.estCostUsd ?? 0;
    const bp = (s.byProvider[r.providerId] ??= { calls: 0, tokens: 0, costUsd: 0 });
    bp.calls++;
    bp.tokens += t;
    bp.costUsd += r.estCostUsd ?? 0;
    const bm = (s.byModel[r.model] ??= { calls: 0, tokens: 0, costUsd: 0 });
    bm.calls++;
    bm.tokens += t;
    bm.costUsd += r.estCostUsd ?? 0;
  }
  return s;
}
