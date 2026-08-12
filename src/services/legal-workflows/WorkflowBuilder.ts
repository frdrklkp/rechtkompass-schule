/**
 * Kleiner Fluent-Builder – primär für Tests, Seed-Fixtures und
 * spätere Designer-Persistenz. Erzeugt saubere IDs und stabile Sortierung.
 */
import type {
  WorkflowChecklistItem,
  WorkflowDocumentRef,
  WorkflowPhase,
  WorkflowRoleAssignment,
  WorkflowRule,
  WorkflowSourceRef,
  WorkflowStep,
  WorkflowTemplate,
} from "./types";

let seq = 0;
function uid(prefix: string): string {
  seq++;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export class WorkflowBuilder {
  private tpl: WorkflowTemplate;
  private phaseSort = 0;

  constructor(seed?: Partial<WorkflowTemplate>) {
    this.tpl = {
      id: seed?.id ?? uid("tpl"),
      slug: seed?.slug ?? uid("wf"),
      title: seed?.title ?? "Untitled workflow",
      subtitle: seed?.subtitle ?? null,
      description: seed?.description ?? null,
      workflowStatus: seed?.workflowStatus ?? "draft",
      publicationTier: seed?.publicationTier ?? "internal",
      categoryId: seed?.categoryId ?? null,
      currentVersionId: null,
      phases: [],
      rules: [],
    };
  }

  build(): WorkflowTemplate {
    return structuredClone(this.tpl);
  }

  addPhase(input: {
    title: string;
    description?: string;
    isRequired?: boolean;
    id?: string;
  }): PhaseBuilder {
    const phase: WorkflowPhase = {
      id: input.id ?? uid("ph"),
      templateId: this.tpl.id,
      sortOrder: (this.phaseSort += 10),
      title: input.title,
      description: input.description ?? null,
      isRequired: input.isRequired ?? true,
      steps: [],
    };
    this.tpl.phases.push(phase);
    return new PhaseBuilder(this.tpl, phase);
  }

  addRule(rule: Omit<WorkflowRule, "id" | "templateId">): this {
    this.tpl.rules.push({ ...rule, id: uid("rule"), templateId: this.tpl.id });
    return this;
  }
}

export class PhaseBuilder {
  private stepSort = 0;
  constructor(private tpl: WorkflowTemplate, private phase: WorkflowPhase) {}

  addStep(input: {
    id?: string;
    title: string;
    description?: string;
    goal?: string;
    stepType?: WorkflowStep["stepType"];
    priority?: WorkflowStep["priority"];
    isRequired?: boolean;
    estimatedMinutes?: number;
    primaryRole?: WorkflowStep["primaryRole"];
    riskLevel?: WorkflowStep["riskLevel"];
    dependsOn?: string[];
    checklists?: Array<Omit<WorkflowChecklistItem, "id" | "sortOrder">>;
    documents?: Array<Omit<WorkflowDocumentRef, "id">>;
    roles?: Array<Omit<WorkflowRoleAssignment, "id">>;
    sources?: Array<Omit<WorkflowSourceRef, "id">>;
  }): { stepId: string; back: () => WorkflowBuilder } {
    const step: WorkflowStep = {
      id: input.id ?? uid("st"),
      templateId: this.tpl.id,
      phaseId: this.phase.id,
      sortOrder: (this.stepSort += 10),
      title: input.title,
      description: input.description ?? null,
      goal: input.goal ?? null,
      stepType: input.stepType ?? "action",
      priority: input.priority ?? "normal",
      isRequired: input.isRequired ?? true,
      estimatedMinutes: input.estimatedMinutes ?? null,
      primaryRole: input.primaryRole ?? null,
      riskLevel: input.riskLevel ?? "low",
      dependsOn: input.dependsOn ?? [],
      checklists: (input.checklists ?? []).map((c, i) => ({
        ...c, id: uid("cl"), sortOrder: (i + 1) * 10,
      })),
      documents: (input.documents ?? []).map((d) => ({ ...d, id: uid("doc") })),
      roles: (input.roles ?? []).map((r) => ({ ...r, id: uid("rl") })),
      sources: (input.sources ?? []).map((s) => ({ ...s, id: uid("src") })),
    };
    this.phase.steps.push(step);
    return { stepId: step.id, back: () => new WorkflowBuilderFromExisting(this.tpl) };
  }

  back(): WorkflowBuilder { return new WorkflowBuilderFromExisting(this.tpl); }
}

class WorkflowBuilderFromExisting extends WorkflowBuilder {
  constructor(existing: WorkflowTemplate) {
    super({});
    // Reuse the same reference
    (this as unknown as { tpl: WorkflowTemplate }).tpl = existing;
  }
}
