/**
 * Aggregierte Statistiken und Statusampel je Quelle.
 */
import type { PersistedChunk } from "./repositories/InMemoryRepositories";
import { EmbeddingStatusResolver } from "./EmbeddingStatusResolver";
import type {
  EmbeddingChunkStatus,
  EmbeddingModelDefinition,
  EmbeddingRecord,
  EmbeddingSourceOverview,
} from "./types";

function selectActive(embeddings: EmbeddingRecord[], chunkId: string, model: EmbeddingModelDefinition): EmbeddingRecord | null {
  return embeddings.find((e) =>
    e.chunkId === chunkId &&
    e.invalidatedAt === null &&
    e.modelId === model.modelId &&
    e.modelVersion === model.version
  ) ?? null;
}

export const EmbeddingStatistics = {
  buildOverview(args: {
    sourceId: string;
    sourceLabel: string;
    chunks: PersistedChunk[];
    embeddings: EmbeddingRecord[];
    model: EmbeddingModelDefinition;
  }): EmbeddingSourceOverview {
    const active = args.chunks.filter((c) => c.active);
    const statuses: EmbeddingChunkStatus[] = active.map((c) =>
      EmbeddingStatusResolver.resolve(c, selectActive(args.embeddings, c.id, args.model), args.model),
    );

    const embedded = statuses.filter((s) => s === "embedded").length;
    const outdated = statuses.filter((s) => s === "outdated" || s === "model_mismatch").length;
    const failed = statuses.filter((s) => s === "failed" || s === "dimension_mismatch").length;
    const missing = statuses.filter((s) => s === "not_embedded").length;

    const total = active.length;
    const coverage = total === 0 ? 0 : embedded / total;

    const succeeded = args.embeddings
      .filter((e) => e.status === "embedded" && !e.invalidatedAt)
      .map((e) => e.embeddedAt)
      .sort();
    const errored = args.embeddings.filter((e) => e.errorMessage);

    let ampel: EmbeddingSourceOverview["ampel"] = "grey";
    if (total === 0) ampel = "grey";
    else if (failed > 0) ampel = "red";
    else if (outdated > 0 || missing > 0) ampel = "yellow";
    else if (embedded === total) ampel = "green";

    return {
      sourceId: args.sourceId,
      sourceLabel: args.sourceLabel,
      totals: { chunks: total, embedded, outdated, failed, missing },
      coverageRatio: coverage,
      activeModel: { modelId: args.model.modelId, modelVersion: args.model.version, providerId: args.model.providerId },
      lastSuccessfulRunAt: succeeded.length ? succeeded[succeeded.length - 1] : null,
      lastErrorAt: errored.length ? errored[errored.length - 1].updatedAt : null,
      lastErrorMessage: errored.length ? errored[errored.length - 1].errorMessage : null,
      ampel,
    };
  },
};
