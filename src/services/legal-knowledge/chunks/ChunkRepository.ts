/**
 * ChunkRepository — in-memory store for chunk collections keyed by sourceId.
 * Sprint 4.1C does not persist chunks to the database (no embeddings/pgvector
 * yet). This repository is the seam for Sprint 4.1D to swap in a DB-backed
 * implementation without touching call sites.
 */
import type { ChunkCollection } from "./types";

export interface ChunkRepositoryPort {
  save(collection: ChunkCollection): Promise<void>;
  load(sourceId: string): Promise<ChunkCollection | null>;
  clear(sourceId: string): Promise<void>;
  listSources(): Promise<string[]>;
}

export class InMemoryChunkRepository implements ChunkRepositoryPort {
  private readonly store = new Map<string, ChunkCollection>();

  async save(collection: ChunkCollection): Promise<void> {
    if (!collection.sourceId) throw new Error("ChunkRepository: sourceId required for persistence.");
    this.store.set(collection.sourceId, collection);
  }

  async load(sourceId: string): Promise<ChunkCollection | null> {
    return this.store.get(sourceId) ?? null;
  }

  async clear(sourceId: string): Promise<void> {
    this.store.delete(sourceId);
  }

  async listSources(): Promise<string[]> {
    return [...this.store.keys()];
  }
}

export const chunkRepository: ChunkRepositoryPort = new InMemoryChunkRepository();
