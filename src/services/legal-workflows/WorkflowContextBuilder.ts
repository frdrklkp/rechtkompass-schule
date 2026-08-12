/**
 * Baut das (readonly) Kontextobjekt, das dem Nutzer während einer Session
 * gezeigt wird: Template, Session, Ready-Steps, Fortschritt, Empfehlungen,
 * evaluierte Regeln. Kein Persistenzzugriff – nur Aggregation.
 */
import { WorkflowNavigator } from "./WorkflowNavigator";
import { WorkflowProgressCalculator } from "./WorkflowProgressCalculator";
import { WorkflowRecommendationService } from "./WorkflowRecommendationService";
import { WorkflowRuleEngine, type WorkflowRuleAction } from "./WorkflowRuleEngine";
import type {
  WorkflowExecutionSession,
  WorkflowProgress,
  WorkflowRecommendation,
  WorkflowStep,
  WorkflowTemplate,
} from "./types";

export interface WorkflowRuntimeContext {
  template: WorkflowTemplate;
  session: WorkflowExecutionSession;
  readySteps: WorkflowStep[];
  progress: WorkflowProgress;
  recommendations: WorkflowRecommendation[];
  ruleActions: WorkflowRuleAction[];
  isBlocked: boolean;
}

export const WorkflowContextBuilder = {
  build(tpl: WorkflowTemplate, session: WorkflowExecutionSession): WorkflowRuntimeContext {
    const readySteps = WorkflowNavigator.readySteps(tpl, session);
    const progress = WorkflowProgressCalculator.compute(tpl, session);
    const recommendations = WorkflowRecommendationService.recommend(tpl, session);
    const ruleActions = WorkflowRuleEngine.evaluate(tpl, session);
    const isBlocked = ruleActions.some((a) => a.kind === "block_workflow");
    return { template: tpl, session, readySteps, progress, recommendations, ruleActions, isBlocked };
  },
};
