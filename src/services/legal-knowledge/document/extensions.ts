/**
 * Extension point interfaces. These are placeholders reserved for
 * Sprint 4.1C+ (embeddings, RAG, citations, similarity, knowledge graph).
 * No runtime code lives here.
 */
import type { DocumentTree, SectionNode } from "./types";

/** Splits a SectionNode subtree into retrieval-friendly chunks. */
export interface ChunkBuilder {
  buildChunks(tree: DocumentTree): Array<{ localId: string; text: string; metadata: Record<string, unknown> }>;
}

/** Generates embeddings for chunks. */
export interface EmbeddingBuilder {
  embed(chunks: string[]): Promise<number[][]>;
}

/** Produces canonical legal citation strings for a node. */
export interface CitationEngine {
  cite(node: SectionNode): string;
}

/** Similarity/nearest-neighbour lookup interface. */
export interface Retriever {
  search(query: string, opts?: { limit?: number }): Promise<Array<{ localId: string; score: number }>>;
}

/** Cross-document graph builder. */
export interface KnowledgeGraph {
  addTree(tree: DocumentTree): void;
  neighbours(localId: string): string[];
}

/** Resolves cross-document references (e.g. § 42 SchulG NRW → target). */
export interface CrossReferenceResolver {
  resolve(fromLocalId: string, raw: string): Promise<string | null>;
}

/** Section-to-section similarity engine. */
export interface SimilarityEngine {
  similar(localId: string, opts?: { limit?: number }): Promise<Array<{ localId: string; score: number }>>;
}
