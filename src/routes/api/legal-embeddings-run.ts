/**
 * Server-Route: POST /api/legal-embeddings-run
 * Body: { sourceId, modelId?, jobId?, batchSize? }
 * Legt einen Job an (falls jobId fehlt) und verarbeitet einen Batch.
 * Client ruft die Route wiederholt auf, bis `done` = true.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  EmbeddingBatchProcessor,
  EmbeddingJobService,
  EmbeddingModelRegistry,
  legalEmbeddingFlags,
} from "@/services/legal-knowledge/embeddings";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

export const Route = createFileRoute("/api/legal-embeddings-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        if (!legalEmbeddingFlags.jobsEnabled) {
          return Response.json({ error: "jobs disabled" }, { status: 403 });
        }
        const body = (await request.json().catch(() => ({}))) as {
          sourceId?: string; modelId?: string; jobId?: string; batchSize?: number;
        };
        try {
          const { createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          const supabase = createServiceSupabase();
          const {
            SupabaseChunkRepository, SupabaseEmbeddingRepository, SupabaseEmbeddingJobRepository,
          } = await import("@/services/legal-knowledge/embeddings/repositories/SupabaseRepositories");
          const chunkRepo = new SupabaseChunkRepository(supabase);
          const embRepo = new SupabaseEmbeddingRepository(supabase);
          const jobRepo = new SupabaseEmbeddingJobRepository(supabase);

          let jobId = body.jobId;
          const modelId = body.modelId ?? EmbeddingModelRegistry.getDefault().modelId;
          if (!jobId) {
            if (!body.sourceId) return Response.json({ error: "sourceId required" }, { status: 400 });
            const { job } = await EmbeddingJobService.createJob({
              sourceId: body.sourceId, modelId,
              chunkRepo, embeddingRepo: embRepo, jobRepo,
            });
            jobId = job.id;
          }
          const apiKey = process.env.OPENAI_API_KEY;
          const result = await EmbeddingBatchProcessor.processBatch({
            jobId, jobRepo, chunkRepo, embeddingRepo: embRepo,
            ctx: { modelId, apiKey },
            options: { batchSize: body.batchSize ?? 16 },
          });
          return Response.json({
            jobId, done: result.done,
            processed: result.processed, successful: result.successful, failed: result.failed, skipped: result.skipped,
            job: result.job,
          });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
        }
      },
    },
  },
});
