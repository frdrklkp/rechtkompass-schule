/**
 * ChunkExporter — deterministic serialization of a ChunkCollection.
 * Prepares chunks for downstream embedding pipelines (Sprint 4.1D+).
 */
import type { ChunkCollection, ChunkNode } from "./types";
import { toRecord } from "./ChunkMapper";

export const ChunkExporter = {
  json(collection: ChunkCollection): string {
    return JSON.stringify(collection, null, 2);
  },

  records(collection: ChunkCollection): string {
    return JSON.stringify(collection.chunks.map(toRecord), null, 2);
  },

  outline(collection: ChunkCollection): string {
    return collection.chunks
      .map((c) => `${"  ".repeat(c.breadcrumb.length - 1)}${c.displayTitle} · ${c.strategyLabel}`)
      .join("\n");
  },

  list(collection: ChunkCollection): string {
    const lines = collection.chunks.map((c) => [
      c.chunkId,
      c.chunkType,
      `${c.token.tokenEstimate}t`,
      c.displayPath,
    ].join(" | "));
    return lines.join("\n");
  },

  metadata(collection: ChunkCollection): string {
    return JSON.stringify({
      sourceId: collection.sourceId,
      sourceLabel: collection.sourceLabel,
      engineVersion: collection.engineVersion,
      createdAt: collection.createdAt,
      statistics: collection.statistics,
    }, null, 2);
  },

  /** Minimal shape a future embedding builder would consume. */
  embeddingSeed(collection: ChunkCollection): string {
    const rows = collection.chunks.map((c: ChunkNode) => ({
      id: c.localId,
      chunk_id: c.chunkId,
      path: c.path,
      content: c.content,
      metadata: c.metadata,
      stable_hash: c.stableHash,
      token_estimate: c.token.tokenEstimate,
    }));
    return JSON.stringify(rows, null, 2);
  },
};
