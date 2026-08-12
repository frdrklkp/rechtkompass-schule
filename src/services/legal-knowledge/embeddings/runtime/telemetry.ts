/**
 * Leichtgewichtige Telemetrie für die Embedding-Plattform.
 * Speichert keine Rechtstexte – nur IDs, Hashes, Modell und Metriken.
 */

export type EmbeddingTelemetryEvent =
  | "embedding_job_started"
  | "embedding_job_completed"
  | "embedding_job_failed"
  | "embedding_job_cancelled"
  | "embedding_batch_completed"
  | "embedding_batch_failed"
  | "embedding_item_failed"
  | "embedding_item_retried"
  | "embedding_item_skipped"
  | "embedding_model_changed"
  | "embedding_validation_failed";

export interface EmbeddingTelemetryPayload {
  event: EmbeddingTelemetryEvent;
  at: string;
  jobId?: string;
  sourceId?: string;
  chunkId?: string;
  stableHash?: string;
  providerId?: string;
  modelId?: string;
  modelVersion?: string;
  status?: string;
  tokenCount?: number;
  latencyMs?: number;
  errorCode?: string;
  data?: Record<string, unknown>;
}

const BUFFER_LIMIT = 500;
const buffer: EmbeddingTelemetryPayload[] = [];

export const embeddingTelemetry = {
  emit(payload: Omit<EmbeddingTelemetryPayload, "at">): void {
    const entry: EmbeddingTelemetryPayload = { ...payload, at: new Date().toISOString() };
    buffer.push(entry);
    if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT);
    if (typeof console !== "undefined" && payload.event.endsWith("_failed")) {
      // Nur Kurzform, keine Rechtstexte.
      console.warn(`[embedding] ${payload.event}`, {
        jobId: payload.jobId, sourceId: payload.sourceId, errorCode: payload.errorCode,
      });
    }
  },
  snapshot(): EmbeddingTelemetryPayload[] { return [...buffer]; },
  reset(): void { buffer.length = 0; },
};
