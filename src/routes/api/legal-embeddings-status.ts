/**
 * Server-Route: GET /api/legal-embeddings-status?sourceId=...
 * Liefert Overview + Job-Liste. Bricht sauber ab, wenn Migration fehlt.
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmbeddingModelRegistry, EmbeddingStatistics } from "@/services/legal-knowledge/embeddings";

export const Route = createFileRoute("/api/legal-embeddings-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sourceId = url.searchParams.get("sourceId");
        if (!sourceId) return Response.json({ error: "sourceId required" }, { status: 400 });

        try {
          const { createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          const supabase = createServiceSupabase();
          const [
            { SupabaseChunkRepository, SupabaseEmbeddingRepository, SupabaseEmbeddingJobRepository },
          ] = await Promise.all([
            import("@/services/legal-knowledge/embeddings/repositories/SupabaseRepositories"),
          ]);
          const chunkRepo = new SupabaseChunkRepository(supabase);
          const embRepo = new SupabaseEmbeddingRepository(supabase);
          const jobRepo = new SupabaseEmbeddingJobRepository(supabase);

          const [chunks, embeddings, jobs] = await Promise.all([
            chunkRepo.listBySource(sourceId, { activeOnly: true }),
            embRepo.listBySource(sourceId),
            jobRepo.listJobs(sourceId),
          ]);
          const model = EmbeddingModelRegistry.getDefault();
          const overview = EmbeddingStatistics.buildOverview({
            sourceId, sourceLabel: sourceId, model, chunks, embeddings,
          });
          return Response.json({
            overview,
            jobs,
            model: { modelId: model.modelId, version: model.version, providerId: model.providerId, dimensions: model.dimensions },
            setup: { schemaMigrated: true },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          const migrationHint =
            /relation .*legal_(chunks|chunk_embeddings|embedding_jobs)/.test(message) ||
            /does not exist/i.test(message);
          return Response.json({
            error: message,
            setup: { schemaMigrated: !migrationHint },
            overview: null, jobs: [],
          }, { status: 200 });
        }
      },
    },
  },
});
