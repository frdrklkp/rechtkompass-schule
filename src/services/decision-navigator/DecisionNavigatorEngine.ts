/**
 * Sprint 4.6A – Decision Navigator Engine.
 * Zustandsbasierte Navigationslogik. Keine Fachlogik, keine KI, keine Rechtsbewertung.
 */
import { NavigatorEventBus } from "./NavigatorEventBus";
import { NavigatorProgressCalculator } from "./NavigatorProgressCalculator";
import {
  InMemoryNavigatorSessionStore,
  type NavigatorSessionStorePort,
} from "./NavigatorSessionStore";
import { buildStandardFlow } from "./standardFlow";
import type { NavigatorIntegrations } from "./integrations";
import type {
  NavigatorEvent,
  NavigatorEventListener,
  NavigatorEventName,
  NavigatorFlowDefinition,
  NavigatorState,
  NavigatorStep,
  NavigatorStepDefinition,
  NavigatorStepStatus,
} from "./types";

export class NavigatorError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "invalid_state"
      | "invalid_transition"
      | "step_not_optional",
    message: string,
  ) {
    super(message);
    this.name = "NavigatorError";
  }
}

export interface DecisionNavigatorEngineOptions {
  navigatorId?: string;
  workflowId?: string;
  flow?: NavigatorFlowDefinition;
  store?: NavigatorSessionStorePort;
  integrations?: NavigatorIntegrations;
  /** Injizierbare Zeitquelle – erleichtert deterministische Tests. */
  now?: () => Date;
  context?: Record<string, unknown>;
}

function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fallthrough */
  }
  return `nav_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export class DecisionNavigatorEngine {
  private readonly flow: NavigatorFlowDefinition;
  private readonly store: NavigatorSessionStorePort;
  private readonly bus = new NavigatorEventBus();
  private readonly now: () => Date;
  /** Nur deklariert – in dieser Version bewusst ungenutzt. */
  readonly integrations: NavigatorIntegrations;
  private state: NavigatorState;

  constructor(options: DecisionNavigatorEngineOptions = {}) {
    this.flow = options.flow ?? buildStandardFlow();
    this.store = options.store ?? new InMemoryNavigatorSessionStore();
    this.integrations = options.integrations ?? {};
    this.now = options.now ?? (() => new Date());
    const ts = this.now().toISOString();
    this.state = {
      navigatorId: options.navigatorId ?? makeId(),
      workflowId: options.workflowId ?? this.flow.id,
      flowId: this.flow.id,
      currentStep: null,
      visitedSteps: [],
      completedSteps: [],
      skippedSteps: [],
      startedAt: ts,
      updatedAt: ts,
      status: "idle",
      progress: NavigatorProgressCalculator.calculate(this.flow.steps, new Set(), null),
      context: options.context ?? {},
    };
  }

  /* --------------------------- Session-Wiederherstellung -------------------- */

  static restore(
    state: NavigatorState,
    options: Omit<DecisionNavigatorEngineOptions, "navigatorId"> = {},
  ): DecisionNavigatorEngine {
    const engine = new DecisionNavigatorEngine({ ...options, navigatorId: state.navigatorId });
    engine.state = { ...state, context: { ...state.context } };
    return engine;
  }

  static resumeFromStore(
    navigatorId: string,
    store: NavigatorSessionStorePort,
    options: Omit<DecisionNavigatorEngineOptions, "store" | "navigatorId"> = {},
  ): DecisionNavigatorEngine | null {
    const state = store.load(navigatorId);
    if (!state) return null;
    return DecisionNavigatorEngine.restore(state, { ...options, store });
  }

  /* --------------------------------- Lesen --------------------------------- */

  getFlow(): NavigatorFlowDefinition {
    return this.flow;
  }

  getState(): NavigatorState {
    return JSON.parse(JSON.stringify(this.state)) as NavigatorState;
  }

  getProgress() {
    return this.getState().progress;
  }

  getSteps(): NavigatorStep[] {
    return this.visibleSteps().map((def, index, all) => this.toStep(def, index, all));
  }

  getCurrentStep(): NavigatorStep | null {
    const id = this.state.currentStep;
    if (!id) return null;
    return this.getSteps().find((s) => s.id === id) ?? null;
  }

  getEvents(): NavigatorEvent[] {
    return this.bus.history();
  }

  on(listener: NavigatorEventListener): () => void {
    return this.bus.on(listener);
  }

  canGoNext(): boolean {
    const cur = this.getCurrentStep();
    return Boolean(cur?.nextStep) && this.state.status === "running";
  }

  canGoBack(): boolean {
    const cur = this.getCurrentStep();
    return Boolean(cur?.previousStep) && this.state.status === "running";
  }

  canSkip(): boolean {
    const cur = this.getCurrentStep();
    return Boolean(cur?.optional && cur.nextStep) && this.state.status === "running";
  }

  /* -------------------------------- Steuerung ------------------------------- */

  start(): NavigatorState {
    const first = this.visibleSteps()[0];
    if (!first) throw new NavigatorError("invalid_state", "Der Ablauf enthält keine Schritte.");
    const ts = this.now().toISOString();
    this.state.startedAt = ts;
    this.state.status = "running";
    this.state.currentStep = first.id;
    this.state.visitedSteps = [first.id];
    this.state.completedSteps = [];
    this.state.skippedSteps = [];
    this.emit("NavigatorStarted", first.id);
    this.emit("StepEntered", first.id);
    return this.commit();
  }

  /** Aktuellen Schritt abschließen und zum nächsten Schritt wechseln. */
  next(): NavigatorState {
    this.assertRunning();
    const cur = this.requireCurrent();
    this.markCompleted(cur.id);
    this.emit("StepCompleted", cur.id);
    if (!cur.nextStep) return this.finish();
    return this.enter(cur.nextStep);
  }

  back(): NavigatorState {
    this.assertRunning();
    const cur = this.requireCurrent();
    if (!cur.previousStep) {
      throw new NavigatorError("invalid_transition", "Es gibt keinen vorherigen Schritt.");
    }
    return this.enter(cur.previousStep);
  }

  /** Optionalen Schritt überspringen. */
  skip(): NavigatorState {
    this.assertRunning();
    const cur = this.requireCurrent();
    if (!cur.optional) {
      throw new NavigatorError("step_not_optional", `Schritt "${cur.title}" ist nicht optional.`);
    }
    if (!this.state.skippedSteps.includes(cur.id)) this.state.skippedSteps.push(cur.id);
    this.state.completedSteps = this.state.completedSteps.filter((id) => id !== cur.id);
    this.emit("StepSkipped", cur.id);
    if (!cur.nextStep) return this.finish();
    return this.enter(cur.nextStep);
  }

  /** Direkter Sprung – ausschließlich intern/programmatisch. */
  goTo(stepId: string): NavigatorState {
    this.assertRunning();
    const exists = this.visibleSteps().some((s) => s.id === stepId);
    if (!exists) throw new NavigatorError("not_found", `Schritt "${stepId}" existiert nicht.`);
    return this.enter(stepId);
  }

  pause(): NavigatorState {
    if (this.state.status !== "running") {
      throw new NavigatorError("invalid_state", "Nur laufende Vorgänge können pausiert werden.");
    }
    this.state.status = "paused";
    this.emit("NavigatorPaused", this.state.currentStep);
    return this.commit();
  }

  resume(): NavigatorState {
    if (this.state.status !== "paused") {
      throw new NavigatorError("invalid_state", "Nur pausierte Vorgänge können fortgesetzt werden.");
    }
    this.state.status = "running";
    this.emit("NavigatorResumed", this.state.currentStep);
    return this.commit();
  }

  cancel(reason?: string): NavigatorState {
    if (this.state.status === "finished" || this.state.status === "cancelled") {
      throw new NavigatorError("invalid_state", "Der Vorgang ist bereits beendet.");
    }
    this.state.status = "cancelled";
    this.emit("NavigatorCancelled", this.state.currentStep, reason ? { reason } : undefined);
    return this.commit();
  }

  restart(): NavigatorState {
    this.bus.clear();
    this.state.status = "idle";
    this.state.currentStep = null;
    this.state.visitedSteps = [];
    this.state.completedSteps = [];
    this.state.skippedSteps = [];
    this.state.context = {};
    this.emit("NavigatorRestarted", null);
    return this.start();
  }

  /** Serialisierbaren Kontext ergänzen (z. B. spätere Antworten). */
  patchContext(patch: Record<string, unknown>): NavigatorState {
    this.state.context = { ...this.state.context, ...patch };
    return this.commit();
  }

  /* --------------------------------- Intern -------------------------------- */

  private finish(): NavigatorState {
    this.state.status = "finished";
    this.emit("NavigatorFinished", this.state.currentStep);
    return this.commit();
  }

  private enter(stepId: string): NavigatorState {
    this.state.currentStep = stepId;
    if (!this.state.visitedSteps.includes(stepId)) this.state.visitedSteps.push(stepId);
    this.emit("StepEntered", stepId);
    return this.commit();
  }

  private markCompleted(stepId: string): void {
    if (!this.state.completedSteps.includes(stepId)) this.state.completedSteps.push(stepId);
    this.state.skippedSteps = this.state.skippedSteps.filter((id) => id !== stepId);
  }

  private assertRunning(): void {
    if (this.state.status !== "running") {
      throw new NavigatorError(
        "invalid_state",
        "Navigation ist nur bei laufendem Vorgang möglich (aktuell: " + this.state.status + ").",
      );
    }
  }

  private requireCurrent(): NavigatorStep {
    const cur = this.getCurrentStep();
    if (!cur) throw new NavigatorError("invalid_state", "Kein aktueller Schritt gesetzt.");
    return cur;
  }

  private visibleSteps(): NavigatorStepDefinition[] {
    return this.flow.steps.filter((s) => s.visible !== false);
  }

  private processedIds(): Set<string> {
    return new Set([...this.state.completedSteps, ...this.state.skippedSteps]);
  }

  private statusOf(id: string): NavigatorStepStatus {
    if (this.state.skippedSteps.includes(id)) return "skipped";
    if (this.state.completedSteps.includes(id)) return "completed";
    if (this.state.currentStep === id) return "current";
    return "pending";
  }

  private toStep(
    def: NavigatorStepDefinition,
    index: number,
    all: NavigatorStepDefinition[],
  ): NavigatorStep {
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      type: def.type,
      status: this.statusOf(def.id),
      optional: def.optional === true,
      visible: def.visible !== false,
      completed: this.state.completedSteps.includes(def.id),
      nextStep: index < all.length - 1 ? all[index + 1].id : null,
      previousStep: index > 0 ? all[index - 1].id : null,
      metadata: def.metadata ?? {},
    };
  }

  private emit(name: NavigatorEventName, stepId: string | null, detail?: Record<string, unknown>) {
    this.bus.emit({
      name,
      navigatorId: this.state.navigatorId,
      stepId,
      at: this.now().toISOString(),
      detail,
    });
  }

  private commit(): NavigatorState {
    this.state.updatedAt = this.now().toISOString();
    this.state.progress = NavigatorProgressCalculator.calculate(
      this.flow.steps,
      this.processedIds(),
      this.state.currentStep,
    );
    this.store.save(this.state);
    return this.getState();
  }
}
