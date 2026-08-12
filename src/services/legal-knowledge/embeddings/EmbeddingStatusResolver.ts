/**
 * Löst den redaktionellen Status je Chunk auf, indem Chunk × Embedding × Modell
 * miteinander verglichen werden.
 */
import { INPUT_FORMAT_VERSION } from "./types";
import type {
  EmbeddingChunkStatus,
  EmbeddingModelDefinition,
  EmbeddingRecord,
} from "./types";
import type { PersistedChunk } from "./repositories/InMemoryRepositories";
import { legalEmbeddingFlags } from "./runtime/featureFlags";

export const EmbeddingStatusResolver = {
  resolve(chunk: PersistedChunk, embedding: EmbeddingRecord | null, model: EmbeddingModelDefinition): EmbeddingChunkStatus {
    if (!legalEmbeddingFlags.enabled) return "disabled";
    if (!chunk.active) return "disabled";
    if (!embedding) return "not_embedded";
    if (embedding.invalidatedAt) return "outdated";
    if (embedding.status === "failed") return "failed";
    if (embedding.modelId !== model.modelId || embedding.modelVersion !== model.version) return "model_mismatch";
    if (embedding.dimensions !== model.dimensions) return "dimension_mismatch";
    if (embedding.inputFormatVersion !== INPUT_FORMAT_VERSION) return "outdated";
    if (embedding.chunkStableHash !== chunk.stableHash) return "outdated";
    return "embedded";
  },
};
