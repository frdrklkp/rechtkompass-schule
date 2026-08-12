/**
 * Barrel für die Retrieval-Domäne.
 */
export * from "./types";
export * from "./errors";
export { legalRetrievalFlags } from "./featureFlags";
export { retrievalTelemetry } from "./telemetry";
export { DEFAULT_RETRIEVAL_CONFIG } from "./config";
export type { RetrievalConfig } from "./config";
export { QueryNormalizer } from "./QueryNormalizer";
export type { NormalizedQuery } from "./QueryNormalizer";
export { SearchQueryBuilder } from "./SearchQueryBuilder";
export { EmbeddingSearch } from "./EmbeddingSearch";
export { KeywordSearch } from "./KeywordSearch";
export { MetadataFilter } from "./MetadataFilter";
export { ResultMerger } from "./ResultMerger";
export { ChunkRanker } from "./ChunkRanker";
export { CitationBuilder } from "./CitationBuilder";
export { RetrievalValidator } from "./RetrievalValidator";
export { RetrievalStatistics } from "./RetrievalStatistics";
export { Highlighter } from "./Highlighter";
export { ResultExplainer } from "./ResultExplainer";
export { HybridRetrievalService } from "./HybridRetrievalService";
export type { HybridRetrievalInput } from "./HybridRetrievalService";
export {
  InMemoryRetrievalRepository,
  SupabaseRetrievalRepository,
} from "./repositories/RetrievalRepository";
export type {
  RetrievalRepositoryPort,
  RetrievalCorpus,
} from "./repositories/RetrievalRepository";
