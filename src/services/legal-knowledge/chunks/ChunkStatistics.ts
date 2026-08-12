/**
 * ChunkStatistics — deterministic aggregate metrics over a chunk collection.
 */
import type { ChunkNode, ChunkStatisticsReport, ChunkType } from "./types";
import { CHUNK_TYPES } from "./types";

export function computeChunkStatistics(
  chunks: ChunkNode[],
  sectionsTotal: number,
): ChunkStatisticsReport {
  const chunkTypes = Object.fromEntries(CHUNK_TYPES.map((t) => [t, 0])) as Record<ChunkType, number>;
  let totalTokens = 0;
  let totalCharacters = 0;
  let totalReferences = 0;
  let maxTokens = 0;
  let minTokens = Number.POSITIVE_INFINITY;
  let largestChunkId: string | null = null;
  let smallestChunkId: string | null = null;
  const sectionsCovered = new Set<string>();

  for (const c of chunks) {
    chunkTypes[c.chunkType] += 1;
    totalTokens += c.token.tokenEstimate;
    totalCharacters += c.token.characterCount;
    totalReferences += c.token.referenceCount;
    if (c.token.tokenEstimate > maxTokens) {
      maxTokens = c.token.tokenEstimate;
      largestChunkId = c.localId;
    }
    if (c.token.tokenEstimate < minTokens) {
      minTokens = c.token.tokenEstimate;
      smallestChunkId = c.localId;
    }
    for (const s of c.sectionIds) sectionsCovered.add(s);
  }
  if (chunks.length === 0) minTokens = 0;

  const avgTokens = chunks.length
    ? Math.round((totalTokens / chunks.length) * 100) / 100
    : 0;
  const referenceDensity = chunks.length
    ? Math.round((totalReferences / chunks.length) * 100) / 100
    : 0;
  const coverageRatio = sectionsTotal
    ? Math.round((sectionsCovered.size / sectionsTotal) * 1000) / 1000
    : 0;

  return {
    chunkCount: chunks.length,
    avgTokens,
    maxTokens,
    minTokens,
    totalTokens,
    totalCharacters,
    largestChunkId,
    smallestChunkId,
    chunkTypes,
    coverageRatio,
    referenceDensity,
    sectionsCovered: sectionsCovered.size,
    sectionsTotal,
  };
}
