/**
 * Retrieval-Repository-Port + InMemory- & Supabase-Adapter.
 * Kapselt den Datenzugriff. Retrieval-Domäne ist ansonsten frei von DB.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersistedChunk, ChunkRepositoryPort, EmbeddingRepositoryPort } from "../../embeddings/repositories/InMemoryRepositories";
import { SupabaseChunkRepository, SupabaseEmbeddingRepository } from "../../embeddings/repositories/SupabaseRepositories";
import type { EmbeddingRecord } from "../../embeddings/types";

export interface RetrievalCorpus {
  chunks: PersistedChunk[];
  embeddings: EmbeddingRecord[];
}

export interface RetrievalRepositoryPort {
  loadCorpus(opts: { sourceIds?: string[]; activeOnly?: boolean }): Promise<RetrievalCorpus>;
  listSourceIds(): Promise<string[]>;
}

/** In-Memory Repository für Tests. */
export class InMemoryRetrievalRepository implements RetrievalRepositoryPort {
  constructor(
    private chunks: ChunkRepositoryPort,
    private embeddings: EmbeddingRepositoryPort,
    private knownSourceIds: string[],
  ) {}

  async loadCorpus(opts: { sourceIds?: string[]; activeOnly?: boolean } = {}): Promise<RetrievalCorpus> {
    const ids = opts.sourceIds && opts.sourceIds.length > 0 ? opts.sourceIds : this.knownSourceIds;
    const chunksAll: PersistedChunk[] = [];
    const embAll: EmbeddingRecord[] = [];
    for (const sid of ids) {
      chunksAll.push(...(await this.chunks.listBySource(sid, { activeOnly: opts.activeOnly ?? true })));
      embAll.push(...(await this.embeddings.listBySource(sid)));
    }
    return { chunks: chunksAll, embeddings: embAll };
  }

  async listSourceIds(): Promise<string[]> { return [...this.knownSourceIds]; }
}

/** Supabase-basierter Retrieval-Adapter. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export class SupabaseRetrievalRepository implements RetrievalRepositoryPort {
  private chunkRepo: SupabaseChunkRepository;
  private embRepo: SupabaseEmbeddingRepository;
  constructor(private client: AnyClient) {
    this.chunkRepo = new SupabaseChunkRepository(client);
    this.embRepo = new SupabaseEmbeddingRepository(client);
  }

  async listSourceIds(): Promise<string[]> {
    const { data, error } = await this.client
      .from("legal_sources")
      .select("id, lifecycle_status")
      .in("lifecycle_status", ["active", "verified", "imported", "needs_review", "outdated"]);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  async loadCorpus(opts: { sourceIds?: string[]; activeOnly?: boolean } = {}): Promise<RetrievalCorpus> {
    const ids = opts.sourceIds && opts.sourceIds.length > 0 ? opts.sourceIds : await this.listSourceIds();
    if (ids.length === 0) return { chunks: [], embeddings: [] };
    const chunksAll: PersistedChunk[] = [];
    const embAll: EmbeddingRecord[] = [];
    for (const sid of ids) {
      chunksAll.push(...(await this.chunkRepo.listBySource(sid, { activeOnly: opts.activeOnly ?? true })));
      embAll.push(...(await this.embRepo.listBySource(sid)));
    }
    return { chunks: chunksAll, embeddings: embAll };
  }
}
