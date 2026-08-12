/** Sprint 4.6C – Barrel-Export der Assessment Engine. */
export * from "./types";
export { ASSESSMENT_FIELD_LABELS, labelForField } from "./fieldLabels";
export { STANDARD_ASSESSMENT_RULES } from "./standardAssessmentRules";
export { AssessmentRuleRegistry } from "./AssessmentRuleRegistry";
export {
  AssessmentRuleEvaluator,
  evaluateCondition,
  readField,
} from "./AssessmentRuleEvaluator";
export type { RuleEvaluation } from "./AssessmentRuleEvaluator";
export {
  AssessmentResultAggregator,
  affectsTrafficLight,
} from "./AssessmentResultAggregator";
export type { AggregationInput, AggregationOutput } from "./AssessmentResultAggregator";
export { AssessmentConfidenceCalculator } from "./AssessmentConfidenceCalculator";
export { AssessmentConflictResolver } from "./AssessmentConflictResolver";
export { AssessmentValidator } from "./AssessmentValidator";
export { AssessmentEventBus } from "./AssessmentEventBus";
export { computeInputHash, stableStringify, djb2 } from "./inputHash";
export { AssessmentEngine, AssessmentError } from "./AssessmentEngine";
export type { AssessmentEngineOptions } from "./AssessmentEngine";
export { buildSituationOverview } from "./SituationOverview";
export type { SituationOverview } from "./SituationOverview";
