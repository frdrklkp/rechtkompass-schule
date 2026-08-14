/** Sprint 4.6B – Barrel-Export des Situation Analyzers. */
export * from "./types";
export {
  buildStandardSituationSchema,
  situationQuestionTitle,
  STANDARD_SITUATION_SCHEMA_ID,
} from "./standardSituationSchema";
export {
  SituationSchemaRegistry,
  defaultSituationSchemaRegistry,
} from "./SituationSchemaRegistry";
export { SituationQuestionResolver } from "./SituationQuestionResolver";
export type { ResolvedSituationQuestion } from "./SituationQuestionResolver";
export { SituationValidator } from "./SituationValidator";
export { SituationCompletenessCalculator } from "./SituationCompletenessCalculator";
export {
  SituationCaseMapper,
  SituationDataError,
  createSituationId,
} from "./SituationCaseMapper";
export { SituationAnalyzerEventBus } from "./SituationAnalyzerEventBus";
export { SituationAnalyzerService } from "./SituationAnalyzerService";
export type {
  SituationAnalyzerServiceOptions,
  NewParticipant,
  NewWitness,
  NewEvidence,
  NewMeasure,
} from "./SituationAnalyzerService";
export {
  buildDemoSituationCase,
  DemoSituationError,
  DEMO_SITUATION_DESCRIPTION,
  DEMO_SITUATION_TITLE,
} from "./demoSituation";
