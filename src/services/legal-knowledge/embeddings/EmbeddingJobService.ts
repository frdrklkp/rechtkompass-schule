/**
 * EmbeddingJobService — Preview, Anlage, Fortschritt, Abbruch, Retry.
 */
import { EmbeddingCostEstimator } from "./EmbeddingCostEstimator";
import { EmbeddingInputBuilder } from "./EmbeddingInputBuilder";
import { EmbeddingDeduplicator } from "./EmbeddingDeduplicator";
import { EmbeddingModelRegistry } from "./registry/EmbeddingModelRegistry";
import { embeddingTelemetry } from "./runtime/telemetry";
import { INPUT_FORMAT_VERSION } from "./types";
import type {
  EmbeddingJob,
  EmbeddingJobPreview,
  EmbeddingJobTrigger,
} from "./types";
import type {
  ChunkRepositoryPort,
  EmbeddingJobRepositoryPort,
  EmbeddingRepositoryPort,
  PersistedChunk,
} from "./repositories/InMemoryRepositories";

export const EmbeddingJobService = {
  async preview(args: {
    sourceId: string;
    modelId?: string;
    chunkRepo: ChunkRepositoryPort;
    embeddingRepo: EmbeddingRepositoryPort;
  }): Promise<EmbeddingJobPreview> {
    const model = EmbeddingModelRegistry.get(args.modelId ?? EmbeddingModelRegistry.getDefault().modelId);
    const chunks = (await args.chunkRepo.listBySource(args.sourceId, { activeOnly: true }));

    let upToDate = 0, toEmbed = 0, outdated = 0, failed = 0, estimatedTokens = 0;
    for (const c of chunks) {
      const input = EmbeddingInputBuilder.build(c);
      const existing = await args.embeddingRepo.findActive(c.id, model.modelId, model.version, INPUT_FORMAT_VERSION);
      const decision = EmbeddingDeduplicator.decide({
        chunkStableHash: c.stableHash, contentHash: input.contentHash, existing, model,
      });
      if (decision.action === "skip") upToDate++;
      else {
        toEmbed++;
        estimatedTokens += input.tokenEstimate;
        if (decision.reason === "invalidated" || decision.reason === "hash_changed" || decision.reason === "content_changed" || decision.reason === "input_format_changed") outdated++;
        if (decision.reason === "dimension_mismatch") failed++;
      }
    }

    return {
      sourceId: args.sourceId,
      modelId: model.modelId,
      modelVersion: model.version,
      providerId: model.providerId,
      dimensions: model.dimensions,
      inputFormatVersion: INPUT_FORMAT_VERSION,
      totals: { chunks: chunks.length, upToDate, toEmbed, outdated, failed },
      estimatedTokens,
      estimatedCostUsd: EmbeddingCostEstimator.estimate(model, estimatedTokens),
    };
  },

  async createJob(args: {
    sourceId: string;
    modelId?: string;
    trigger?: EmbeddingJobTrigger;
    requestedBy?: string | null;
    chunkRepo: ChunkRepositoryPort;
    embeddingRepo: EmbeddingRepositoryPort;
    jobRepo: EmbeddingJobRepositoryPort;
    metadata?: Record<string, unknown>;
  }): Promise<{ job: EmbeddingJob; preview: EmbeddingJobPreview }> {
    const preview = await EmbeddingJobService.preview({
      sourceId: args.sourceId,
      modelId: args.modelId,
      chunkRepo: args.chunkRepo,
      embeddingRepo: args.embeddingRepo,
    });
    const model = EmbeddingModelRegistry.get(preview.modelId);

    const job = await args.jobRepo.createJob({
      sourceId: args.sourceId,
      providerId: model.providerId,
      modelId: model.modelId,
      modelVersion: model.version,
      inputFormatVersion: INPUT_FORMAT_VERSION,
      status: "preparing",
      requestedBy: args.requestedBy ?? null,
      triggerType: args.trigger ?? "manual",
      totals: {
        total: preview.totals.chunks,
        pending: preview.totals.toEmbed,
        processed: 0, successful: 0, failed: 0, skipped: preview.totals.upToDate,
      },
      tokens: { estimated: preview.estimatedTokens, actual: 0 },
      cost: { estimated: preview.estimatedCostUsd, actual: 0, source: "estimated" },
      startedAt: null, completedAt: null, cancelledAt: null,
      errorSummary: {},
      metadata: args.metadata ?? {},
    });

    // Item-Zeilen anlegen (nur für Chunks, die tatsächlich neu eingebettet werden müssen)
    const chunks = await args.chunkRepo.listBySource(args.sourceId, { activeOnly: true });
    const itemsPayload: Array<Parameters<EmbeddingJobRepositoryPort["createItems"]>[0][number]> = [];
    for (const c of chunks) {
      const input = EmbeddingInputBuilder.build(c);
      const existing = await args.embeddingRepo.findActive(c.id, model.modelId, model.version, INPUT_FORMAT_VERSION);
      const decision = EmbeddingDeduplicator.decide({
        chunkStableHash: c.stableHash, contentHash: input.contentHash, existing, model,
      });
      if (decision.action === "skip") continue;
      itemsPayload.push({
        jobId: job.id,
        chunkId: c.id,
        chunkStableHash: c.stableHash,
        status: "pending",
        attemptCount: 0,
        providerRequestId: null,
        tokenCount: null,
        latencyMs: null,
        workerId: null,
        processingStartedAt: null,
        processingLeaseUntil: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      });
    }
    if (itemsPayload.length) await args.jobRepo.createItems(itemsPayload);
    embeddingTelemetry.emit({ event: "embedding_job_started", jobId: job.id, sourceId: args.sourceId, modelId: model.modelId });
    return { job, preview };
  },

  async cancelJob(args: { jobId: string; jobRepo: EmbeddingJobRepositoryPort }): Promise<EmbeddingJob> {
    const job = await args.jobRepo.updateJob(args.jobId, {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
    });
    embeddingTelemetry.emit({ event: "embedding_job_cancelled", jobId: job.id, sourceId: job.sourceId });
    return job;
  },

  async retryFailedItems(args: { jobId: string; jobRepo: EmbeddingJobRepositoryPort }): Promise<number> {
    const items = await args.jobRepo.listItems(args.jobId, { status: ["failed"] });
    for (const it of items) {
      await args.jobRepo.updateItem(it.id, {
        status: "retryable",
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        processingLeaseUntil: null,
      });
    }
    // Job wieder aktivieren
    if (items.length > 0) {
      await args.jobRepo.updateJob(args.jobId, { status: "running", completedAt: null });
    }
    return items.length;
  },

  async _persistedChunkToChunk(c: PersistedChunk): Promise<PersistedChunk> { return c; },
};
