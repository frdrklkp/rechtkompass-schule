/**
 * Chunk metadata construction from SectionNodes + base metadata.
 * Deterministic, no side effects.
 */
import type { SectionNode } from "../document/types";
import type { ChunkMetadata, ChunkType } from "./types";

export interface MetadataInput {
  sections: SectionNode[];
  chunkType: ChunkType;
  baseMetadata?: Partial<ChunkMetadata>;
}

export function buildChunkMetadata(input: MetadataInput): ChunkMetadata {
  const primary = input.sections[0];
  const meta: ChunkMetadata = { ...input.baseMetadata };

  // Inherit structural coordinates from the primary section.
  const src = primary.metadata;
  if (src.sourceLabel && !meta.sourceLabel) meta.sourceLabel = src.sourceLabel;
  if (src.authority && !meta.authority) meta.authority = src.authority as string;
  if (src.jurisdiction && !meta.jurisdiction) meta.jurisdiction = src.jurisdiction as string;
  if (src.version && !meta.version) meta.version = src.version as string;
  if (src.language && !meta.language) meta.language = src.language as string;

  meta.law = meta.law ?? (src.sourceLabel as string | undefined);
  meta.chapter ??= src.chapter as string | undefined;
  meta.section ??= src.section as string | undefined;
  meta.paragraph ??= src.paragraph as string | undefined;
  meta.article ??= src.article as string | undefined;
  meta.absatz ??= src.absatz as string | undefined;
  meta.sentence ??= src.sentence as string | undefined;
  meta.number ??= src.number as string | undefined;
  meta.letter ??= src.letter as string | undefined;
  meta.annex ??= src.annex as string | undefined;

  const confidences = input.sections.map((s) => s.confidence).filter((v) => Number.isFinite(v));
  meta.parserConfidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 1000) / 1000
    : undefined;
  meta.chunkStrategy = input.chunkType;

  return meta;
}
