/**
 * Kern-Embedding-Service. Kapselt Provider + Dedup + Persistenz + Validierung
 * hinter einem einzigen Aufrufpunkt für einen Chunk oder eine Menge.
 */
import { EmbeddingInputBuilder } from "./EmbeddingInputBuilder";
import { EmbeddingDeduplicator } from "./EmbeddingDeduplicator";
import { EmbeddingCostEstimator } from "./EmbeddingCostEstimator";
import { EmbeddingModelRegistry } from "./registry/EmbeddingModelRegistry";
import { EmbeddingProviderFactory } from "./providers/EmbeddingProviderFactory";
import {
  EmbeddingDimensionMismatchError,
  EmbeddingError,
  EmbeddingInputTooLargeError,
} from "./runtime/errors";
import { embeddingTelemetry } from "./runtime/telemetry";
import { INPUT_FORMAT_VERSION } from "./types";
import type {
  EmbeddingBatchResult,
  EmbeddingModelDefinition,
  EmbeddingRecord,
} from "./types";
import type {
  EmbeddingRepositoryPort,
  PersistedChunk,
} from "./repositories/InMemoryRepositories";
import type { EmbeddingProvider } from "./providers/types";

export interface EmbedContext {
  modelId?: string;
  provider?: EmbeddingProvider;
  forceMock?: boolean;
  apiKey?: string;
}

export interface EmbedResultForChunk {
  chunkId: string;
  action: "embedded" | "skipped" | "failed";
  record?: EmbeddingRecord;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}

function pickProvider(model: EmbeddingModelDefinition, ctx: EmbedContext): EmbeddingProvider {
  return ctx.provider ?? EmbeddingProviderFactory.forModel(model.modelId, { forceMock: ctx.forceMock, apiKey: ctx.apiKey });
}

function guardInput(chunk: PersistedChunk, text: string, model: EmbeddingModelDefinition) {
  if (!text.trim()) throw new EmbeddingError("validation", `Chunk ${chunk.id}: leerer Input`, { retryable: false });
  const approxTokens = Math.ceil(text.length / 4);
  if (approxTokens > model.maxInputTokens) throw new EmbeddingInputTooLargeError(`Chunk ${chunk.id}: ${approxTokens} > ${model.maxInputTokens} Tokens`);
}

export const EmbeddingService = {
  async embedChunk(args: {
    chunk: PersistedChunk;
    repo: EmbeddingRepositoryPort;
    ctx?: EmbedContext;
  }): Promise<EmbedResultForChunk> {
    const ctx = args.ctx ?? {};
    const model = EmbeddingModelRegistry.get(ctx.modelId ?? EmbeddingModelRegistry.getDefault().modelId);
    const input = EmbeddingInputBuilder.build(args.chunk);
    const existing = await args.repo.findActive(args.chunk.id, model.modelId, model.version, INPUT_FORMAT_VERSION);
    const decision = EmbeddingDeduplicator.decide({
      chunkStableHash: args.chunk.stableHash,
      contentHash: input.contentHash,
      existing,
      model,
    });
    if (decision.action === "skip") {
      embeddingTelemetry.emit({ event: "embedding_item_skipped", chunkId: args.chunk.id, modelId: model.modelId });
      return { chunkId: args.chunk.id, action: "skipped" };
    }

    try {
      guardInput(args.chunk, input.text, model);
      const provider = pickProvider(model, ctx);
      const result = await provider.embedOne(input.text, { modelId: model.modelId });
      if (result.dimensions !== model.dimensions || result.vector.length !== model.dimensions) {
        throw new EmbeddingDimensionMismatchError(model.dimensions, result.vector.length);
      }
      const usage = result.usage ?? { promptTokens: input.tokenEstimate, totalTokens: input.tokenEstimate };
      const record = await args.repo.upsert({
        sourceId: args.chunk.sourceId ?? "",
        chunkId: args.chunk.id,
        chunkStableHash: args.chunk.stableHash,
        chunkPath: args.chunk.path,
        providerId: provider.id,
        modelId: model.modelId,
        modelVersion: model.version,
        dimensions: model.dimensions,
        vector: result.vector,
        status: "embedded",
        contentHash: input.contentHash,
        inputFormatVersion: INPUT_FORMAT_VERSION,
        tokenCount: usage.totalTokens,
        inputCharacterCount: input.characterCount,
        usage,
        cost: EmbeddingCostEstimator.fromCalculated(model, usage.totalTokens),
        errorCode: null,
        errorMessage: null,
        attemptCount: 1,
        embeddedAt: new Date().toISOString(),
        invalidatedAt: null,
      });
      return { chunkId: args.chunk.id, action: "embedded", record };
    } catch (err) {
      const e = err as EmbeddingError;
      embeddingTelemetry.emit({
        event: "embedding_item_failed", chunkId: args.chunk.id, modelId: model.modelId, errorCode: e.code ?? "unknown",
      });
      return {
        chunkId: args.chunk.id, action: "failed",
        errorCode: e.code ?? "unknown", errorMessage: e.message, retryable: e.retryable ?? false,
      };
    }
  },

  async embedBatch(args: {
    chunks: PersistedChunk[];
    repo: EmbeddingRepositoryPort;
    ctx?: EmbedContext;
  }): Promise<{ results: EmbedResultForChunk[]; batch?: EmbeddingBatchResult }> {
    const results: EmbedResultForChunk[] = [];
    for (const c of args.chunks) {
      results.push(await EmbeddingService.embedChunk({ chunk: c, repo: args.repo, ctx: args.ctx }));
    }
    return { results };
  },
};
