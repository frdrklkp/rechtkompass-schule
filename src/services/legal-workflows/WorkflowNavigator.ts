/**
 * Bestimmt für eine Session, welche Schritte gerade bearbeitbar sind.
 * Rein deterministisch: ein Schritt ist "ready", wenn alle seine
 * Abhängigkeiten "completed" oder "skipped" sind und er selbst weder
 * completed noch skipped ist.
 */
import type { WorkflowExecutionSession, WorkflowStep, WorkflowTemplate } from "./types";

export const WorkflowNavigator = {
  allSteps(tpl: WorkflowTemplate): WorkflowStep[] {
    return tpl.phases.flatMap((p) => p.steps);
  },

  readySteps(tpl: WorkflowTemplate, session: WorkflowExecutionSession): WorkflowStep[] {
    const statusById = new Map(session.steps.map((s) => [s.stepId, s.status]));
    const done = (id: string) => {
      const st = statusById.get(id);
      return st === "completed" || st === "skipped";
    };
    const result: WorkflowStep[] = [];
    for (const step of this.allSteps(tpl)) {
      const st = statusById.get(step.id) ?? "open";
      if (st === "completed" || st === "skipped") continue;
      const depsSatisfied = step.dependsOn.every(done);
      if (depsSatisfied) result.push(step);
    }
    // Sort: priority(critical>high>normal>low), then phase order, then sortOrder
    const prioOrder = { critical: 0, high: 1, normal: 2, low: 3 } as const;
    const phaseOrder = new Map(tpl.phases.map((p, i) => [p.id, p.sortOrder ?? i]));
    return result.sort((a, b) =>
      prioOrder[a.priority] - prioOrder[b.priority] ||
      (phaseOrder.get(a.phaseId) ?? 0) - (phaseOrder.get(b.phaseId) ?? 0) ||
      a.sortOrder - b.sortOrder,
    );
  },
};
