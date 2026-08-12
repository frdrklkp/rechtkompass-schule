/**
 * Sprint 4.5A – Baut den (readonly) Kontext für die Platzhalterauflösung.
 * Rein aus vorhandenem Workflow-Kontext. Keine externen Datenquellen.
 */
import type {
  WorkflowExecutionSession,
  WorkflowRuntimeContext,
  WorkflowStep,
} from "@/services/legal-workflows";

export interface BuildContextInput {
  session: WorkflowExecutionSession;
  runtime: WorkflowRuntimeContext;
  actor: string | null;
  actorDisplayName?: string | null;
  school?: string | null;
  now?: Date;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("de-DE");
}

function stepTitle(t: WorkflowRuntimeContext["template"], stepId: string): string {
  for (const p of t.phases) for (const s of p.steps) if (s.id === stepId) return s.title;
  return stepId;
}

function collectSources(t: WorkflowRuntimeContext["template"]) {
  const seen = new Set<string>();
  const out: Array<{ id: string; citation: string; note: string | null }> = [];
  for (const phase of t.phases) {
    for (const step of phase.steps) {
      for (const src of step.sources) {
        const key = src.legalSectionId ?? src.citationHint ?? src.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: src.id,
          citation: src.citationHint ?? src.legalSectionId ?? "Rechtsgrundlage",
          note: src.note ?? null,
        });
      }
    }
  }
  return out;
}

function collectRoles(t: WorkflowRuntimeContext["template"]) {
  const seen = new Set<string>();
  const out: Array<{ role: string }> = [];
  for (const phase of t.phases) {
    for (const step of phase.steps) {
      if (step.primaryRole && !seen.has(step.primaryRole)) {
        seen.add(step.primaryRole);
        out.push({ role: step.primaryRole });
      }
      for (const r of step.roles) {
        if (seen.has(r.role)) continue;
        seen.add(r.role);
        out.push({ role: r.role });
      }
    }
  }
  return out;
}

function collectChecklists(runtime: WorkflowRuntimeContext) {
  const t = runtime.template;
  const stateById = new Map(runtime.session.steps.map((s) => [s.stepId, s]));
  const out: Array<{ step: string; title: string; done: boolean }> = [];
  for (const phase of t.phases) {
    for (const step of phase.steps) {
      const stExec = stateById.get(step.id);
      const chkState = new Map((stExec?.checklistState ?? []).map((c) => [c.itemId, c]));
      for (const item of step.checklists) {
        out.push({
          step: step.title,
          title: item.title,
          done: !!chkState.get(item.id)?.done,
        });
      }
    }
  }
  return out;
}

function collectNotes(runtime: WorkflowRuntimeContext) {
  return runtime.session.steps
    .filter((s) => s.note && s.note.trim() !== "")
    .map((s) => ({ step: stepTitle(runtime.template, s.stepId), note: s.note as string }));
}

function findCurrentStep(runtime: WorkflowRuntimeContext): WorkflowStep | null {
  const active = runtime.session.steps.find((s) => s.status === "active");
  if (active) {
    for (const p of runtime.template.phases) for (const s of p.steps) if (s.id === active.stepId) return s;
  }
  return runtime.readySteps[0] ?? null;
}

function findCurrentPhase(runtime: WorkflowRuntimeContext) {
  const cur = findCurrentStep(runtime);
  if (!cur) return runtime.template.phases[0] ?? null;
  return runtime.template.phases.find((p) => p.id === cur.phaseId) ?? null;
}

export function buildDocumentContext(input: BuildContextInput): Record<string, unknown> {
  const { runtime, session, actor, actorDisplayName, school, now = new Date() } = input;
  const step = findCurrentStep(runtime);
  const phase = findCurrentPhase(runtime);
  const context = session.context ?? {};

  return {
    workflow: {
      id: runtime.template.id,
      slug: runtime.template.slug,
      title: runtime.template.title,
      subtitle: runtime.template.subtitle ?? "",
      version: runtime.template.currentVersionId ?? "",
    },
    workflow_version: session.templateVersionId ?? runtime.template.currentVersionId ?? "",
    phase: phase
      ? { id: phase.id, title: phase.title, description: phase.description ?? "" }
      : { id: "", title: "", description: "" },
    step: step
      ? { id: step.id, title: step.title, description: step.description ?? "", goal: step.goal ?? "" }
      : { id: "", title: "", description: "", goal: "" },
    date: fmtDate(now),
    user: {
      id: actor ?? "",
      name: actorDisplayName ?? "",
    },
    school: school ?? "",
    participants: (context.participants as unknown) ?? [],
    checklists: collectChecklists(runtime),
    notes: collectNotes(runtime),
    recommendations: runtime.recommendations.map((r) => ({
      step: stepTitle(runtime.template, r.stepId),
      reason: r.reason,
      priority: r.priority,
      risk: r.riskLevel,
    })),
    sources: collectSources(runtime.template),
    roles: collectRoles(runtime.template),
    context, // Rohkontext für erweiterte Vorlagen
  };
}
