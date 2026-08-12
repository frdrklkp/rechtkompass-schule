/**
 * Zentrale Workflow-Engine.
 * Kennt keine fachlichen Regeln – führt ausschließlich datengetriebene
 * Templates aus. Delegiert Regeln an WorkflowRuleEngine, Validierung an
 * WorkflowValidator, Persistenz an die Repositories.
 */
import { WorkflowError } from "./errors";
import { WorkflowStateMachine } from "./WorkflowStateMachine";
import { WorkflowNavigator } from "./WorkflowNavigator";
import { WorkflowRuleEngine } from "./WorkflowRuleEngine";
import { WorkflowProgressCalculator } from "./WorkflowProgressCalculator";
import { WorkflowRecommendationService } from "./WorkflowRecommendationService";
import { workflowTelemetry } from "./telemetry";
import type { WorkflowRepositoryPort } from "./WorkflowRepository";
import type { WorkflowTemplateRepositoryPort } from "./WorkflowTemplateRepository";
import type {
  WorkflowEvent,
  WorkflowEventType,
  WorkflowExecutionSession,
  WorkflowRecommendation,
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowTemplate,
} from "./types";

export interface WorkflowEngineDeps {
  templates: WorkflowTemplateRepositoryPort;
  sessions: WorkflowRepositoryPort;
  now?: () => Date;
  idFactory?: () => string;
}

export class WorkflowEngine {
  private now: () => Date;
  private idFactory: () => string;

  constructor(private deps: WorkflowEngineDeps) {
    this.now = deps.now ?? (() => new Date());
    this.idFactory = deps.idFactory ?? (() =>
      (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`));
  }

  async startSession(input: {
    templateId?: string;
    templateSlug?: string;
    userId: string;
    context?: Record<string, unknown>;
  }): Promise<{ session: WorkflowExecutionSession; template: WorkflowTemplate }> {
    const tpl = input.templateId
      ? await this.deps.templates.getById(input.templateId)
      : input.templateSlug
        ? await this.deps.templates.getBySlug(input.templateSlug)
        : null;
    if (!tpl) throw new WorkflowError("not_found", "Workflow-Template nicht gefunden.");
    if (tpl.workflowStatus !== "published") {
      throw new WorkflowError("invalid_state", "Nur veröffentlichte Workflows können gestartet werden.");
    }

    const at = this.now().toISOString();
    const session: WorkflowExecutionSession = {
      id: this.idFactory(),
      templateId: tpl.id,
      templateVersionId: tpl.currentVersionId ?? null,
      userId: input.userId,
      status: "running",
      context: input.context ?? {},
      startedAt: at,
      steps: [],
    };

    // Initial steps: alle Steps als "open"
    for (const step of WorkflowNavigator.allSteps(tpl)) {
      session.steps.push({
        id: this.idFactory(),
        sessionId: session.id,
        stepId: step.id,
        status: "open",
        checklistState: step.checklists.map((c) => ({ itemId: c.id, done: false })),
      });
    }

    await this.deps.sessions.createSession(session);
    await this.emit(session.id, "workflow_started", input.userId, { templateId: tpl.id });
    workflowTelemetry.emit({ event: "workflow_started", templateId: tpl.id, sessionId: session.id });
    return { session, template: tpl };
  }

  async pause(sessionId: string, actor?: string): Promise<WorkflowExecutionSession> {
    const s = await this.mustLoad(sessionId);
    WorkflowStateMachine.assertSession(s.status, "paused");
    s.status = "paused";
    s.pausedAt = this.now().toISOString();
    await this.deps.sessions.updateSession(s);
    await this.emit(s.id, "workflow_paused", actor);
    workflowTelemetry.emit({ event: "workflow_paused", sessionId: s.id });
    return s;
  }

  async resume(sessionId: string, actor?: string): Promise<WorkflowExecutionSession> {
    const s = await this.mustLoad(sessionId);
    WorkflowStateMachine.assertSession(s.status, "running");
    s.status = "running";
    s.pausedAt = null;
    await this.deps.sessions.updateSession(s);
    await this.emit(s.id, "workflow_resumed", actor);
    return s;
  }

  async cancel(sessionId: string, actor?: string, reason?: string): Promise<WorkflowExecutionSession> {
    const s = await this.mustLoad(sessionId);
    WorkflowStateMachine.assertSession(s.status, "cancelled");
    s.status = "cancelled";
    s.cancelledAt = this.now().toISOString();
    await this.deps.sessions.updateSession(s);
    await this.emit(s.id, "workflow_cancelled", actor, { reason });
    workflowTelemetry.emit({ event: "workflow_cancelled", sessionId: s.id, detail: { reason } });
    return s;
  }

  async transitionStep(input: {
    sessionId: string;
    stepId: string;
    to: WorkflowStepStatus;
    actor?: string;
    note?: string;
  }): Promise<WorkflowExecutionSession> {
    const s = await this.mustLoad(input.sessionId);
    if (s.status !== "running") {
      throw new WorkflowError("invalid_state", "Session ist nicht aktiv.");
    }
    const tpl = await this.deps.templates.getById(s.templateId);
    if (!tpl) throw new WorkflowError("not_found", "Template zu Session nicht gefunden.");

    const exec = s.steps.find((x) => x.stepId === input.stepId);
    if (!exec) throw new WorkflowError("not_found", "Schritt nicht in Session.");

    WorkflowStateMachine.assertStep(exec.status, input.to);

    // Abhängigkeiten prüfen (nur beim Aktivieren/Abschließen)
    if (input.to === "active" || input.to === "completed") {
      const stepDef = WorkflowNavigator.allSteps(tpl).find((st) => st.id === input.stepId);
      if (stepDef) this.assertDepsSatisfied(stepDef, s);
    }

    exec.status = input.to;
    if (input.note) exec.note = input.note;
    if (input.to === "active") exec.startedAt = this.now().toISOString();
    if (input.to === "completed" || input.to === "skipped") exec.completedAt = this.now().toISOString();

    await this.deps.sessions.upsertStep(exec);
    await this.deps.sessions.updateSession(s);

    const evType: WorkflowEventType =
      input.to === "completed" ? "workflow_step_completed"
      : input.to === "skipped" ? "workflow_step_skipped"
      : input.to === "blocked" ? "workflow_step_blocked"
      : "workflow_step_started";
    await this.emit(s.id, evType, input.actor, { stepId: input.stepId });
    if (evType === "workflow_step_completed") {
      workflowTelemetry.emit({ event: "workflow_step_completed", sessionId: s.id, stepId: input.stepId });
    }

    // Abschluss erkennen: alle Pflichtsteps terminal
    if (this.allRequiredDone(tpl, s)) {
      WorkflowStateMachine.assertSession(s.status, "completed");
      s.status = "completed";
      s.completedAt = this.now().toISOString();
      await this.deps.sessions.updateSession(s);
      await this.emit(s.id, "workflow_completed", input.actor);
      workflowTelemetry.emit({ event: "workflow_completed", sessionId: s.id });
    }

    return s;
  }

  async toggleChecklistItem(input: {
    sessionId: string;
    stepId: string;
    itemId: string;
    done: boolean;
    actor?: string;
    note?: string;
  }): Promise<WorkflowExecutionSession> {
    const s = await this.mustLoad(input.sessionId);
    const exec = s.steps.find((x) => x.stepId === input.stepId);
    if (!exec) throw new WorkflowError("not_found", "Schritt nicht in Session.");
    const idx = exec.checklistState.findIndex((c) => c.itemId === input.itemId);
    if (idx < 0) {
      exec.checklistState.push({ itemId: input.itemId, done: input.done, at: this.now().toISOString(), by: input.actor, note: input.note });
    } else {
      exec.checklistState[idx] = {
        ...exec.checklistState[idx],
        done: input.done,
        at: this.now().toISOString(),
        by: input.actor,
        note: input.note ?? exec.checklistState[idx].note,
      };
    }
    await this.deps.sessions.upsertStep(exec);
    await this.deps.sessions.updateSession(s);
    return s;
  }

  async recommendations(sessionId: string): Promise<WorkflowRecommendation[]> {
    const s = await this.mustLoad(sessionId);
    const tpl = await this.deps.templates.getById(s.templateId);
    if (!tpl) return [];
    return WorkflowRecommendationService.recommend(tpl, s);
  }

  async progress(sessionId: string) {
    const s = await this.mustLoad(sessionId);
    const tpl = await this.deps.templates.getById(s.templateId);
    if (!tpl) throw new WorkflowError("not_found", "Template nicht gefunden.");
    return WorkflowProgressCalculator.compute(tpl, s);
  }

  async evaluateRules(sessionId: string) {
    const s = await this.mustLoad(sessionId);
    const tpl = await this.deps.templates.getById(s.templateId);
    if (!tpl) return [];
    return WorkflowRuleEngine.evaluate(tpl, s);
  }

  // ------------- Intern -------------

  async loadSession(id: string): Promise<WorkflowExecutionSession> {
    return this.mustLoad(id);
  }

  private async mustLoad(id: string): Promise<WorkflowExecutionSession> {
    const s = await this.deps.sessions.getSession(id);
    if (!s) throw new WorkflowError("not_found", "Session nicht gefunden.");
    return s;
  }

  private assertDepsSatisfied(step: WorkflowStep, s: WorkflowExecutionSession): void {
    const done = new Set(
      s.steps.filter((x) => x.status === "completed" || x.status === "skipped").map((x) => x.stepId),
    );
    for (const dep of step.dependsOn) {
      if (!done.has(dep)) {
        throw new WorkflowError("step_blocked", `Vorheriger Schritt (${dep}) ist noch nicht abgeschlossen.`);
      }
    }
  }

  private allRequiredDone(tpl: WorkflowTemplate, s: WorkflowExecutionSession): boolean {
    const statusById = new Map(s.steps.map((x) => [x.stepId, x.status]));
    for (const step of WorkflowNavigator.allSteps(tpl)) {
      if (!step.isRequired) continue;
      const st = statusById.get(step.id);
      if (st !== "completed" && st !== "skipped") return false;
    }
    return true;
  }

  private async emit(sessionId: string, eventType: WorkflowEventType, actor?: string, payload: Record<string, unknown> = {}) {
    const ev: WorkflowEvent = {
      id: this.idFactory(),
      sessionId,
      eventType,
      actor: actor ?? null,
      payload,
      at: this.now().toISOString(),
    };
    await this.deps.sessions.appendEvent(ev);
  }
}
