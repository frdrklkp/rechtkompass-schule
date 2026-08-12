/** Sprint 4.5A – Telemetrie für Dokumentgenerierung. */
export type DocGenTelemetryEvent =
  | "document_generated"
  | "document_regenerated"
  | "document_previewed"
  | "document_generation_failed"
  | "document_ai_field_filled"
  | "document_ai_field_skipped"
  | "document_downloaded"
  | "document_export_failed";

export interface DocGenTelemetryPayload {
  event: DocGenTelemetryEvent;
  sessionId?: string;
  templateSlug?: string;
  documentId?: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

type Sink = (p: DocGenTelemetryPayload) => void;
const sinks: Sink[] = [];

export const docGenTelemetry = {
  register(sink: Sink) { sinks.push(sink); return () => { const i = sinks.indexOf(sink); if (i >= 0) sinks.splice(i, 1); }; },
  emit(p: DocGenTelemetryPayload) { for (const s of sinks) { try { s(p); } catch { /* ignore */ } } },
};
