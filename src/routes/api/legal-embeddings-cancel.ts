/**
 * Server-Route: POST /api/legal-embeddings-cancel   Body: { jobId }
 *              POST /api/legal-embeddings-retry    Body: { jobId }
 * Zusammengefasst in einer Datei? Nein — TanStack file-based routing verlangt
 * eine eigene Datei pro Pfad. Diese Datei liefert nur cancel.
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmbeddingJobService } from "@/services/legal-knowledge/embeddings";

export const Route = createFileRoute("/api/legal-embeddings-cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { jobId?: string };
        if (!body.jobId) return Response.json({ error: "jobId required" }, { status: 400 });
        try {
          const { createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          const { SupabaseEmbeddingJobRepository } = await import(
            "@/services/legal-knowledge/embeddings/repositories/SupabaseRepositories"
          );
          const jobRepo = new SupabaseEmbeddingJobRepository(createServiceSupabase());
          const job = await EmbeddingJobService.cancelJob({ jobId: body.jobId, jobRepo });
          return Response.json({ job });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
        }
      },
    },
  },
});
