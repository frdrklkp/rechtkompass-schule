/**
 * Validator für Embeddings. Prüft strukturelle Integrität, nicht Qualität.
 */
import type { PersistedChunk } from "./repositories/InMemoryRepositories";
import type { EmbeddingModelDefinition, EmbeddingRecord, EmbeddingValidationReport } from "./types";
import { INPUT_FORMAT_VERSION } from "./types";

interface ValidateArgs {
  chunks: PersistedChunk[];
  embeddings: EmbeddingRecord[];
  model: EmbeddingModelDefinition;
}

export const EmbeddingValidator = {
  validate({ chunks, embeddings, model }: ValidateArgs): EmbeddingValidationReport {
    const errors: EmbeddingValidationReport["errors"] = [];
    const warnings: EmbeddingValidationReport["warnings"] = [];
    const info: EmbeddingValidationReport["info"] = [];

    const chunkById = new Map(chunks.map((c) => [c.id, c] as const));
    const activeByChunk = new Map<string, EmbeddingRecord[]>();
    for (const e of embeddings) {
      if (e.invalidatedAt) continue;
      const arr = activeByChunk.get(e.chunkId) ?? [];
      arr.push(e); activeByChunk.set(e.chunkId, arr);
    }

    for (const e of embeddings) {
      if (e.invalidatedAt) continue;
      if (!chunkById.has(e.chunkId)) {
        errors.push({ level: "error", code: "orphan_embedding", message: "Embedding ohne aktiven Chunk", embeddingId: e.id });
        continue;
      }
      const chunk = chunkById.get(e.chunkId)!;
      if (!chunk.active) {
        warnings.push({ level: "warning", code: "chunk_inactive", message: "Chunk ist inaktiv, Embedding sollte invalidiert werden", embeddingId: e.id, chunkId: chunk.id });
      }
      if (e.dimensions !== model.dimensions || e.vector.length !== model.dimensions) {
        errors.push({ level: "error", code: "dimension_mismatch", message: `Dimension abweichend (${e.vector.length} != ${model.dimensions})`, embeddingId: e.id, chunkId: chunk.id });
      }
      if (e.vector.length === 0) {
        errors.push({ level: "error", code: "empty_vector", message: "Leerer Vektor", embeddingId: e.id, chunkId: chunk.id });
      } else if (e.vector.some((v) => !Number.isFinite(v))) {
        errors.push({ level: "error", code: "nan_or_infinity", message: "Vektor enthält NaN/Infinity", embeddingId: e.id, chunkId: chunk.id });
      }
      if (e.inputFormatVersion !== INPUT_FORMAT_VERSION) {
        warnings.push({ level: "warning", code: "input_format_outdated", message: `Input-Format-Version ${e.inputFormatVersion} < ${INPUT_FORMAT_VERSION}`, embeddingId: e.id, chunkId: chunk.id });
      }
      if (e.modelId !== model.modelId || e.modelVersion !== model.version) {
        warnings.push({ level: "warning", code: "model_mismatch", message: "Modell/Version weicht vom aktiven Modell ab", embeddingId: e.id, chunkId: chunk.id });
      }
      if (e.chunkStableHash !== chunk.stableHash) {
        warnings.push({ level: "warning", code: "hash_drift", message: "Chunk-Hash hat sich geändert", embeddingId: e.id, chunkId: chunk.id });
      }
    }

    // Doppelte aktive Embeddings
    for (const [chunkId, arr] of activeByChunk) {
      const seen = new Set<string>();
      for (const e of arr) {
        const key = `${e.modelId}::${e.modelVersion}::${e.inputFormatVersion}`;
        if (seen.has(key)) {
          errors.push({ level: "error", code: "duplicate_active_embedding", message: `Mehrere aktive Embeddings für ${key}`, chunkId, embeddingId: e.id });
        }
        seen.add(key);
      }
    }

    // Fehlende Embeddings
    for (const c of chunks) {
      if (!c.active) continue;
      const has = (activeByChunk.get(c.id) ?? []).length > 0;
      if (!has) info.push({ level: "info", code: "missing_embedding", message: "Chunk ohne aktives Embedding", chunkId: c.id });
    }

    return { errors, warnings, info, ok: errors.length === 0 };
  },
};
