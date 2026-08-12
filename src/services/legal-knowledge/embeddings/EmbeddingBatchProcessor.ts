/**
 * EmbeddingBatchProcessor — verarbeitet einen Job schrittweise. Nutzt
 * Item-Claiming über die JobRepository, damit parallele Worker sich nicht
 * gegenseitig blockieren.
 */
import { EmbeddingModelRegistry } from "./registry/EmbeddingModelRegistry";
import { EmbeddingService } from "./EmbeddingService";
import { embeddingTelemetry } from "./runtime/telemetry";
import type {
  EmbeddingJob,
  EmbeddingJobItem,
} from "./types";
import type {
  EmbeddingJobRepositoryPort,
  EmbeddingRepositoryPort,
  ChunkRepositoryPort,
} from "./repositories/InMemoryRepositories";
import type { EmbedContext } from "./EmbeddingService";

export interface BatchOptions {
  batchSize?: number;
  maxAttempts?: number;
  workerId?: string;
  leaseMs?: number;
}

export interface BatchProcessResult {
  job: EmbeddingJob;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  done: boolean;
}

const DEFAULTS: Required<BatchOptions> = {
  batchSize: 16,
  maxAttempts: 3,
  workerId: "primary",
  leaseMs: 5 * 60 * 1000,
};

export const EmbeddingBatchProcessor = {
  async processBatch(args: {
    jobId: string;
    jobRepo: EmbeddingJobRepositoryPort;
    chunkRepo: ChunkRepositoryPort;
    embeddingRepo: EmbeddingRepositoryPort;
    ctx?: EmbedContext;
    options?: BatchOptions;
  }): Promise<BatchProcessResult> {
    const opts = { ...DEFAULTS, ...args.options };
    let job = await args.jobRepo.getJob(args.jobId);
    if (!job) throw new Error(`job ${args.jobId} not found`);
    if (job.status === "cancelled") throw new Error("Job cancelled");

    if (job.status === "queued" || job.status === "preparing") {
      job = await args.jobRepo.updateJob(job.id, { status: "running", startedAt: job.startedAt ?? new Date().toISOString() });
    }

    const claimed = await args.jobRepo.claimPendingItems(job.id, opts.batchSize, opts.workerId, opts.leaseMs);
    if (claimed.length === 0) {
      // Prüfe Abschluss
      const remaining = await args.jobRepo.listItems(job.id, { status: ["pending", "processing", "retryable"] });
      if (remaining.length === 0) {
        const failedItems = await args.jobRepo.listItems(job.id, { status: ["failed"] });
        const finalStatus = failedItems.length === 0 ? "completed" : "partially_completed";
        job = await args.jobRepo.updateJob(job.id, {
          status: finalStatus,
          completedAt: new Date().toISOString(),
        });
        embeddingTelemetry.emit({ event: finalStatus === "completed" ? "embedding_job_completed" : "embedding_batch_completed", jobId: job.id, sourceId: job.sourceId });
      }
      return { job, processed: 0, successful: 0, failed: 0, skipped: 0, done: true };
    }

    const model = EmbeddingModelRegistry.get(job.modelId);
    const ctx: EmbedContext = { modelId: model.modelId, ...(args.ctx ?? {}) };

    let successful = 0, failed = 0, skipped = 0;
    let actualTokens = 0;
    const errorTally: Record<string, number> = { ...job.errorSummary };

    for (const item of claimed) {
      const chunk = await args.chunkRepo.getById(item.chunkId);
      if (!chunk) {
        await failItem(args.jobRepo, item, "chunk_missing", "Chunk nicht gefunden", false);
        failed++; errorTally.chunk_missing = (errorTally.chunk_missing ?? 0) + 1;
        continue;
      }
      const r = await EmbeddingService.embedChunk({ chunk, repo: args.embeddingRepo, ctx });
      if (r.action === "embedded") {
        actualTokens += r.record?.tokenCount ?? 0;
        await args.jobRepo.updateItem(item.id, {
          status: "completed",
          attemptCount: item.attemptCount + 1,
          tokenCount: r.record?.tokenCount ?? null,
          completedAt: new Date().toISOString(),
          errorCode: null, errorMessage: null,
        });
        successful++;
      } else if (r.action === "skipped") {
        await args.jobRepo.updateItem(item.id, {
          status: "skipped",
          attemptCount: item.attemptCount + 1,
          completedAt: new Date().toISOString(),
        });
        skipped++;
      } else {
        const nextAttempts = item.attemptCount + 1;
        const shouldRetry = r.retryable && nextAttempts < opts.maxAttempts;
        await args.jobRepo.updateItem(item.id, {
          status: shouldRetry ? "retryable" : "failed",
          attemptCount: nextAttempts,
          errorCode: r.errorCode ?? "unknown",
          errorMessage: r.errorMessage ?? null,
          completedAt: shouldRetry ? null : new Date().toISOString(),
        });
        if (shouldRetry) embeddingTelemetry.emit({ event: "embedding_item_retried", jobId: job.id, chunkId: chunk.id, errorCode: r.errorCode });
        else failed++;
        const code = r.errorCode ?? "unknown";
        errorTally[code] = (errorTally[code] ?? 0) + 1;
      }
    }

    const processed = successful + failed + skipped;
    job = await args.jobRepo.updateJob(job.id, {
      totals: {
        ...job.totals,
        processed: job.totals.processed + processed,
        successful: job.totals.successful + successful,
        failed: job.totals.failed + failed,
        skipped: job.totals.skipped + skipped,
        pending: Math.max(0, job.totals.pending - processed),
      },
      tokens: { estimated: job.tokens.estimated, actual: job.tokens.actual + actualTokens },
      errorSummary: errorTally,
    });

    // Prüfe Abschluss nach diesem Batch.
    const remaining = await args.jobRepo.listItems(job.id, { status: ["pending", "processing", "retryable"] });
    let done = false;
    if (remaining.length === 0) {
      const failedItems = await args.jobRepo.listItems(job.id, { status: ["failed"] });
      const finalStatus = failedItems.length === 0 ? "completed" : "partially_completed";
      job = await args.jobRepo.updateJob(job.id, {
        status: finalStatus,
        completedAt: new Date().toISOString(),
      });
      done = true;
      embeddingTelemetry.emit({ event: finalStatus === "completed" ? "embedding_job_completed" : "embedding_batch_completed", jobId: job.id });
    }

    return { job, processed, successful, failed, skipped, done };
  },
};

async function failItem(
  repo: EmbeddingJobRepositoryPort,
  item: EmbeddingJobItem,
  code: string,
  message: string,
  retryable: boolean,
): Promise<void> {
  await repo.updateItem(item.id, {
    status: retryable ? "retryable" : "failed",
    attemptCount: item.attemptCount + 1,
    errorCode: code,
    errorMessage: message,
    completedAt: retryable ? null : new Date().toISOString(),
  });
}
