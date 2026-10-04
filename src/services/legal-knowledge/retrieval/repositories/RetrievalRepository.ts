/**
 * Retrieval-Repository-Port + InMemory- & Supabase-Adapter.
 * Kapselt den Datenzugriff. Retrieval-Domäne ist ansonsten frei von DB.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersistedChunk, ChunkRepositoryPort, EmbeddingRepositoryPort } from "../../embeddings/repositories/InMemoryRepositories";
import { SupabaseChunkRepository } from "../../embeddings/repositories/SupabaseRepositories";
import { EmbeddingSearch } from "../EmbeddingSearch";
import type { EmbeddingRecord } from "../../embeddings/types";
import type { EmbeddingSearchCandidate } from "../types";

export interface RetrievalCorpus {
  chunks: PersistedChunk[];
  embeddings: EmbeddingRecord[];
}

export interface VectorSearchOptions {
  queryVector: number[];
  sourceIds?: string[];
  topK: number;
  minSimilarity: number;
  activeOnly?: boolean;
}

export interface RetrievalRepositoryPort {
  loadCorpus(opts: { sourceIds?: string[]; activeOnly?: boolean }): Promise<RetrievalCorpus>;
  /**
   * Nur die genannten Chunks laden - für die Suche ohne Quellen-Eingrenzung,
   * bei der der Stichwort-Arm sonst den gesamten Bestand (>17k Chunks)
   * in den Prozess ziehen würde (gemessen: ~21 s pro Frage, 04.10.2026).
   */
  loadChunksByIds(ids: string[], opts?: { activeOnly?: boolean }): Promise<PersistedChunk[]>;
  /**
   * Stichwort-Kandidaten datenbankseitig vorselektieren (Teilstring-Treffer im
   * normalisierten Text), damit der Stichwort-Arm ohne Quellen-Eingrenzung
   * weiterhin exakte Begriffe und Paragraphen findet, die der Vektor-Arm
   * nicht liefert - ohne den Gesamtbestand zu laden.
   */
  loadChunksByKeywords(keywords: string[], opts: { activeOnly?: boolean; limit: number }): Promise<PersistedChunk[]>;
  listSourceIds(): Promise<string[]>;
  /** Top-K ähnlichste Chunks zum Query-Vektor (Cosine-Similarity). */
  vectorSearch(opts: VectorSearchOptions): Promise<EmbeddingSearchCandidate[]>;
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

  async loadChunksByIds(ids: string[], opts?: { activeOnly?: boolean }): Promise<PersistedChunk[]> {
    if (ids.length === 0) return [];
    const wanted = new Set(ids);
    const { chunks } = await this.loadCorpus({ activeOnly: opts?.activeOnly ?? true });
    return chunks.filter((c) => wanted.has(c.id));
  }

  async loadChunksByKeywords(keywords: string[], opts: { activeOnly?: boolean; limit: number }): Promise<PersistedChunk[]> {
    const kws = keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 1);
    if (kws.length === 0) return [];
    const { chunks } = await this.loadCorpus({ activeOnly: opts.activeOnly ?? true });
    return chunks
      .filter((c) => { const text = (c.normalizedContent || c.content || "").toLowerCase(); return kws.some((k) => text.includes(k)); })
      .slice(0, opts.limit);
  }

  async vectorSearch(opts: VectorSearchOptions): Promise<EmbeddingSearchCandidate[]> {
    const ids = opts.sourceIds && opts.sourceIds.length > 0 ? opts.sourceIds : this.knownSourceIds;
    const embAll: EmbeddingRecord[] = [];
    for (const sid of ids) {
      embAll.push(...(await this.embeddings.listBySource(sid)));
    }
    const active = embAll.filter((e) => e.invalidatedAt === null);
    return EmbeddingSearch.rank(opts.queryVector, active, {
      topK: opts.topK,
      minSimilarity: opts.minSimilarity,
    });
  }
}

/** Supabase-basierter Retrieval-Adapter. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export class SupabaseRetrievalRepository implements RetrievalRepositoryPort {
  private chunkRepo: SupabaseChunkRepository;
  constructor(private client: AnyClient) {
    this.chunkRepo = new SupabaseChunkRepository(client);
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
    // Chunks parallel (in kleinen Batches) laden statt sequenziell pro Quelle.
    // Embeddings werden nicht mehr geladen: die Vektorsuche läuft serverseitig
    // über die RPC match_legal_chunk_embeddings (siehe vectorSearch).
    const chunksAll: PersistedChunk[] = [];
    const concurrency = 8;
    for (let i = 0; i < ids.length; i += concurrency) {
      const batch = ids.slice(i, i + concurrency);
      const lists = await Promise.all(
        batch.map((sid) => this.chunkRepo.listBySource(sid, { activeOnly: opts.activeOnly ?? true })),
      );
      for (const list of lists) chunksAll.push(...list);
    }
    return { chunks: chunksAll, embeddings: [] };
  }

  async loadChunksByIds(ids: string[], opts?: { activeOnly?: boolean }): Promise<PersistedChunk[]> {
    return this.chunkRepo.listByIds(ids, { activeOnly: opts?.activeOnly ?? true });
  }

  async loadChunksByKeywords(keywords: string[], opts: { activeOnly?: boolean; limit: number }): Promise<PersistedChunk[]> {
    // Nur unproblematische Begriffe in die PostgREST-or-Syntax übernehmen
    // (keine Kommas/Klammern/Anführungszeichen, die den Filter brechen würden).
    const safe = keywords
      .map((k) => k.toLowerCase().trim())
      .filter((k) => k.length > 2 && /^[\p{L}\p{N}§\-. ]+$/u.test(k));
    if (safe.length === 0) return [];
    let q = this.client
      .from("legal_chunks")
      .select("*")
      .or(safe.map((k) => `normalized_content.ilike.%${k}%`).join(","))
      .limit(opts.limit);
    if (opts.activeOnly ?? true) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return this.chunkRepo.listByIds(((data ?? []) as Array<{ id: string }>).map((r) => r.id), { activeOnly: opts.activeOnly ?? true });
  }

  async vectorSearch(opts: VectorSearchOptions): Promise<EmbeddingSearchCandidate[]> {
    const { data, error } = await this.client.rpc("match_legal_chunk_embeddings", {
      query_embedding: `[${opts.queryVector.join(",")}]`,
      source_ids: opts.sourceIds && opts.sourceIds.length > 0 ? opts.sourceIds : null,
      match_count: opts.topK,
      min_similarity: opts.minSimilarity,
      active_only: opts.activeOnly ?? true,
    });
    if (error) {
      throw new Error(
        `Vektorsuche fehlgeschlagen (RPC match_legal_chunk_embeddings, ggf. Migration db/2026-09-29_legal_retrieval_vector_match.sql ausführen): ${error.message}`,
      );
    }
    return ((data ?? []) as Array<{ chunk_id: string; chunk_stable_hash: string; similarity: number }>).map((r) => ({
      chunkId: String(r.chunk_id),
      stableHash: String(r.chunk_stable_hash),
      similarity: Number(r.similarity),
    }));
  }
}
