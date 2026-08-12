/**
 * Barrel für die Embedding-Domäne.
 */
export * from "./types";
export * from "./runtime/errors";
export { legalEmbeddingFlags } from "./runtime/featureFlags";
export { embeddingTelemetry } from "./runtime/telemetry";
export { EmbeddingModelRegistry } from "./registry/EmbeddingModelRegistry";
export { EmbeddingProviderFactory } from "./providers/EmbeddingProviderFactory";
export { MockEmbeddingProvider } from "./providers/MockEmbeddingProvider";
export { GatewayEmbeddingProvider } from "./providers/GatewayEmbeddingProvider";
export { EmbeddingInputBuilder } from "./EmbeddingInputBuilder";
export { EmbeddingDeduplicator } from "./EmbeddingDeduplicator";
export { EmbeddingCostEstimator } from "./EmbeddingCostEstimator";
export { EmbeddingStatusResolver } from "./EmbeddingStatusResolver";
export { EmbeddingValidator } from "./EmbeddingValidator";
export { EmbeddingStatistics } from "./EmbeddingStatistics";
export { EmbeddingService } from "./EmbeddingService";
export { EmbeddingBatchProcessor } from "./EmbeddingBatchProcessor";
export { EmbeddingJobService } from "./EmbeddingJobService";
export {
  InMemoryChunkRepository,
  InMemoryEmbeddingRepository,
  InMemoryEmbeddingJobRepository,
} from "./repositories/InMemoryRepositories";
export type {
  ChunkRepositoryPort,
  EmbeddingRepositoryPort,
  EmbeddingJobRepositoryPort,
  PersistedChunk,
} from "./repositories/InMemoryRepositories";
