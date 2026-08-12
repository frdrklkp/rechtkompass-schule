/**
 * WorkflowRunner – schmale, sessionzentrische Fassade um WorkflowEngine.
 * Kapselt eine laufende Session, damit UI-Aufrufer nicht ständig die
 * Session-ID durchreichen müssen.
 */
import { WorkflowEngine } from "./WorkflowEngine";
import type {
  WorkflowExecutionSession,
  WorkflowStepStatus,
} from "./types";

export class WorkflowRunner {
  constructor(private engine: WorkflowEngine, private sessionId: string, private actor?: string) {}

  static async start(engine: WorkflowEngine, params: {
    templateId?: string; templateSlug?: string; userId: string; context?: Record<string, unknown>;
  }): Promise<WorkflowRunner> {
    const { session } = await engine.startSession(params);
    return new WorkflowRunner(engine, session.id, params.userId);
  }

  id(): string { return this.sessionId; }

  session(): Promise<WorkflowExecutionSession> {
    return this.engine.loadSession(this.sessionId);
  }

  transition(stepId: string, to: WorkflowStepStatus, note?: string) {
    return this.engine.transitionStep({ sessionId: this.sessionId, stepId, to, actor: this.actor, note });
  }
  complete(stepId: string, note?: string) { return this.transition(stepId, "completed", note); }
  skip(stepId: string, note?: string) { return this.transition(stepId, "skipped", note); }
  activate(stepId: string) { return this.transition(stepId, "active"); }

  toggleChecklist(stepId: string, itemId: string, done: boolean, note?: string) {
    return this.engine.toggleChecklistItem({ sessionId: this.sessionId, stepId, itemId, done, actor: this.actor, note });
  }
  recommendations() { return this.engine.recommendations(this.sessionId); }
  progress()        { return this.engine.progress(this.sessionId); }
  pause()           { return this.engine.pause(this.sessionId, this.actor); }
  resume()          { return this.engine.resume(this.sessionId, this.actor); }
  cancel(reason?: string) { return this.engine.cancel(this.sessionId, this.actor, reason); }
}
