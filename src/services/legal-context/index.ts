/** Sprint 4.6G – Barrel-Export des Legal Context. */
export * from "./types";
export { LegalContextEventBus } from "./LegalContextEventBus";
export {
  resolveLegalContext,
  sectionIdOfLink,
  type ResolvedLegalContext,
} from "./LegalContextResolver";
export {
  LegalContextFreshnessChecker,
  type FreshnessAssessment,
  type LegalContextFreshnessOptions,
} from "./LegalContextFreshnessChecker";
export { rankLegalReferences } from "./LegalContextRanker";
export { LegalContextExplainer } from "./LegalContextExplainer";
export {
  LegalContextService,
  LegalContextError,
  defaultLegalContextService,
  type LegalContextFetcher,
  type LegalContextServiceOptions,
  type LegalContextRestore,
} from "./LegalContextService";
