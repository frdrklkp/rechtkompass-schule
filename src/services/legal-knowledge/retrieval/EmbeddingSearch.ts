/**
 * Vector Search auf Basis persistierter Embeddings.
 * Nutzt EmbeddingService (Provider-Registry, Mock-Provider, Model-Registry)
 * für das Query-Embedding und berechnet Cosine-Similarity gegen bekannte
 * Embedding-Records (in-JS, geeignet für Pilotgrößen).
 */
import { EmbeddingModelRegistry } from "../embeddings/registry/EmbeddingModelRegistry";
import { EmbeddingProviderFactory } from "../embeddings/providers/EmbeddingProviderFactory";
import { EmbeddingInputBuilder } from "../embeddings/EmbeddingInputBuilder";
import type { EmbeddingRecord, EmbeddingModelDefinition } from "../embeddings/types";
import type { EmbeddingProvider } from "../embeddings/providers/types";
import type { EmbeddingSearchCandidate } from "./types";

export interface EmbeddingSearchOptions {
  modelId?: string;
  provider?: EmbeddingProvider;
  forceMock?: boolean;
  topK: number;
  minSimilarity: number;
  precomputedQueryVector?: number[];
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export interface QueryEmbedding {
  vector: number[];
  model: EmbeddingModelDefinition;
}

export const EmbeddingSearch = {
  /** Erzeugt (oder wiederverwendet) das Query-Embedding. */
  async embedQuery(
    normalizedQuery: string,
    opts: Pick<EmbeddingSearchOptions, "modelId" | "provider" | "forceMock" | "precomputedQueryVector">,
  ): Promise<QueryEmbedding> {
    const model = EmbeddingModelRegistry.get(opts.modelId ?? EmbeddingModelRegistry.getDefault().modelId);
    if (opts.precomputedQueryVector) {
      if (opts.precomputedQueryVector.length !== model.dimensions) {
        throw new Error(`Precomputed vector dim ${opts.precomputedQueryVector.length} != model ${model.dimensions}`);
      }
      return { vector: opts.precomputedQueryVector, model };
    }
    // Wir bauen ein sehr schlankes Input (nur normalizedQuery) – bewusst
    // unabhängig vom Chunk-Input-Format-Builder.
    const provider = opts.provider ?? EmbeddingProviderFactory.forModel(model.modelId, { forceMock: opts.forceMock });
    const text = normalizedQuery.trim() || " ";
    const res = await provider.embedOne(text, { modelId: model.modelId });
    if (res.dimensions !== model.dimensions) {
      throw new Error(`Query embedding dim mismatch: ${res.dimensions} != ${model.dimensions}`);
    }
    return { vector: res.vector, model };
  },

  /** Sucht die Top-K ähnlichsten Embeddings. */
  rank(
    queryVector: number[],
    embeddings: EmbeddingRecord[],
    opts: Pick<EmbeddingSearchOptions, "topK" | "minSimilarity">,
  ): EmbeddingSearchCandidate[] {
    const hits: EmbeddingSearchCandidate[] = [];
    for (const rec of embeddings) {
      if (rec.status !== "embedded") continue;
      if (!Array.isArray(rec.vector) || rec.vector.length === 0) continue;
      if (rec.vector.length !== queryVector.length) continue;
      const sim = cosine(queryVector, rec.vector);
      if (sim < opts.minSimilarity) continue;
      hits.push({ chunkId: rec.chunkId, stableHash: rec.chunkStableHash, similarity: sim });
    }
    hits.sort((a, b) => b.similarity - a.similarity);
    return hits.slice(0, opts.topK);
  },

  /** Bequemer Debug-Aufruf: baut Input aus normalisierter Query. */
  buildDebugInput(normalizedQuery: string): { characterCount: number; tokenEstimate: number } {
    const payload = EmbeddingInputBuilder.build({
      chunkId: "query", stableHash: "query", sourceId: null, path: "", displayPath: "",
      title: "", displayTitle: "", content: normalizedQuery, normalizedContent: normalizedQuery,
      metadata: {}, token: { characterCount: normalizedQuery.length, wordCount: 0, tokenEstimate: 0, sentenceCount: 0, averageSentenceLength: 0, referenceCount: 0 },
    });
    return { characterCount: payload.characterCount, tokenEstimate: payload.tokenEstimate };
  },
};
