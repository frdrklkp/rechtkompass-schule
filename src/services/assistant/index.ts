/** Sprint 4.6F – Barrel-Export des Entscheidungsassistenten. */
export * from "./types";
export {
  AssistantDescriptionAnalyzer,
  defaultDescriptionAnalyzer,
  normalizeDescription,
  evidenceFor,
  roleLabel,
  locationLabel,
} from "./descriptionAnalysis";
export {
  AssistantSituationBuilder,
  defaultSituationBuilder,
  titleFromDescription,
} from "./AssistantSituationBuilder";
export type { BuiltAssistantSituation } from "./AssistantSituationBuilder";
export {
  AssistantCoverageCalculator,
  defaultCoverageCalculator,
  COVERAGE_THRESHOLDS,
} from "./AssistantCoverage";
export {
  AssistantQuestionPlanner,
  defaultQuestionPlanner,
  MAX_FOLLOW_UP_QUESTIONS,
} from "./AssistantQuestionPlanner";
export {
  InMemoryAssistantSessionStore,
  LocalStorageAssistantSessionStore,
  isCompatibleAssistantSession,
} from "./AssistantSessionStore";
export type { AssistantSessionStorePort } from "./AssistantSessionStore";
export { AssistantEventBus } from "./AssistantEventBus";
export {
  AssistantOrchestrator,
  AssistantError,
  MIN_DESCRIPTION_LENGTH,
} from "./AssistantOrchestrator";
export type { AssistantOrchestratorOptions } from "./AssistantOrchestrator";
export { startNavigatorFromAssistant } from "./AssistantNavigatorHandoff";
export type {
  AssistantHandoffOptions,
  AssistantHandoffResult,
} from "./AssistantNavigatorHandoff";

