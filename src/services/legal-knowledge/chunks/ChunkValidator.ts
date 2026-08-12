/**
 * ChunkValidator — deterministic validation over a chunk collection.
 * Reports empty/oversized/undersized chunks, missing metadata/parents, hash
 * consistency issues. Never mutates chunks.
 */
import type {
  ChunkEngineOptions,
  ChunkNode,
  ChunkValidationIssue,
  ChunkValidationReport,
} from "./types";
import { buildStableHash } from "./ChunkHashBuilder";

export interface ValidateInput {
  sourceId: string | null;
  chunks: ChunkNode[];
  opts: Required<Omit<ChunkEngineOptions, "baseMetadata">>;
}

export function validateChunks(input: ValidateInput): ChunkValidationReport {
  const errors: ChunkValidationIssue[] = [];
  const warnings: ChunkValidationIssue[] = [];
  const info: ChunkValidationIssue[] = [];
  const ids = new Set(input.chunks.map((c) => c.localId));

  for (const chunk of input.chunks) {
    if (!chunk.content.trim()) {
      errors.push({
        level: "error",
        code: "empty_chunk",
        message: "Chunk enthält keinen Inhalt.",
        chunkId: chunk.localId,
        path: chunk.path,
      });
    }
    if (chunk.token.tokenEstimate < input.opts.mergeThresholdTokens && chunk.chunkType !== "meta") {
      warnings.push({
        level: "warning",
        code: "chunk_too_small",
        message: `Chunk sehr klein (~${chunk.token.tokenEstimate} Tokens). Zusammenführung prüfen.`,
        chunkId: chunk.localId,
        path: chunk.path,
      });
    }
    if (chunk.token.tokenEstimate > input.opts.splitThresholdTokens * 2) {
      warnings.push({
        level: "warning",
        code: "chunk_oversized",
        message: `Chunk deutlich über Schwelle (~${chunk.token.tokenEstimate} Tokens). Aufteilung prüfen.`,
        chunkId: chunk.localId,
        path: chunk.path,
      });
    }
    if (!chunk.metadata.law && !chunk.metadata.sourceLabel) {
      warnings.push({
        level: "warning",
        code: "missing_law_metadata",
        message: "Chunk ohne Gesetzeszuordnung.",
        chunkId: chunk.localId,
        path: chunk.path,
      });
    }
    if (chunk.parentChunk && !ids.has(chunk.parentChunk)) {
      errors.push({
        level: "error",
        code: "orphan_parent",
        message: "Parent-Chunk existiert nicht.",
        chunkId: chunk.localId,
        path: chunk.path,
      });
    }
    // Hash consistency check.
    const recomputed = buildStableHash({
      sourceId: input.sourceId,
      path: chunk.path,
      normalizedContent: chunk.normalizedContent,
      version: chunk.metadata.version,
    });
    if (recomputed !== chunk.stableHash) {
      errors.push({
        level: "error",
        code: "hash_mismatch",
        message: "Stable-Hash weicht vom Inhalt ab.",
        chunkId: chunk.localId,
        path: chunk.path,
      });
    }
    if (chunk.references.length === 0 && chunk.chunkType === "paragraph_with_absaetze") {
      info.push({
        level: "info",
        code: "no_references",
        message: "Paragraph enthält keine erkennbaren Verweise.",
        chunkId: chunk.localId,
        path: chunk.path,
      });
    }
  }

  return { errors, warnings, info, ok: errors.length === 0 };
}
