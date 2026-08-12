/**
 * Persistenz-Ports für Sessions/Steps/Events.
 * In-Memory-Referenzimplementierung + Interface für spätere Supabase-Anbindung.
 */
import type {
  WorkflowEvent,
  WorkflowExecutionSession,
  WorkflowExecutionStep,
} from "./types";

export interface WorkflowRepositoryPort {
  createSession(session: WorkflowExecutionSession): Promise<WorkflowExecutionSession>;
  getSession(id: string): Promise<WorkflowExecutionSession | null>;
  updateSession(session: WorkflowExecutionSession): Promise<WorkflowExecutionSession>;
  listSessionsForUser(userId: string): Promise<WorkflowExecutionSession[]>;

  upsertStep(step: WorkflowExecutionStep): Promise<WorkflowExecutionStep>;
  listSteps(sessionId: string): Promise<WorkflowExecutionStep[]>;

  appendEvent(event: WorkflowEvent): Promise<WorkflowEvent>;
  listEvents(sessionId: string): Promise<WorkflowEvent[]>;
}

export class InMemoryWorkflowRepository implements WorkflowRepositoryPort {
  private sessions = new Map<string, WorkflowExecutionSession>();
  private events = new Map<string, WorkflowEvent[]>();

  async createSession(s: WorkflowExecutionSession) {
    this.sessions.set(s.id, { ...s, steps: [...s.steps] });
    this.events.set(s.id, []);
    return this.sessions.get(s.id)!;
  }
  async getSession(id: string) { return this.sessions.get(id) ?? null; }
  async updateSession(s: WorkflowExecutionSession) {
    this.sessions.set(s.id, { ...s, steps: [...s.steps] });
    return this.sessions.get(s.id)!;
  }
  async listSessionsForUser(userId: string) {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }
  async upsertStep(step: WorkflowExecutionStep) {
    const s = this.sessions.get(step.sessionId);
    if (!s) throw new Error("session not found");
    const idx = s.steps.findIndex((x) => x.stepId === step.stepId);
    if (idx >= 0) s.steps[idx] = step; else s.steps.push(step);
    return step;
  }
  async listSteps(sessionId: string) {
    return this.sessions.get(sessionId)?.steps ?? [];
  }
  async appendEvent(event: WorkflowEvent) {
    const list = this.events.get(event.sessionId) ?? [];
    list.push(event);
    this.events.set(event.sessionId, list);
    return event;
  }
  async listEvents(sessionId: string) {
    return [...(this.events.get(sessionId) ?? [])];
  }
}
