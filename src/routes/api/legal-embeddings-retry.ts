/**
 * Server-Route: POST /api/legal-embeddings-retry  Body: { jobId }
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmbeddingJobService } from "@/services/legal-knowledge/embeddings";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

export const Route = createFileRoute("/api/legal-embeddings-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        const body = (await request.json().catch(() => ({}))) as { jobId?: string };
        if (!body.jobId) return Response.json({ error: "jobId required" }, { status: 400 });
        try {
          const { createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          const { SupabaseEmbeddingJobRepository } = await import(
            "@/services/legal-knowledge/embeddings/repositories/SupabaseRepositories"
          );
          const jobRepo = new SupabaseEmbeddingJobRepository(createServiceSupabase());
          const count = await EmbeddingJobService.retryFailedItems({ jobId: body.jobId, jobRepo });
          return Response.json({ retriedItems: count });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
        }
      },
    },
  },
});
