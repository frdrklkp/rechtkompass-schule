/**
 * Server-Route: POST /api/legal-embeddings-validate  Body: { sourceId }
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmbeddingModelRegistry, EmbeddingValidator } from "@/services/legal-knowledge/embeddings";

export const Route = createFileRoute("/api/legal-embeddings-validate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { sourceId?: string; modelId?: string };
        if (!body.sourceId) return Response.json({ error: "sourceId required" }, { status: 400 });
        try {
          const { createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          const { SupabaseChunkRepository, SupabaseEmbeddingRepository } = await import(
            "@/services/legal-knowledge/embeddings/repositories/SupabaseRepositories"
          );
          const supabase = createServiceSupabase();
          const chunkRepo = new SupabaseChunkRepository(supabase);
          const embRepo = new SupabaseEmbeddingRepository(supabase);
          const [chunks, embeddings] = await Promise.all([
            chunkRepo.listBySource(body.sourceId),
            embRepo.listBySource(body.sourceId),
          ]);
          const model = EmbeddingModelRegistry.get(body.modelId ?? EmbeddingModelRegistry.getDefault().modelId);
          const report = EmbeddingValidator.validate({ chunks, embeddings, model });
          return Response.json({ report });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
        }
      },
    },
  },
});
