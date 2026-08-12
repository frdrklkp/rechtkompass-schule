/** Barrel exports for the chunk engine domain (Sprint 4.1C). */
export * from "./types";
export { ChunkEngine } from "./ChunkEngine";
export { decideStrategy, collectText } from "./ChunkStrategy";
export { buildChunksForNode, mergeSmallSiblings } from "./ChunkBuilder";
export { linkChunkHierarchy, indexChunks, siblingsOf, findRoots } from "./ChunkHierarchy";
export { validateChunks } from "./ChunkValidator";
export { computeChunkStatistics } from "./ChunkStatistics";
export { ChunkNavigator } from "./ChunkNavigator";
export { ChunkExporter } from "./ChunkExporter";
export { toRecord, fromRecord, type ChunkRecord } from "./ChunkMapper";
export { buildStableHash, buildChunkId } from "./ChunkHashBuilder";
export { buildChunkMetadata } from "./ChunkMetadataBuilder";
export { buildTokenInfo, estimateTokens, splitSentences, countWords } from "./ChunkTokenizer";
export {
  chunkRepository,
  InMemoryChunkRepository,
  type ChunkRepositoryPort,
} from "./ChunkRepository";
export type {
  EmbeddingBuilder,
  EmbeddingQueue,
  Retriever,
  CitationEngine,
  SimilarityEngine,
  ChunkRanking,
  ChunkScoring,
} from "./extensions";
