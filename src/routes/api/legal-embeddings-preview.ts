/**
 * Server-Route: POST /api/legal-embeddings-preview
 * Body: { sourceId, modelId? }
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmbeddingJobService, EmbeddingModelRegistry } from "@/services/legal-knowledge/embeddings";

export const Route = createFileRoute("/api/legal-embeddings-preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { sourceId?: string; modelId?: string };
        if (!body.sourceId) return Response.json({ error: "sourceId required" }, { status: 400 });
        try {
          const { createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          const supabase = createServiceSupabase();
          const { SupabaseChunkRepository, SupabaseEmbeddingRepository } = await import(
            "@/services/legal-knowledge/embeddings/repositories/SupabaseRepositories"
          );
          const chunkRepo = new SupabaseChunkRepository(supabase);
          const embRepo = new SupabaseEmbeddingRepository(supabase);
          const modelId = body.modelId ?? EmbeddingModelRegistry.getDefault().modelId;
          const preview = await EmbeddingJobService.preview({ sourceId: body.sourceId, modelId, chunkRepo, embeddingRepo: embRepo });
          return Response.json({ preview });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
        }
      },
    },
  },
});
