/**
 * Server-Route: POST /api/legal-retrieval-search
 * Body: { query, filters?, limit?, offset?, searchType?, debug? }
 * Nutzt SupabaseRetrievalRepository. Kein Fallback auf KI-Antworten.
 */
import { createFileRoute } from "@tanstack/react-router";
import { HybridRetrievalService } from "@/services/legal-knowledge/retrieval";
import type { RetrievalFilters, SearchType } from "@/services/legal-knowledge/retrieval";

export const Route = createFileRoute("/api/legal-retrieval-search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          query?: string;
          filters?: RetrievalFilters;
          limit?: number;
          offset?: number;
          searchType?: SearchType;
          debug?: boolean;
          sourceIds?: string[];
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const query = (body.query ?? "").trim();
        if (!query) return Response.json({ error: "query fehlt" }, { status: 400 });

        try {
          const { createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          const supabase = createServiceSupabase();
          const { SupabaseRetrievalRepository } = await import(
            "@/services/legal-knowledge/retrieval/repositories/RetrievalRepository"
          );
          const repo = new SupabaseRetrievalRepository(supabase);
          const service = new HybridRetrievalService(repo);
          const filters: RetrievalFilters = { ...(body.filters ?? {}) };
          if (body.sourceIds && body.sourceIds.length > 0) filters.sourceIds = body.sourceIds;
          const result = await service.search({
            query,
            filters,
            limit: body.limit,
            offset: body.offset,
            searchType: body.searchType,
            debug: body.debug,
          });
          return Response.json({ result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          const migrationHint =
            /relation .*legal_(chunks|chunk_embeddings)/.test(message) ||
            /does not exist/i.test(message);
          return Response.json(
            {
              error: message,
              setup: { schemaMigrated: !migrationHint },
              result: null,
            },
            { status: 200 },
          );
        }
      },
    },
  },
});
