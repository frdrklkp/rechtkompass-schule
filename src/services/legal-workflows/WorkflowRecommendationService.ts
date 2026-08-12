/**
 * Empfiehlt den nächsten sinnvollen Schritt.
 * Deterministisch: nutzt Navigator (ready steps) + Rule-Engine-Actions.
 * Keine KI.
 */
import type {
  WorkflowExecutionSession,
  WorkflowRecommendation,
  WorkflowTemplate,
} from "./types";
import { WorkflowNavigator } from "./WorkflowNavigator";
import { WorkflowRuleEngine } from "./WorkflowRuleEngine";

export const WorkflowRecommendationService = {
  recommend(tpl: WorkflowTemplate, session: WorkflowExecutionSession): WorkflowRecommendation[] {
    const ready = WorkflowNavigator.readySteps(tpl, session);
    const ruleRecs = new Map<string, string>();
    for (const a of WorkflowRuleEngine.evaluate(tpl, session)) {
      if (a.kind === "recommend" || a.kind === "unlock_step") ruleRecs.set(a.stepId, a.reason);
    }

    return ready.slice(0, 5).map((s) => ({
      stepId: s.id,
      reason: ruleRecs.get(s.id) ?? this.defaultReason(s.priority),
      priority: s.priority,
      riskLevel: s.riskLevel,
    }));
  },

  defaultReason(priority: string): string {
    switch (priority) {
      case "critical": return "Kritischer nächster Schritt – bitte zuerst bearbeiten.";
      case "high":     return "Wichtiger nächster Schritt.";
      case "low":      return "Optionaler nächster Schritt.";
      default:         return "Nächster sinnvoller Schritt.";
    }
  },
};
