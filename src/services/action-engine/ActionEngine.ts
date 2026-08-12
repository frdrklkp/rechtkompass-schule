/**
 * Sprint 4.6D – Zentrale Action Engine.
 * Übersetzt ein gültiges AssessmentResult deterministisch in priorisierte
 * Handlungsschritte. Keine KI, keine Rechtsauslegung, keine Dokumentengenerierung.
 */
import { djb2, stableStringify } from "@/services/assessment-engine";
import { ActionConflictDetector } from "./ActionConflictDetector";
import { ActionDependencyResolver } from "./ActionDependencyResolver";
import { ActionEventBus } from "./ActionEventBus";
import { ActionProgressCalculator } from "./ActionProgressCalculator";
import { ActionResultAggregator } from "./ActionResultAggregator";
import { ActionRuleEvaluator, type ActionRuleEvaluation } from "./ActionRuleEvaluator";
import { ActionRuleRegistry } from "./ActionRuleRegistry";
import { ActionValidator } from "./ActionValidator";
import { STANDARD_ACTION_RULES } from "./standardActionRules";
import {
  ACTION_GROUP_DESCRIPTION,
  ACTION_GROUP_LABEL,
  ACTION_GROUP_ORDER,
  ACTION_SCHEMA_VERSION,
  ACTION_STANDARD_LIMITATIONS,
  type ActionConflict,
  type ActionContextEntry,
  type ActionGroupView,
  type ActionInput,
  type ActionItem,
  type ActionPlan,
  type ActionPlanDelta,
  type ActionPlanStatus,
  type ActionRule,
  type ActionTemplate,
  type ActionValidationResult,
  type ResponsibleRole,
} from "./types";

export class ActionError extends Error {
  constructor(
    public readonly code:
      | "situation_missing"
      | "assessment_missing"
      | "assessment_stale"
      | "assessment_conflicted"
      | "assessment_status_not_evaluable"
      | "situation_invalid"
      | "rule_definition_invalid"
      | "plan_incompatible"
      | "generation_failed",
    message: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export interface ActionEngineOptions {
  navigatorId: string;
  workflowId: string;
  rules?: ActionRule[];
  now?: () => Date;
  idFactory?: () => string;
}

function defaultId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `plan_${crypto.randomUUID()}`;
    }
  } catch {
    /* Fallback unten */
  }
  return `plan_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Inhaltsrelevanter Hash einer Maßnahme (ohne Bearbeitungsstand). */
export function actionSignature(action: Pick<
  ActionItem,
  "actionKey" | "title" | "description" | "group" | "priority" | "required" | "dependencies" | "prerequisites"
>): string {
  return djb2(
    stableStringify({
      actionKey: action.actionKey,
      title: action.title,
      description: action.description,
      group: action.group,
      priority: action.priority,
      required: action.required,
      dependencies: [...action.dependencies].sort(),
      prerequisites: action.prerequisites.map((p) => `${p.type}:${p.reference}`).sort(),
    }),
  );
}

const CLOSED_STATUS: ActionItem["status"][] = ["completed", "skipped", "notApplicable"];

export class ActionEngine {
  private readonly registry: ActionRuleRegistry;
  private readonly evaluator = new ActionRuleEvaluator();
  private readonly aggregator = new ActionResultAggregator();
  private readonly dependencyResolver = new ActionDependencyResolver();
  private readonly conflictDetector = new ActionConflictDetector();
  private readonly progressCalculator = new ActionProgressCalculator();
  private readonly validator = new ActionValidator();
  readonly events = new ActionEventBus();

  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(private readonly options: ActionEngineOptions) {
    this.registry = new ActionRuleRegistry(options.rules ?? STANDARD_ACTION_RULES);
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultId;
  }

  getRegistry(): ActionRuleRegistry {
    return this.registry;
  }

  rulesVersionHash(): string {
    return this.registry.versionHash();
  }

  /* ------------------------------ Service API ----------------------------- */

  /** Leerer Plan im Status `notGenerated`. */
  createActionPlan(caseId: string): ActionPlan {
    const ts = this.now().toISOString();
    return {
      schemaVersion: ACTION_SCHEMA_VERSION,
      actionPlanId: this.idFactory(),
      caseId,
      navigatorId: this.options.navigatorId,
      workflowId: this.options.workflowId,
      status: "notGenerated",
      assessmentId: "",
      assessmentInputHash: "",
      generatedFromAssessmentHash: "",
      sourceAssessmentHash: "",
      currentAssessmentHash: "",
      rulesVersionHash: this.rulesVersionHash(),
      groups: this.buildGroups([]),
      actions: [],
      history: [],
      conflicts: [],
      missingPrerequisites: [],
      limitations: [...ACTION_STANDARD_LIMITATIONS],
      progress: this.progressCalculator.calculate([]),
      isStale: false,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  validateInput(input: Partial<ActionInput> | null | undefined): ActionValidationResult {
    return this.validator.validate(input);
  }

  getApplicableRules(input: ActionInput): ActionRule[] {
    return this.registry.listEnabled().filter((rule) => this.evaluateRule(input, rule).matched);
  }

  evaluateRule(input: ActionInput, rule: ActionRule): ActionRuleEvaluation {
    return this.evaluator.evaluate(input, rule);
  }

  aggregateActions(actions: ActionItem[]): ActionItem[] {
    return this.aggregator.aggregate(actions);
  }

  resolveDependencies(actions: ActionItem[]) {
    return this.dependencyResolver.resolve(actions);
  }

  detectConflicts(
    actions: ActionItem[],
    raw: ActionItem[],
    cycles: string[][],
    input: ActionInput,
  ): ActionConflict[] {
    return this.conflictDetector.detect(actions, raw, cycles, input);
  }

  calculateProgress(actions: ActionItem[]) {
    return this.progressCalculator.calculate(actions);
  }

  blockingReasons(plan: ActionPlan): string[] {
    return this.progressCalculator.blockingReasons(plan.actions);
  }

  /** Erzeugt einen neuen Maßnahmenplan aus Situation und Bewertung. */
  generateActions(input: ActionInput): ActionPlan {
    const validation = this.validateInput(input);
    if (!validation.valid) {
      const first = validation.issues[0];
      this.events.emit("ActionPlanFailed", input.caseId ?? "", { code: first.code });
      throw new ActionError(first.code, first.message);
    }

    this.events.emit("ActionPlanGenerationStarted", input.caseId, {
      assessmentId: input.assessment.assessmentId,
    });

    const ts = input.generatedAt || this.now().toISOString();
    const raw: ActionItem[] = [];

    for (const rule of this.registry.listEnabled()) {
      const evaluation = this.evaluator.evaluate(input, rule);
      if (!evaluation.matched) continue;
      this.events.emit("ActionRuleMatched", input.caseId, { ruleId: rule.id });
      for (const template of rule.actions) {
        const action = this.buildAction(template, rule, input, ts);
        raw.push(action);
        this.events.emit("ActionCreated", input.caseId, { actionKey: action.actionKey });
      }
      if (rule.stopProcessing) break;
    }

    const aggregated = this.aggregateActions(raw);
    const resolution = this.dependencyResolver.resolve(aggregated);
    const conflicts = this.conflictDetector.detect(resolution.actions, raw, resolution.cycles, input);
    for (const conflict of conflicts) {
      this.events.emit("ActionConflictDetected", input.caseId, { conflictId: conflict.id });
    }
    for (const action of resolution.actions) {
      if (action.status === "blocked") {
        this.events.emit("ActionBlocked", input.caseId, { actionKey: action.actionKey });
      }
    }

    const progress = this.progressCalculator.calculate(resolution.actions);
    const assessmentHash = input.assessment.evaluatedInputHash || input.assessment.inputHash;

    const plan: ActionPlan = {
      schemaVersion: ACTION_SCHEMA_VERSION,
      actionPlanId: this.idFactory(),
      caseId: input.caseId,
      navigatorId: input.navigatorId,
      workflowId: input.workflowId,
      status: this.deriveStatus(resolution.actions, conflicts, progress),
      assessmentId: input.assessment.assessmentId,
      assessmentInputHash: input.assessment.inputHash,
      generatedFromAssessmentHash: assessmentHash,
      sourceAssessmentHash: assessmentHash,
      currentAssessmentHash: assessmentHash,
      rulesVersionHash: this.rulesVersionHash(),
      groups: this.buildGroups(resolution.actions),
      actions: resolution.actions,
      history: [],
      conflicts,
      missingPrerequisites: resolution.missingPrerequisites,
      limitations: [...ACTION_STANDARD_LIMITATIONS],
      progress,
      isStale: false,
      createdAt: ts,
      updatedAt: ts,
    };

    this.events.emit("ActionPlanGenerated", input.caseId, {
      actionCount: plan.actions.length,
      status: plan.status,
    });
    return plan;
  }

  /** Neugenerierung mit Übernahme unveränderter Bearbeitungsstände. */
  regenerateActionPlan(
    input: ActionInput,
    previous: ActionPlan | null,
  ): { plan: ActionPlan; delta: ActionPlanDelta } {
    const next = this.generateActions(input);
    if (!previous) {
      return {
        plan: next,
        delta: { added: next.actions, unchanged: [], changed: [], removed: [] },
      };
    }

    const delta = this.compareActionPlans(previous, next);
    const previousByKey = new Map(previous.actions.map((a) => [a.actionKey, a]));

    const carried = next.actions.map((action) => {
      const before = previousByKey.get(action.actionKey);
      if (!before) return action;
      if (before.signature === action.signature) {
        return {
          ...action,
          status: before.status,
          completionData: { ...before.completionData },
          carryOverReviewRequired: false,
          updatedAt: before.updatedAt,
        };
      }
      // Wesentlich geändert: Status wird nicht automatisch übernommen.
      return {
        ...action,
        status: "open" as const,
        completionData: { ...action.completionData, note: before.completionData.note },
        carryOverReviewRequired: CLOSED_STATUS.includes(before.status),
      };
    });

    const resolution = this.dependencyResolver.resolve(carried);
    const progress = this.progressCalculator.calculate(resolution.actions);
    const history = [
      ...previous.history,
      ...delta.removed.map((a) => ({ ...a, noLongerCurrent: true, status: "cancelled" as const })),
    ];

    const plan: ActionPlan = {
      ...next,
      actionPlanId: previous.actionPlanId,
      createdAt: previous.createdAt,
      actions: resolution.actions,
      groups: this.buildGroups(resolution.actions),
      missingPrerequisites: resolution.missingPrerequisites,
      history,
      progress,
      status: this.deriveStatus(resolution.actions, next.conflicts, progress),
      updatedAt: this.now().toISOString(),
    };

    this.events.emit("ActionPlanRegenerated", input.caseId, {
      added: delta.added.length,
      changed: delta.changed.length,
      removed: delta.removed.length,
    });
    return { plan, delta };
  }

  compareActionPlans(previous: ActionPlan, next: ActionPlan): ActionPlanDelta {
    const previousByKey = new Map(previous.actions.map((a) => [a.actionKey, a]));
    const nextByKey = new Map(next.actions.map((a) => [a.actionKey, a]));

    const added: ActionItem[] = [];
    const unchanged: ActionItem[] = [];
    const changed: Array<{ previous: ActionItem; next: ActionItem }> = [];

    for (const action of next.actions) {
      const before = previousByKey.get(action.actionKey);
      if (!before) added.push(action);
      else if (before.signature === action.signature) unchanged.push(action);
      else changed.push({ previous: before, next: action });
    }
    const removed = previous.actions.filter((a) => !nextByKey.has(a.actionKey));

    return { added, unchanged, changed, removed };
  }

  /** Markiert einen Plan als veraltet, ohne Bearbeitungsstände zu löschen. */
  markStale(plan: ActionPlan, currentAssessmentHash: string): ActionPlan {
    if (plan.isStale && plan.currentAssessmentHash === currentAssessmentHash) return plan;
    this.events.emit("ActionPlanMarkedStale", plan.caseId, { currentAssessmentHash });
    return {
      ...plan,
      isStale: true,
      status: "stale",
      currentAssessmentHash,
      updatedAt: this.now().toISOString(),
    };
  }

  /** Prüft, ob sich die Grundlage des Plans verändert hat. */
  isStale(
    plan: ActionPlan | null,
    context: { assessmentId: string; assessmentHash: string; assessmentIsStale: boolean },
  ): boolean {
    if (!plan) return false;
    if (context.assessmentIsStale) return true;
    if (plan.assessmentId !== context.assessmentId) return true;
    if (plan.sourceAssessmentHash !== context.assessmentHash) return true;
    if (plan.rulesVersionHash !== this.rulesVersionHash()) return true;
    return false;
  }

  /* --------------------------- Maßnahmenbearbeitung ------------------------ */

  completeAction(
    plan: ActionPlan,
    actionKey: string,
    data: { note?: string; result?: string; completedByRole?: ResponsibleRole | null; confirmation?: boolean },
  ): ActionPlan {
    return this.updateAction(plan, actionKey, (action) => {
      if (action.status === "blocked") {
        throw new ActionError(
          "generation_failed",
          "Diese Maßnahme ist blockiert und kann noch nicht abgeschlossen werden.",
        );
      }
      if (action.confirmationRequired && data.confirmation !== true) {
        throw new ActionError(
          "generation_failed",
          "Für diese Maßnahme ist eine ausdrückliche Bestätigung erforderlich.",
        );
      }
      return {
        ...action,
        status: "completed",
        completionData: {
          completedAt: this.now().toISOString(),
          completedByRole: data.completedByRole ?? null,
          note: data.note ?? "",
          result: data.result ?? "",
          confirmation: data.confirmation === true,
          justification: "",
        },
        carryOverReviewRequired: false,
      };
    }, "ActionCompleted");
  }

  reopenAction(plan: ActionPlan, actionKey: string): ActionPlan {
    return this.updateAction(plan, actionKey, (action) => ({
      ...action,
      status: "open",
      completionData: {
        completedAt: null,
        completedByRole: null,
        note: action.completionData.note,
        result: "",
        confirmation: false,
        justification: "",
      },
      carryOverReviewRequired: false,
    }), "ActionReopened");
  }

  skipAction(plan: ActionPlan, actionKey: string, justification: string): ActionPlan {
    return this.updateAction(plan, actionKey, (action) => {
      if (action.required && justification.trim().length === 0) {
        throw new ActionError(
          "generation_failed",
          "Eine verpflichtende Maßnahme kann nur mit Begründung übersprungen werden.",
        );
      }
      if (!action.allowSkip && !action.required) {
        throw new ActionError("generation_failed", "Diese Maßnahme kann nicht übersprungen werden.");
      }
      return {
        ...action,
        status: "skipped",
        completionData: {
          ...action.completionData,
          completedAt: this.now().toISOString(),
          justification: justification.trim(),
        },
      };
    }, "ActionSkipped");
  }

  markNotApplicable(plan: ActionPlan, actionKey: string, justification: string): ActionPlan {
    return this.updateAction(plan, actionKey, (action) => {
      if (justification.trim().length === 0) {
        throw new ActionError(
          "generation_failed",
          "Bitte begründen Sie, warum diese Maßnahme nicht zutrifft.",
        );
      }
      if (!action.allowNotApplicable && action.required) {
        throw new ActionError(
          "generation_failed",
          "Diese verpflichtende Maßnahme kann nicht als nicht zutreffend markiert werden.",
        );
      }
      return {
        ...action,
        status: "notApplicable",
        completionData: {
          ...action.completionData,
          completedAt: this.now().toISOString(),
          justification: justification.trim(),
        },
      };
    }, "ActionMarkedNotApplicable");
  }

  updateActionNote(plan: ActionPlan, actionKey: string, note: string): ActionPlan {
    return this.updateAction(plan, actionKey, (action) => ({
      ...action,
      completionData: { ...action.completionData, note },
    }), "ActionUpdated");
  }

  resetActionPlan(plan: ActionPlan): ActionPlan {
    this.events.emit("ActionPlanReset", plan.caseId);
    const fresh = this.createActionPlan(plan.caseId);
    return { ...fresh, actionPlanId: plan.actionPlanId, history: [...plan.history, ...plan.actions] };
  }

  /* ------------------------------ Serialisierung --------------------------- */

  serialize(plan: ActionPlan): string {
    return JSON.stringify(plan);
  }

  deserialize(raw: string | unknown): ActionPlan {
    let value: unknown = raw;
    if (typeof raw === "string") {
      try {
        value = JSON.parse(raw);
      } catch {
        throw new ActionError("plan_incompatible", "Der gespeicherte Maßnahmenplan konnte nicht gelesen werden.");
      }
    }
    if (!value || typeof value !== "object") {
      throw new ActionError("plan_incompatible", "Der gespeicherte Maßnahmenplan ist ungültig.");
    }
    const plan = value as ActionPlan;
    if (plan.schemaVersion !== ACTION_SCHEMA_VERSION || !Array.isArray(plan.actions)) {
      throw new ActionError(
        "plan_incompatible",
        "Der gespeicherte Maßnahmenplan stammt aus einer nicht kompatiblen Version.",
      );
    }
    return plan;
  }

  buildContextEntry(plan: ActionPlan | null, assessmentId: string): ActionContextEntry {
    return {
      schemaVersion: ACTION_SCHEMA_VERSION,
      plan,
      status: plan?.status ?? "notGenerated",
      sourceAssessmentId: plan?.assessmentId ?? assessmentId,
      sourceAssessmentHash: plan?.sourceAssessmentHash ?? "",
      rulesVersionHash: plan?.rulesVersionHash ?? this.rulesVersionHash(),
      isStale: plan?.isStale ?? false,
      generatedAt: plan?.createdAt ?? null,
      updatedAt: plan?.updatedAt ?? null,
    };
  }

  /* --------------------------------- Intern -------------------------------- */

  private updateAction(
    plan: ActionPlan,
    actionKey: string,
    mutate: (action: ActionItem) => ActionItem,
    eventName: Parameters<ActionEventBus["emit"]>[0],
  ): ActionPlan {
    const target = plan.actions.find((a) => a.actionKey === actionKey);
    if (!target) {
      throw new ActionError("plan_incompatible", "Die gewählte Maßnahme ist im Plan nicht vorhanden.");
    }
    const ts = this.now().toISOString();
    const updated = plan.actions.map((action) =>
      action.actionKey === actionKey ? { ...mutate(action), updatedAt: ts } : action,
    );
    const resolution = this.dependencyResolver.resolve(updated);
    const progress = this.progressCalculator.calculate(resolution.actions);
    this.events.emit(eventName, plan.caseId, { actionKey });

    const status = this.deriveStatus(resolution.actions, plan.conflicts, progress);
    if (status === "completed" && plan.status !== "completed") {
      this.events.emit("ActionPlanCompleted", plan.caseId);
    }

    return {
      ...plan,
      actions: resolution.actions,
      groups: this.buildGroups(resolution.actions),
      missingPrerequisites: resolution.missingPrerequisites,
      progress,
      status: plan.isStale ? "stale" : status,
      updatedAt: ts,
    };
  }

  private deriveStatus(
    actions: ActionItem[],
    conflicts: ActionConflict[],
    progress: ActionPlan["progress"],
  ): ActionPlanStatus {
    if (conflicts.some((c) => c.blocksPlan)) return "conflicted";
    if (actions.length === 0) return "incomplete";
    if (progress.isComplete) return "completed";
    if (progress.completedActions > 0 || progress.skippedActions > 0) return "inProgress";
    return "generated";
  }

  private buildGroups(actions: ActionItem[]): ActionGroupView[] {
    return ACTION_GROUP_ORDER.map((group) => ({
      group,
      label: ACTION_GROUP_LABEL[group],
      description: ACTION_GROUP_DESCRIPTION[group],
      actionKeys: actions.filter((a) => a.group === group && a.visible).map((a) => a.actionKey),
    }));
  }

  private buildAction(
    template: ActionTemplate,
    rule: ActionRule,
    input: ActionInput,
    ts: string,
  ): ActionItem {
    const reasonIds = input.assessment.reasons.map((r) => r.id);
    const base = {
      actionKey: template.actionKey,
      title: template.title,
      description: template.description,
      group: template.group,
      priority: template.priority,
      required: template.required,
      dependencies: template.dependsOn ?? [],
      prerequisites: (template.prerequisites ?? []).map((p) => ({ ...p, fulfilled: false })),
    };

    return {
      id: `act_${template.actionKey}`,
      actionKey: template.actionKey,
      ruleId: rule.id,
      ruleIds: [rule.id],
      version: rule.version,
      title: template.title,
      description: template.description,
      group: template.group,
      priority: template.priority,
      status: "open",
      required: template.required,
      visible: true,
      responsibleRole: template.responsibleRole,
      alternativeResponsibleRoles: template.alternativeResponsibleRoles ?? [],
      trigger: {
        triggerType: template.triggerType,
        assessmentRuleIds: input.assessment.matchedRules.map((r) => r.ruleId),
        assessmentReasonIds: reasonIds,
        trafficLight: input.assessment.trafficLight,
        severity: input.assessment.severity,
        sourceFields: template.sourceFields,
        userFacingReason: template.userFacingReason,
      },
      reason: [{ ruleId: rule.id, title: rule.title, userFacingText: template.userFacingReason }],
      prerequisites: base.prerequisites,
      dependencies: base.dependencies,
      blocks: [],
      blockedReason: null,
      estimatedEffort: template.estimatedEffort ?? "unknown",
      documentationRequired: template.documentationRequired ?? false,
      confirmationRequired: template.confirmationRequired ?? false,
      allowSkip: template.allowSkip ?? !template.required,
      allowNotApplicable: template.allowNotApplicable ?? !template.required,
      completionData: {
        completedAt: null,
        completedByRole: null,
        note: "",
        result: "",
        confirmation: false,
        justification: "",
      },
      sourceFields: template.sourceFields,
      carryOverReviewRequired: false,
      noLongerCurrent: false,
      signature: actionSignature(base),
      metadata: { ...(template.metadata ?? {}) },
      createdAt: ts,
      updatedAt: ts,
    };
  }
}
