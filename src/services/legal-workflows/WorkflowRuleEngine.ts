/**
 * Deterministische Regel-Engine.
 * Keine Hardcodierung fachlicher Logik. Alle Regeln werden aus dem Template
 * bezogen (workflow_rules). Ergebnis: Menge von Actions, die auf die Session
 * anzuwenden sind.
 */
import type {
  WorkflowRule,
  WorkflowTemplate,
  WorkflowExecutionSession,
  WorkflowStep,
} from "./types";

export type WorkflowRuleAction =
  | { kind: "unlock_step"; stepId: string; reason: string }
  | { kind: "block_workflow"; reason: string }
  | { kind: "set_priority"; stepId: string; priority: string; reason: string }
  | { kind: "recommend"; stepId: string; reason: string };

function findStepByTitle(tpl: WorkflowTemplate, title: string): WorkflowStep | null {
  for (const p of tpl.phases) for (const s of p.steps) if (s.title === title) return s;
  return null;
}

function findStepById(tpl: WorkflowTemplate, id: string): WorkflowStep | null {
  for (const p of tpl.phases) for (const s of p.steps) if (s.id === id) return s;
  return null;
}

function completedStepIds(session: WorkflowExecutionSession): Set<string> {
  return new Set(session.steps.filter((s) => s.status === "completed").map((s) => s.stepId));
}

function checklistDoneMap(session: WorkflowExecutionSession): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const st of session.steps) {
    m.set(st.stepId, new Set(st.checklistState.filter((c) => c.done).map((c) => c.itemId)));
  }
  return m;
}

export const WorkflowRuleEngine = {
  /** Führt alle Regeln aus und liefert die resultierenden Aktionen zurück. */
  evaluate(tpl: WorkflowTemplate, session: WorkflowExecutionSession): WorkflowRuleAction[] {
    const actions: WorkflowRuleAction[] = [];
    const completed = completedStepIds(session);
    const checkDone = checklistDoneMap(session);

    const rules = [...tpl.rules].sort((a, b) => a.priority - b.priority);
    for (const r of rules) {
      const act = this.matchRule(r, tpl, { completed, checkDone });
      if (act) actions.push(...act);
    }
    return actions;
  },

  matchRule(
    rule: WorkflowRule,
    tpl: WorkflowTemplate,
    ctx: { completed: Set<string>; checkDone: Map<string, Set<string>> },
  ): WorkflowRuleAction[] | null {
    switch (rule.whenType) {
      case "step_completed": {
        if (!rule.whenRef) return null;
        const step = findStepByTitle(tpl, rule.whenRef) ?? findStepById(tpl, rule.whenRef);
        if (!step || !ctx.completed.has(step.id)) return null;
        return this.buildActions(rule, tpl, `„${step.title}" ist abgeschlossen`);
      }
      case "checklist_missing": {
        // whenRef = Checklisten-Titel; über alle Steps prüfen
        if (!rule.whenRef) return null;
        let missing = false;
        for (const phase of tpl.phases) for (const step of phase.steps) {
          for (const c of step.checklists) {
            if (c.title === rule.whenRef) {
              const done = ctx.checkDone.get(step.id)?.has(c.id) ?? false;
              if (!done) { missing = true; break; }
            }
          }
        }
        if (!missing) return null;
        return this.buildActions(rule, tpl, `Checklistenpunkt „${rule.whenRef}" fehlt`);
      }
      case "document_missing": {
        // heuristisch: kein Execution-Signal, daher passive Empfehlung
        if (!rule.whenRef) return null;
        return this.buildActions(rule, tpl, `Pflichtdokument „${rule.whenRef}" fehlt`);
      }
      default:
        return null;
    }
  },

  buildActions(rule: WorkflowRule, tpl: WorkflowTemplate, reason: string): WorkflowRuleAction[] {
    switch (rule.thenAction) {
      case "unlock_step": {
        if (!rule.thenRef) return [];
        const s = findStepByTitle(tpl, rule.thenRef) ?? findStepById(tpl, rule.thenRef);
        return s ? [{ kind: "unlock_step", stepId: s.id, reason }] : [];
      }
      case "block_workflow":
        return [{ kind: "block_workflow", reason }];
      case "set_priority": {
        if (!rule.thenRef) return [];
        const [ref, prio] = rule.thenRef.split("|");
        const s = findStepByTitle(tpl, ref) ?? findStepById(tpl, ref);
        return s ? [{ kind: "set_priority", stepId: s.id, priority: prio ?? "high", reason }] : [];
      }
      case "recommend": {
        if (!rule.thenRef) return [];
        const s = findStepByTitle(tpl, rule.thenRef) ?? findStepById(tpl, rule.thenRef);
        return s ? [{ kind: "recommend", stepId: s.id, reason }] : [];
      }
      default:
        return [];
    }
  },
};
