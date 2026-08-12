/**
 * Deduplication-Logik. Entscheidet, ob ein Chunk neu eingebettet werden muss.
 */
import type { EmbeddingModelDefinition, EmbeddingRecord } from "./types";
import { INPUT_FORMAT_VERSION } from "./types";

export interface DedupInput {
  chunkStableHash: string;
  contentHash: string;
  existing: EmbeddingRecord | null;
  model: EmbeddingModelDefinition;
}

export type DedupDecision =
  | { action: "skip"; reason: "already_embedded" }
  | { action: "embed"; reason: "no_existing" | "hash_changed" | "content_changed" | "model_changed" | "version_changed" | "input_format_changed" | "invalidated" | "dimension_mismatch" };

export const EmbeddingDeduplicator = {
  decide(input: DedupInput): DedupDecision {
    const { existing, model, chunkStableHash, contentHash } = input;
    if (!existing) return { action: "embed", reason: "no_existing" };
    if (existing.invalidatedAt) return { action: "embed", reason: "invalidated" };
    if (existing.inputFormatVersion !== INPUT_FORMAT_VERSION) return { action: "embed", reason: "input_format_changed" };
    if (existing.modelId !== model.modelId) return { action: "embed", reason: "model_changed" };
    if (existing.modelVersion !== model.version) return { action: "embed", reason: "version_changed" };
    if (existing.dimensions !== model.dimensions) return { action: "embed", reason: "dimension_mismatch" };
    if (existing.chunkStableHash !== chunkStableHash) return { action: "embed", reason: "hash_changed" };
    if (existing.contentHash !== contentHash) return { action: "embed", reason: "content_changed" };
    return { action: "skip", reason: "already_embedded" };
  },
};
