/**
 * Retrieval-Telemetrie (in-memory, ohne Rechtstexte).
 */
export type RetrievalTelemetryEvent =
  | "retrieval_started"
  | "retrieval_completed"
  | "retrieval_failed"
  | "retrieval_debug";

export interface RetrievalTelemetryPayload {
  event: RetrievalTelemetryEvent;
  at: string;
  searchType?: string;
  latencyMs?: number;
  averageScore?: number;
  averageResults?: number;
  totalCandidates?: number;
  returned?: number;
  errorCode?: string;
  data?: Record<string, unknown>;
}

const BUFFER = 500;
const buffer: RetrievalTelemetryPayload[] = [];

export const retrievalTelemetry = {
  emit(p: Omit<RetrievalTelemetryPayload, "at">): void {
    const entry: RetrievalTelemetryPayload = { ...p, at: new Date().toISOString() };
    buffer.push(entry);
    if (buffer.length > BUFFER) buffer.splice(0, buffer.length - BUFFER);
    if (p.event === "retrieval_failed" && typeof console !== "undefined") {
      console.warn("[retrieval] failed", { errorCode: p.errorCode });
    }
  },
  snapshot(): RetrievalTelemetryPayload[] { return [...buffer]; },
  aggregate() {
    const completed = buffer.filter((b) => b.event === "retrieval_completed");
    const failed = buffer.filter((b) => b.event === "retrieval_failed").length;
    const avgLatency = completed.length ? completed.reduce((s, b) => s + (b.latencyMs ?? 0), 0) / completed.length : 0;
    const avgResults = completed.length ? completed.reduce((s, b) => s + (b.returned ?? 0), 0) / completed.length : 0;
    const avgScore = completed.length ? completed.reduce((s, b) => s + (b.averageScore ?? 0), 0) / completed.length : 0;
    return { totalRequests: completed.length + failed, failed, avgLatency, avgResults, avgScore };
  },
  reset(): void { buffer.length = 0; },
};
