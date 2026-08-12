/** Workflow-Telemetrie (in-memory, keine personenbezogenen Inhalte). */
export type WorkflowTelemetryEvent =
  | "workflow_started"
  | "workflow_completed"
  | "workflow_cancelled"
  | "workflow_step_completed"
  | "workflow_paused"
  | "workflow_blocked"
  | "workflow_duration"
  // Sprint 4.3B – Persistence + API
  | "workflow_repository_loaded"
  | "workflow_storage_latency"
  | "workflow_session_created"
  | "workflow_api_completed"
  | "workflow_api_failed"
  | "workflow_transaction_failed"
  // Sprint 4.3C – Runtime UI
  | "workflow_runtime_opened"
  | "workflow_runtime_closed"
  | "workflow_runtime_error"
  | "workflow_step_opened"
  | "workflow_step_closed"
  | "workflow_catalog_loaded"
  | "workflow_detail_loaded";

export interface WorkflowTelemetryPayload {
  event: WorkflowTelemetryEvent;
  at: string;
  templateId?: string;
  sessionId?: string;
  stepId?: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

const BUFFER = 500;
const buffer: WorkflowTelemetryPayload[] = [];

export const workflowTelemetry = {
  emit(p: Omit<WorkflowTelemetryPayload, "at">): void {
    const entry: WorkflowTelemetryPayload = { ...p, at: new Date().toISOString() };
    buffer.push(entry);
    if (buffer.length > BUFFER) buffer.splice(0, buffer.length - BUFFER);
  },
  snapshot(): WorkflowTelemetryPayload[] { return [...buffer]; },
  reset(): void { buffer.length = 0; },
};
