/** Copilot-Telemetrie (in-memory, keine personenbezogenen Inhalte). */
export type CopilotTelemetryEvent =
  | "copilot_started"
  | "copilot_completed"
  | "copilot_no_sources"
  | "copilot_hallucination_blocked"
  | "copilot_failed"
  | "copilot_followup"
  | "workflow_recommended"
  | "workflow_opened"
  | "workflow_started_from_ai";

export interface CopilotTelemetryPayload {
  event: CopilotTelemetryEvent;
  at: string;
  sessionId?: string;
  mode?: string;
  totalMs?: number;
  retrievalMs?: number;
  llmMs?: number;
  hits?: number;
  usedHits?: number;
  confidence?: number;
  tokens?: number;
  costUsd?: number;
  providerId?: string;
  errorCode?: string;
  detail?: Record<string, unknown>;
}

const BUFFER = 500;
const buffer: CopilotTelemetryPayload[] = [];

export const copilotTelemetry = {
  emit(p: Omit<CopilotTelemetryPayload, "at">): void {
    const entry: CopilotTelemetryPayload = { ...p, at: new Date().toISOString() };
    buffer.push(entry);
    if (buffer.length > BUFFER) buffer.splice(0, buffer.length - BUFFER);
    if ((p.event === "copilot_failed" || p.event === "copilot_hallucination_blocked") && typeof console !== "undefined") {
      console.warn("[copilot]", p.event, { code: p.errorCode });
    }
  },
  snapshot(): CopilotTelemetryPayload[] { return [...buffer]; },
  aggregate() {
    const completed = buffer.filter((b) => b.event === "copilot_completed");
    const failed = buffer.filter((b) => b.event === "copilot_failed").length;
    const noSrc = buffer.filter((b) => b.event === "copilot_no_sources").length;
    const halluc = buffer.filter((b) => b.event === "copilot_hallucination_blocked").length;
    const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
    return {
      total: completed.length + failed + noSrc,
      completed: completed.length,
      failed,
      noSources: noSrc,
      hallucinationsBlocked: halluc,
      avgTotalMs: avg(completed.map((c) => c.totalMs ?? 0)),
      avgRetrievalMs: avg(completed.map((c) => c.retrievalMs ?? 0)),
      avgLlmMs: avg(completed.map((c) => c.llmMs ?? 0)),
      avgConfidence: avg(completed.map((c) => c.confidence ?? 0)),
      avgHits: avg(completed.map((c) => c.hits ?? 0)),
      totalCostUsd: completed.reduce((s, c) => s + (c.costUsd ?? 0), 0),
    };
  },
  reset(): void { buffer.length = 0; },
};
