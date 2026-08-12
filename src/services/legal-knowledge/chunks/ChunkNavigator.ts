/**
 * ChunkNavigator — search and neighbourhood queries over a ChunkCollection.
 * No embeddings, no similarity — plain deterministic string search.
 */
import type { ChunkCollection, ChunkNode } from "./types";

export class ChunkNavigator {
  private readonly byId = new Map<string, ChunkNode>();
  private readonly byPath = new Map<string, ChunkNode>();

  constructor(private readonly collection: ChunkCollection) {
    for (const c of collection.chunks) {
      this.byId.set(c.localId, c);
      this.byPath.set(c.path, c);
    }
  }

  get all(): ChunkNode[] {
    return this.collection.chunks;
  }

  get(localId: string): ChunkNode | null {
    return this.byId.get(localId) ?? null;
  }

  parent(chunk: ChunkNode): ChunkNode | null {
    return chunk.parentChunk ? this.get(chunk.parentChunk) : null;
  }

  children(chunk: ChunkNode): ChunkNode[] {
    return chunk.children.map((id) => this.get(id)).filter((c): c is ChunkNode => c != null);
  }

  siblings(chunk: ChunkNode): ChunkNode[] {
    return this.collection.chunks.filter(
      (c) => c.localId !== chunk.localId && c.parentChunk === chunk.parentChunk,
    );
  }

  next(chunk: ChunkNode): ChunkNode | null {
    const i = this.collection.chunks.findIndex((c) => c.localId === chunk.localId);
    return i >= 0 && i + 1 < this.collection.chunks.length ? this.collection.chunks[i + 1] : null;
  }

  previous(chunk: ChunkNode): ChunkNode | null {
    const i = this.collection.chunks.findIndex((c) => c.localId === chunk.localId);
    return i > 0 ? this.collection.chunks[i - 1] : null;
  }

  search(query: string, limit = 25): ChunkNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.collection.chunks
      .filter((c) =>
        c.normalizedContent.includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.displayPath.toLowerCase().includes(q),
      )
      .slice(0, limit);
  }

  byType(chunkType: ChunkNode["chunkType"]): ChunkNode[] {
    return this.collection.chunks.filter((c) => c.chunkType === chunkType);
  }
}
