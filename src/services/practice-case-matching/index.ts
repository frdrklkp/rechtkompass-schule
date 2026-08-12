/** Sprint 4.6E – Barrel-Export der Practice Case Matching Foundation. */
export * from "./types";
export * from "./normalize";
export * from "./weights";
export {
  PracticeCaseMatchProfileMapper,
  defaultProfileMapper,
  emptyProfile,
} from "./PracticeCaseMatchProfileMapper";
export { MatchReadinessCalculator, defaultReadinessCalculator } from "./MatchReadinessCalculator";
export { MatchProfileValidator, defaultProfileValidator } from "./MatchProfileValidator";
export { SituationFeatureExtractor, defaultFeatureExtractor } from "./SituationFeatureExtractor";
export { PracticeCaseMatchScorer, defaultMatchScorer } from "./PracticeCaseMatchScorer";
export { PracticeCaseIndexBuilder, defaultIndexBuilder, indexHashOf } from "./PracticeCaseIndexBuilder";
export type { PracticeCaseIndexBuilderOptions } from "./PracticeCaseIndexBuilder";
export {
  PracticeCaseAuditor,
  defaultPracticeCaseAuditor,
  filterAuditRows,
  EMPTY_AUDIT_FILTER,
} from "./PracticeCaseAudit";
export type {
  CaseIndexState,
  PracticeCaseAuditFilter,
  PracticeCaseAuditRow,
  PracticeCaseInventoryAudit,
} from "./PracticeCaseAudit";
export {
  previewIndex,
  applyStaleOnly,
  reindexCase,
  verifyIndex,
  buildAuditReport,
} from "./PracticeCaseIndexOperations";
export type { IndexVerification, PracticeCaseIndexPreview } from "./PracticeCaseIndexOperations";
export {
  buildProfilePanelModel,
  MATCH_PROFILE_FIELD_LABELS,
  MATCH_PROFILE_STATUS_LABELS,
} from "./matchingViewModel";
export type {
  MatchIndexStatusView,
  MatchProfileFieldKey,
  MatchProfileFieldView,
  MatchProfilePanelModel,
} from "./matchingViewModel";

export {
  InMemoryPracticeCaseIndexStore,
  LocalStoragePracticeCaseIndexStore,
  PRACTICE_CASE_INDEX_STORAGE_KEY,
  isCompatibleIndex,
} from "./PracticeCaseIndexStore";
export type { PracticeCaseIndexStorePort } from "./PracticeCaseIndexStore";
export { PracticeCaseMatchEventBus } from "./PracticeCaseMatchEventBus";
export {
  PracticeCaseMatchingEngine,
  PracticeCaseMatchingError,
} from "./PracticeCaseMatchingEngine";
export type { PracticeCaseMatchingEngineOptions } from "./PracticeCaseMatchingEngine";
