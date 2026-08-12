import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/search-embeddings-query")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { query?: string; limit?: number };
        try {
          body = (await request.json()) as { query?: string; limit?: number };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const query = (body.query ?? "").trim();
        const limit = Math.max(1, Math.min(50, Number(body.limit ?? 25)));
        if (!query) return Response.json({ hits: [] });

        try {
          const { generateEmbedding } = await import("@/lib/searchEmbeddings.server");
          const { createPublicSupabase } = await import(
            "@/lib/searchEmbeddings.supabase.server"
          );
          const supabase = createPublicSupabase();

          const { embedding } = await generateEmbedding(query);

          const { data, error } = await (supabase.rpc as any)(
            "match_practice_case_embeddings",
            { query_embedding: embedding, match_count: limit },
          );
          if (error) throw new Error(error.message);

          const hits = (data ?? []).map((r: { case_id: string; similarity: number }) => ({
            caseId: r.case_id,
            similarity: r.similarity,
          }));
          return Response.json({ hits });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          return Response.json({ hits: [], error: message }, { status: 200 });
        }
      },
    },
  },
});
