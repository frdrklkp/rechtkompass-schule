/**
 * Sprint 4.5C – Telemetrie für das Legal Import Framework.
 * Deckungsgleich mit den in Sprint 4.5 üblichen In-Memory-Sinks.
 */
export type LegalImportTelemetryEvent =
  | "legal_import_started"
  | "legal_import_finished"
  | "legal_import_failed"
  | "legal_import_delta"
  | "legal_import_validation_failed";

export interface LegalImportTelemetryPayload {
  event: LegalImportTelemetryEvent;
  sourceKey?: string;
  versionLabel?: string;
  parserId?: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

type Sink = (p: LegalImportTelemetryPayload) => void;
const sinks: Sink[] = [];

export const legalImportTelemetry = {
  register(sink: Sink) {
    sinks.push(sink);
    return () => {
      const i = sinks.indexOf(sink);
      if (i >= 0) sinks.splice(i, 1);
    };
  },
  emit(p: LegalImportTelemetryPayload) {
    for (const s of sinks) {
      try { s(p); } catch { /* ignore */ }
    }
  },
};
