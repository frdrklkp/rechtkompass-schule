/**
 * Führt Vector- und Keyword-Kandidaten zu einer eindeutigen Menge zusammen.
 * Deterministisch, nach chunkId gruppiert.
 */
import type { PersistedChunk } from "../embeddings/repositories/InMemoryRepositories";
import type { EmbeddingRecord } from "../embeddings/types";
import type {
  CandidateBundle,
  EmbeddingSearchCandidate,
  KeywordSearchCandidate,
} from "./types";

export const ResultMerger = {
  merge(args: {
    chunks: PersistedChunk[];
    embeddings: EmbeddingRecord[];
    vectorHits: EmbeddingSearchCandidate[];
    keywordHits: KeywordSearchCandidate[];
  }): CandidateBundle[] {
    const chunkById = new Map(args.chunks.map((c) => [c.id, c] as const));
    const embByChunk = new Map(args.embeddings.map((e) => [e.chunkId, e] as const));
    const vectorMap = new Map(args.vectorHits.map((v) => [v.chunkId, v] as const));
    const keywordMap = new Map(args.keywordHits.map((k) => [k.chunkId, k] as const));

    const ids = new Set<string>([...vectorMap.keys(), ...keywordMap.keys()]);
    const bundles: CandidateBundle[] = [];
    for (const id of ids) {
      const chunk = chunkById.get(id);
      if (!chunk) continue;
      const v = vectorMap.get(id);
      const k = keywordMap.get(id);
      bundles.push({
        chunk,
        embedding: embByChunk.get(id) ?? null,
        vectorScore: v?.similarity ?? 0,
        keywordScore: k?.score ?? 0,
        matchedFields: k?.matchedFields ?? [],
        matchedTerms: k?.matchedTerms ?? [],
      });
    }
    return bundles;
  },
};
