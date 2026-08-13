import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

export const Route = createFileRoute("/api/search-embeddings-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        const { createPublicSupabase, getSearchIndexEnvStatus } = await import(
          "@/lib/searchEmbeddings.supabase.server"
        );
        const env = getSearchIndexEnvStatus();
        try {
          const supabase = createPublicSupabase();

          const { count: publishedCount, error: pcErr } = await (supabase.from as any)("practice_cases")
            .select("id", { count: "exact", head: true })
            .eq("status", "published");
          if (pcErr) throw new Error(pcErr.message);

          const { data: emb, error: embErr } = await (supabase.from as any)(
            "practice_case_search_embeddings",
          ).select("case_id, content_hash, embedding_model, updated_at");
          if (embErr) throw new Error(embErr.message);

          const rows = (emb ?? []) as Array<{ updated_at: string }>;
          let lastIndexedAt: string | null = null;
          for (const r of rows) {
            if (!lastIndexedAt || r.updated_at > lastIndexedAt) lastIndexedAt = r.updated_at;
          }

          return Response.json({
            publishedCount: publishedCount ?? 0,
            embeddingCount: rows.length,
            lastIndexedAt,
            env,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          return Response.json(
            { publishedCount: 0, embeddingCount: 0, lastIndexedAt: null, error: message, env },
            { status: 200 },
          );
        }
      },
    },
  },
});
