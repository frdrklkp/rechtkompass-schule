/**
 * Server-Route: POST /api/legal-chunks-sync
 * Body: { sourceId, chunks: PersistedChunk[] }
 * Upsert persistierter Chunks. Aktiviert Idempotenz für Embedding-Jobs.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/legal-chunks-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          sourceId?: string;
          chunks?: Array<{
            id: string; chunkId: string; stableHash: string; contentHash: string;
            path: string; displayPath?: string; title?: string; content: string;
            normalizedContent: string; metadata?: Record<string, unknown>;
            token?: { characterCount: number; wordCount: number; tokenEstimate: number; sentenceCount: number };
            active?: boolean; chunkVersion?: number; primarySection?: string | null;
          }>;
        };
        if (!body.sourceId || !Array.isArray(body.chunks)) {
          return Response.json({ error: "sourceId and chunks required" }, { status: 400 });
        }
        try {
          const { createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          const { SupabaseChunkRepository } = await import(
            "@/services/legal-knowledge/embeddings/repositories/SupabaseRepositories"
          );
          const chunkRepo = new SupabaseChunkRepository(createServiceSupabase());
          const now = new Date().toISOString();
          const persisted = body.chunks.map((c) => ({
            id: c.id,
            chunkId: c.chunkId,
            sourceId: body.sourceId!,
            stableHash: c.stableHash,
            contentHash: c.contentHash,
            path: c.path,
            displayPath: c.displayPath ?? c.path,
            title: c.title ?? "",
            displayTitle: c.title ?? "",
            content: c.content,
            normalizedContent: c.normalizedContent,
            metadata: c.metadata ?? {},
            token: {
              characterCount: c.token?.characterCount ?? c.content.length,
              wordCount: c.token?.wordCount ?? 0,
              tokenEstimate: c.token?.tokenEstimate ?? Math.ceil(c.content.length / 4),
              sentenceCount: c.token?.sentenceCount ?? 0,
              averageSentenceLength: 0,
              referenceCount: 0,
            },
            active: c.active ?? true,
            chunkVersion: c.chunkVersion ?? 1,
            createdAt: now,
            updatedAt: now,
            primarySection: c.primarySection ?? undefined,
          }));
          await chunkRepo.upsertMany(persisted);
          const keepIds = persisted.map((p) => p.id);
          const deactivated = await chunkRepo.deactivate(body.sourceId, keepIds).catch(() => 0);
          return Response.json({ synced: persisted.length, deactivated });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
        }
      },
    },
  },
});
