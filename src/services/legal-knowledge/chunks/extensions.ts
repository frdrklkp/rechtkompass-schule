/**
 * Extension-point interfaces for Sprint 4.1D+ (embeddings, RAG, citations).
 * NO runtime code. NO imports of embedding libraries. Sprint 4.1C is
 * deterministic-only.
 */
import type { ChunkNode } from "./types";

/** Produces vector embeddings for chunks. Implemented in Sprint 4.1D. */
export interface EmbeddingBuilder {
  embed(chunks: ChunkNode[]): Promise<Array<{ localId: string; vector: number[] }>>;
}

/** Persistent queue for embedding work. Implemented in Sprint 4.1D. */
export interface EmbeddingQueue {
  enqueue(chunkIds: string[]): Promise<void>;
  pending(): Promise<string[]>;
}

/** Retrieval interface — hybrid keyword + vector search in later sprints. */
export interface Retriever {
  search(query: string, opts?: { limit?: number }): Promise<Array<{ localId: string; score: number }>>;
}

/** Produces canonical legal citation strings for a chunk. */
export interface CitationEngine {
  cite(chunk: ChunkNode): string;
}

/** Chunk-to-chunk similarity engine. */
export interface SimilarityEngine {
  similar(localId: string, opts?: { limit?: number }): Promise<Array<{ localId: string; score: number }>>;
}

/** Deterministic ranking (BM25, structural priors). No AI required. */
export interface ChunkRanking {
  rank(candidates: ChunkNode[], query: string): ChunkNode[];
}

/** Combines multiple signals into a final chunk score. */
export interface ChunkScoring {
  score(chunk: ChunkNode, context: Record<string, unknown>): number;
}
