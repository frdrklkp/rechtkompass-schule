/**
 * Sprint 4.3B – Supabase-Adapter für Sessions, Steps und Events.
 * - Persistiert WorkflowExecutionSession, WorkflowExecutionStep, WorkflowEvent
 * - RLS erzwingt Ownership; hier keine zusätzlichen Checks
 * - Events sind append-only (Trigger auf DB-Seite)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { WorkflowError } from "./errors";
import type { WorkflowRepositoryPort } from "./WorkflowRepository";
import { workflowTelemetry } from "./telemetry";
import type {
  WorkflowChecklistState,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowExecutionSession,
  WorkflowExecutionStep,
  WorkflowSessionStatus,
  WorkflowStepStatus,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

async function timed<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    workflowTelemetry.emit({ event: "workflow_storage_latency", durationMs: Date.now() - t0, detail: { op } });
    return r;
  } catch (err) {
    workflowTelemetry.emit({ event: "workflow_transaction_failed", detail: { op, message: (err as Error).message } });
    throw err;
  }
}

interface SessionRow {
  id: string; template_id: string; template_version_id: string | null;
  user_id: string; session_status: WorkflowSessionStatus; context: Record<string, unknown>;
  started_at: string | null; paused_at: string | null;
  completed_at: string | null; cancelled_at: string | null;
}
interface StepRow {
  id: string; session_id: string; step_id: string; step_status: WorkflowStepStatus;
  checklist_state: WorkflowChecklistState[]; note: string | null;
  started_at: string | null; completed_at: string | null;
}
interface EventRow {
  id: string; session_id: string; event_type: WorkflowEventType;
  actor: string | null; payload: Record<string, unknown>; at: string;
}

function toSession(row: SessionRow, steps: WorkflowExecutionStep[]): WorkflowExecutionSession {
  return {
    id: row.id, templateId: row.template_id, templateVersionId: row.template_version_id,
    userId: row.user_id, status: row.session_status, context: row.context ?? {},
    startedAt: row.started_at, pausedAt: row.paused_at,
    completedAt: row.completed_at, cancelledAt: row.cancelled_at,
    steps,
  };
}
function toStep(r: StepRow): WorkflowExecutionStep {
  return {
    id: r.id, sessionId: r.session_id, stepId: r.step_id, status: r.step_status,
    checklistState: Array.isArray(r.checklist_state) ? r.checklist_state : [],
    note: r.note, startedAt: r.started_at, completedAt: r.completed_at,
  };
}
function toEvent(r: EventRow): WorkflowEvent {
  return {
    id: r.id, sessionId: r.session_id, eventType: r.event_type,
    actor: r.actor, payload: r.payload ?? {}, at: r.at,
  };
}

export class SupabaseWorkflowRepository implements WorkflowRepositoryPort {
  private db: LooseClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(supabase: SupabaseClient<any, any, any>) { this.db = supabase; }

  async createSession(s: WorkflowExecutionSession): Promise<WorkflowExecutionSession> {
    return timed("sessions.create", async () => {
      const { data, error } = await this.db
        .from("workflow_execution_sessions")
        .insert({
          id: s.id,
          template_id: s.templateId,
          template_version_id: s.templateVersionId ?? null,
          user_id: s.userId,
          session_status: s.status,
          context: s.context ?? {},
          started_at: s.startedAt ?? null,
        })
        .select("*")
        .single();
      if (error || !data) throw new WorkflowError("invalid_state", error?.message ?? "createSession fehlgeschlagen");

      if (s.steps.length > 0) {
        const stepRows = s.steps.map((step) => ({
          id: step.id,
          session_id: s.id,
          step_id: step.stepId,
          step_status: step.status,
          checklist_state: step.checklistState ?? [],
          note: step.note ?? null,
          started_at: step.startedAt ?? null,
          completed_at: step.completedAt ?? null,
        }));
        const { error: stepErr } = await this.db.from("workflow_execution_steps").insert(stepRows);
        if (stepErr) {
          // Kompensation: Session zurückrollen (best effort)
          await this.db.from("workflow_execution_sessions").delete().eq("id", s.id);
          throw new WorkflowError("invalid_state", `Session-Steps konnten nicht persistiert werden: ${stepErr.message}`);
        }
      }
      workflowTelemetry.emit({ event: "workflow_session_created", sessionId: s.id, templateId: s.templateId });
      return this.mustGet(s.id);
    });
  }

  async getSession(id: string): Promise<WorkflowExecutionSession | null> {
    return timed("sessions.get", async () => {
      const { data: sess, error } = await this.db
        .from("workflow_execution_sessions").select("*").eq("id", id).maybeSingle();
      if (error) throw new WorkflowError("not_found", error.message);
      if (!sess) return null;
      const { data: steps, error: sErr } = await this.db
        .from("workflow_execution_steps").select("*").eq("session_id", id);
      if (sErr) throw new WorkflowError("not_found", sErr.message);
      return toSession(sess as SessionRow, (steps ?? []).map((s) => toStep(s as StepRow)));
    });
  }

  async updateSession(s: WorkflowExecutionSession): Promise<WorkflowExecutionSession> {
    return timed("sessions.update", async () => {
      const { error } = await this.db
        .from("workflow_execution_sessions")
        .update({
          session_status: s.status,
          context: s.context ?? {},
          started_at: s.startedAt ?? null,
          paused_at: s.pausedAt ?? null,
          completed_at: s.completedAt ?? null,
          cancelled_at: s.cancelledAt ?? null,
        })
        .eq("id", s.id);
      if (error) throw new WorkflowError("invalid_state", error.message);

      // Steps synchronisieren via Upsert (session_id, step_id) unique
      if (s.steps.length > 0) {
        const rows = s.steps.map((step) => ({
          id: step.id,
          session_id: s.id,
          step_id: step.stepId,
          step_status: step.status,
          checklist_state: step.checklistState ?? [],
          note: step.note ?? null,
          started_at: step.startedAt ?? null,
          completed_at: step.completedAt ?? null,
        }));
        const { error: upErr } = await this.db
          .from("workflow_execution_steps")
          .upsert(rows, { onConflict: "session_id,step_id" });
        if (upErr) throw new WorkflowError("invalid_state", upErr.message);
      }
      return this.mustGet(s.id);
    });
  }

  async listSessionsForUser(userId: string): Promise<WorkflowExecutionSession[]> {
    return timed("sessions.listForUser", async () => {
      const { data, error } = await this.db
        .from("workflow_execution_sessions").select("*").eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw new WorkflowError("not_found", error.message);
      const sessions = (data ?? []) as SessionRow[];
      if (sessions.length === 0) return [];
      const ids = sessions.map((s) => s.id);
      const { data: steps } = await this.db
        .from("workflow_execution_steps").select("*").in("session_id", ids);
      const byId = new Map<string, WorkflowExecutionStep[]>();
      for (const s of (steps ?? []) as StepRow[]) {
        const list = byId.get(s.session_id) ?? [];
        list.push(toStep(s));
        byId.set(s.session_id, list);
      }
      return sessions.map((s) => toSession(s, byId.get(s.id) ?? []));
    });
  }

  async upsertStep(step: WorkflowExecutionStep): Promise<WorkflowExecutionStep> {
    return timed("steps.upsert", async () => {
      const row = {
        id: step.id,
        session_id: step.sessionId,
        step_id: step.stepId,
        step_status: step.status,
        checklist_state: step.checklistState ?? [],
        note: step.note ?? null,
        started_at: step.startedAt ?? null,
        completed_at: step.completedAt ?? null,
      };
      const { data, error } = await this.db
        .from("workflow_execution_steps")
        .upsert(row, { onConflict: "session_id,step_id" })
        .select("*").single();
      if (error || !data) throw new WorkflowError("invalid_state", error?.message ?? "upsertStep fehlgeschlagen");
      if (step.status === "completed") {
        workflowTelemetry.emit({ event: "workflow_step_completed", sessionId: step.sessionId, stepId: step.stepId });
      }
      return toStep(data as StepRow);
    });
  }

  async listSteps(sessionId: string): Promise<WorkflowExecutionStep[]> {
    return timed("steps.list", async () => {
      const { data, error } = await this.db
        .from("workflow_execution_steps").select("*").eq("session_id", sessionId);
      if (error) throw new WorkflowError("not_found", error.message);
      return (data ?? []).map((r) => toStep(r as StepRow));
    });
  }

  async appendEvent(event: WorkflowEvent): Promise<WorkflowEvent> {
    return timed("events.append", async () => {
      const { data, error } = await this.db
        .from("workflow_events")
        .insert({
          id: event.id,
          session_id: event.sessionId,
          event_type: event.eventType,
          actor: event.actor ?? null,
          payload: event.payload ?? {},
          at: event.at,
        })
        .select("*").single();
      if (error || !data) throw new WorkflowError("invalid_state", error?.message ?? "appendEvent fehlgeschlagen");
      return toEvent(data as EventRow);
    });
  }

  async listEvents(sessionId: string): Promise<WorkflowEvent[]> {
    return timed("events.list", async () => {
      const { data, error } = await this.db
        .from("workflow_events").select("*").eq("session_id", sessionId)
        .order("at", { ascending: true });
      if (error) throw new WorkflowError("not_found", error.message);
      return (data ?? []).map((r) => toEvent(r as EventRow));
    });
  }

  private async mustGet(id: string): Promise<WorkflowExecutionSession> {
    const s = await this.getSession(id);
    if (!s) throw new WorkflowError("not_found", `Session ${id} nicht gefunden`);
    return s;
  }
}
