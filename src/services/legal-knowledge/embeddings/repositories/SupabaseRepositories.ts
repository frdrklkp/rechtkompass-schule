/**
 * Supabase-Implementierungen der Repository-Ports.
 * Nur serverseitig aufrufen (aus src/routes/api/legal-embeddings-*.ts).
 * Nutzt einen bereitgestellten SupabaseClient (Service-Role oder Publishable).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChunkRepositoryPort,
  EmbeddingRepositoryPort,
  EmbeddingJobRepositoryPort,
  PersistedChunk,
} from "./InMemoryRepositories";
import type {
  EmbeddingJob,
  EmbeddingJobItem,
  EmbeddingJobItemStatus,
  EmbeddingRecord,
  EmbeddingProviderId,
} from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

function toChunk(row: Record<string, unknown>): PersistedChunk {
  return {
    id: String(row.id),
    chunkId: String(row.chunk_id),
    sourceId: (row.source_id as string | null) ?? null,
    stableHash: String(row.stable_hash),
    contentHash: String(row.content_hash ?? ""),
    path: String(row.path ?? ""),
    displayPath: String(row.display_path ?? row.path ?? ""),
    title: (row.title as string | null) ?? "",
    displayTitle: (row.title as string | null) ?? "",
    content: String(row.content ?? ""),
    normalizedContent: String(row.normalized_content ?? ""),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    token: {
      characterCount: Number(row.character_count ?? 0),
      wordCount: Number(row.word_count ?? 0),
      tokenEstimate: Number(row.token_estimate ?? 0),
      sentenceCount: Number(row.sentence_count ?? 0),
      averageSentenceLength: 0,
      referenceCount: Array.isArray(row.references) ? row.references.length : 0,
    },
    active: Boolean(row.active ?? true),
    chunkVersion: Number(row.chunk_version ?? 1),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    primarySection: (row.primary_section_id as string | undefined) ?? undefined,
  };
}

function toEmbedding(row: Record<string, unknown>): EmbeddingRecord {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    chunkId: String(row.chunk_id),
    chunkStableHash: String(row.chunk_stable_hash),
    chunkPath: String(row.chunk_path),
    providerId: row.provider_id as EmbeddingProviderId,
    modelId: String(row.model_id),
    modelVersion: String(row.model_version),
    dimensions: Number(row.dimensions),
    vector: Array.isArray(row.embedding) ? (row.embedding as number[]) : parseVector(row.embedding),
    status: (row.embedding_status as EmbeddingRecord["status"]) ?? "embedded",
    contentHash: String(row.content_hash),
    inputFormatVersion: Number(row.input_format_version ?? 1),
    tokenCount: (row.token_count as number | null) ?? null,
    inputCharacterCount: (row.input_character_count as number | null) ?? null,
    usage: (row.usage_metadata as EmbeddingRecord["usage"]) ?? null,
    cost: (row.cost_metadata as EmbeddingRecord["cost"]) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    attemptCount: Number(row.attempt_count ?? 0),
    embeddedAt: String(row.embedded_at ?? new Date().toISOString()),
    invalidatedAt: (row.invalidated_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function parseVector(v: unknown): number[] {
  if (typeof v === "string") {
    // pgvector textual format: "[0.1,0.2,...]"
    try { return JSON.parse(v) as number[]; } catch { return []; }
  }
  return [];
}

function toJob(row: Record<string, unknown>): EmbeddingJob {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    providerId: row.provider_id as EmbeddingProviderId,
    modelId: String(row.model_id),
    modelVersion: String(row.model_version),
    inputFormatVersion: Number(row.input_format_version ?? 1),
    status: row.status as EmbeddingJob["status"],
    requestedBy: (row.requested_by as string | null) ?? null,
    triggerType: row.trigger_type as EmbeddingJob["triggerType"],
    totals: {
      total: Number(row.total_chunks ?? 0),
      pending: Number(row.pending_chunks ?? 0),
      processed: Number(row.processed_chunks ?? 0),
      successful: Number(row.successful_chunks ?? 0),
      failed: Number(row.failed_chunks ?? 0),
      skipped: Number(row.skipped_chunks ?? 0),
    },
    tokens: { estimated: Number(row.estimated_tokens ?? 0), actual: Number(row.actual_tokens ?? 0) },
    cost: {
      estimated: Number(row.estimated_cost ?? 0),
      actual: Number(row.actual_cost ?? 0),
      source: (row.cost_source as EmbeddingJob["cost"]["source"]) ?? "estimated",
    },
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    errorSummary: (row.error_summary as Record<string, number>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function toItem(row: Record<string, unknown>): EmbeddingJobItem {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    chunkId: String(row.chunk_id),
    chunkStableHash: String(row.chunk_stable_hash),
    status: row.status as EmbeddingJobItemStatus,
    attemptCount: Number(row.attempt_count ?? 0),
    providerRequestId: (row.provider_request_id as string | null) ?? null,
    tokenCount: (row.token_count as number | null) ?? null,
    latencyMs: (row.latency_ms as number | null) ?? null,
    workerId: (row.worker_id as string | null) ?? null,
    processingStartedAt: (row.processing_started_at as string | null) ?? null,
    processingLeaseUntil: (row.processing_lease_until as string | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

// ============ Chunk Repository ==============================================

export class SupabaseChunkRepository implements ChunkRepositoryPort {
  constructor(private client: AnyClient) {}

  async upsertMany(chunks: PersistedChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const payload = chunks.map((c) => ({
      id: c.id,
      source_id: c.sourceId,
      primary_section_id: c.primarySection ?? null,
      chunk_id: c.chunkId,
      stable_hash: c.stableHash,
      content_hash: c.contentHash,
      path: c.path,
      display_path: c.displayPath,
      breadcrumb: [],
      chunk_type: (c.metadata?.chunkStrategy as string) ?? "paragraph",
      title: c.title,
      content: c.content,
      normalized_content: c.normalizedContent,
      section_ids: [],
      metadata: c.metadata ?? {},
      references: [],
      token_estimate: c.token?.tokenEstimate ?? 0,
      character_count: c.token?.characterCount ?? 0,
      word_count: c.token?.wordCount ?? 0,
      sentence_count: c.token?.sentenceCount ?? 0,
      order_index: 0,
      parent_chunk_id: null,
      confidence: null,
      chunk_version: c.chunkVersion,
      active: c.active,
    }));
    const { error } = await this.client.from("legal_chunks").upsert(payload, {
      onConflict: "source_id,chunk_id,chunk_version",
    });
    if (error) throw new Error(`Upsert legal_chunks fehlgeschlagen: ${error.message}`);
  }

  async listBySource(sourceId: string, opts?: { activeOnly?: boolean }): Promise<PersistedChunk[]> {
    let q = this.client.from("legal_chunks").select("*").eq("source_id", sourceId);
    if (opts?.activeOnly) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(toChunk);
  }

  async getById(id: string): Promise<PersistedChunk | null> {
    const { data, error } = await this.client.from("legal_chunks").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toChunk(data as Record<string, unknown>) : null;
  }

  async deactivate(sourceId: string, keepIds: string[]): Promise<number> {
    const { data, error } = await this.client
      .from("legal_chunks").update({ active: false })
      .eq("source_id", sourceId).eq("active", true)
      .not("id", "in", `(${keepIds.length ? keepIds.map((id) => `"${id}"`).join(",") : "'00000000-0000-0000-0000-000000000000'"})`)
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }
}

// ============ Embedding Repository ==========================================

export class SupabaseEmbeddingRepository implements EmbeddingRepositoryPort {
  constructor(private client: AnyClient) {}

  async upsert(record: Omit<EmbeddingRecord, "id" | "createdAt" | "updatedAt">): Promise<EmbeddingRecord> {
    // Alte aktive Version invalidieren
    await this.client.from("legal_chunk_embeddings").update({ invalidated_at: new Date().toISOString() })
      .eq("chunk_id", record.chunkId)
      .eq("model_id", record.modelId)
      .eq("model_version", record.modelVersion)
      .eq("input_format_version", record.inputFormatVersion)
      .is("invalidated_at", null);

    const vectorLiteral = `[${record.vector.join(",")}]`;
    const payload = {
      source_id: record.sourceId,
      chunk_id: record.chunkId,
      chunk_stable_hash: record.chunkStableHash,
      chunk_path: record.chunkPath,
      provider_id: record.providerId,
      model_id: record.modelId,
      model_version: record.modelVersion,
      dimensions: record.dimensions,
      embedding: vectorLiteral,
      embedding_status: record.status,
      content_hash: record.contentHash,
      input_format_version: record.inputFormatVersion,
      token_count: record.tokenCount,
      input_character_count: record.inputCharacterCount,
      usage_metadata: record.usage ?? {},
      cost_metadata: record.cost ?? {},
      error_code: record.errorCode,
      error_message: record.errorMessage,
      attempt_count: record.attemptCount,
      embedded_at: record.embeddedAt,
      invalidated_at: null,
    };
    const { data, error } = await this.client.from("legal_chunk_embeddings").insert(payload).select("*").single();
    if (error) throw new Error(`Insert embedding failed: ${error.message}`);
    return toEmbedding(data as Record<string, unknown>);
  }

  async findActive(chunkId: string, modelId: string, modelVersion: string, inputFormatVersion: number): Promise<EmbeddingRecord | null> {
    const { data, error } = await this.client.from("legal_chunk_embeddings").select("*")
      .eq("chunk_id", chunkId).eq("model_id", modelId).eq("model_version", modelVersion)
      .eq("input_format_version", inputFormatVersion).is("invalidated_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEmbedding(data as Record<string, unknown>) : null;
  }

  async listBySource(sourceId: string): Promise<EmbeddingRecord[]> {
    // Nur Metadaten laden — Vektoren würden Payload sprengen.
    const { data, error } = await this.client.from("legal_chunk_embeddings")
      .select("id, source_id, chunk_id, chunk_stable_hash, chunk_path, provider_id, model_id, model_version, dimensions, embedding_status, content_hash, input_format_version, token_count, input_character_count, usage_metadata, cost_metadata, error_code, error_message, attempt_count, embedded_at, invalidated_at, created_at, updated_at")
      .eq("source_id", sourceId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...toEmbedding(r), vector: [] }));
  }

  async invalidate(chunkId: string, opts?: { modelId?: string }): Promise<number> {
    let q = this.client.from("legal_chunk_embeddings").update({ invalidated_at: new Date().toISOString() })
      .eq("chunk_id", chunkId).is("invalidated_at", null);
    if (opts?.modelId) q = q.eq("model_id", opts.modelId);
    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }

  async invalidateBySource(sourceId: string): Promise<number> {
    const { data, error } = await this.client.from("legal_chunk_embeddings")
      .update({ invalidated_at: new Date().toISOString() })
      .eq("source_id", sourceId).is("invalidated_at", null).select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }
}

// ============ Job Repository ================================================

export class SupabaseEmbeddingJobRepository implements EmbeddingJobRepositoryPort {
  constructor(private client: AnyClient) {}

  async createJob(job: Omit<EmbeddingJob, "id" | "createdAt" | "updatedAt">): Promise<EmbeddingJob> {
    const { data, error } = await this.client.from("legal_embedding_jobs").insert({
      source_id: job.sourceId,
      provider_id: job.providerId,
      model_id: job.modelId,
      model_version: job.modelVersion,
      input_format_version: job.inputFormatVersion,
      status: job.status,
      requested_by: job.requestedBy,
      trigger_type: job.triggerType,
      total_chunks: job.totals.total,
      pending_chunks: job.totals.pending,
      processed_chunks: job.totals.processed,
      successful_chunks: job.totals.successful,
      failed_chunks: job.totals.failed,
      skipped_chunks: job.totals.skipped,
      estimated_tokens: job.tokens.estimated,
      actual_tokens: job.tokens.actual,
      estimated_cost: job.cost.estimated,
      actual_cost: job.cost.actual,
      cost_source: job.cost.source,
      started_at: job.startedAt,
      completed_at: job.completedAt,
      cancelled_at: job.cancelledAt,
      error_summary: job.errorSummary,
      metadata: job.metadata,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return toJob(data as Record<string, unknown>);
  }

  async updateJob(id: string, patch: Partial<EmbeddingJob>): Promise<EmbeddingJob> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.startedAt !== undefined) dbPatch.started_at = patch.startedAt;
    if (patch.completedAt !== undefined) dbPatch.completed_at = patch.completedAt;
    if (patch.cancelledAt !== undefined) dbPatch.cancelled_at = patch.cancelledAt;
    if (patch.totals) {
      dbPatch.total_chunks = patch.totals.total;
      dbPatch.pending_chunks = patch.totals.pending;
      dbPatch.processed_chunks = patch.totals.processed;
      dbPatch.successful_chunks = patch.totals.successful;
      dbPatch.failed_chunks = patch.totals.failed;
      dbPatch.skipped_chunks = patch.totals.skipped;
    }
    if (patch.tokens) {
      dbPatch.estimated_tokens = patch.tokens.estimated;
      dbPatch.actual_tokens = patch.tokens.actual;
    }
    if (patch.cost) {
      dbPatch.estimated_cost = patch.cost.estimated;
      dbPatch.actual_cost = patch.cost.actual;
      dbPatch.cost_source = patch.cost.source;
    }
    if (patch.errorSummary) dbPatch.error_summary = patch.errorSummary;
    if (patch.metadata) dbPatch.metadata = patch.metadata;

    const { data, error } = await this.client.from("legal_embedding_jobs")
      .update(dbPatch).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return toJob(data as Record<string, unknown>);
  }

  async getJob(id: string): Promise<EmbeddingJob | null> {
    const { data, error } = await this.client.from("legal_embedding_jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toJob(data as Record<string, unknown>) : null;
  }

  async listJobs(sourceId?: string): Promise<EmbeddingJob[]> {
    let q = this.client.from("legal_embedding_jobs").select("*").order("created_at", { ascending: false });
    if (sourceId) q = q.eq("source_id", sourceId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(toJob);
  }

  async createItems(items: Array<Omit<EmbeddingJobItem, "id" | "createdAt" | "updatedAt">>): Promise<EmbeddingJobItem[]> {
    if (items.length === 0) return [];
    const payload = items.map((i) => ({
      job_id: i.jobId, chunk_id: i.chunkId, chunk_stable_hash: i.chunkStableHash,
      status: i.status, attempt_count: i.attemptCount,
    }));
    const { data, error } = await this.client.from("legal_embedding_job_items").insert(payload).select("*");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(toItem);
  }

  async updateItem(id: string, patch: Partial<EmbeddingJobItem>): Promise<EmbeddingJobItem> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.attemptCount !== undefined) dbPatch.attempt_count = patch.attemptCount;
    if (patch.tokenCount !== undefined) dbPatch.token_count = patch.tokenCount;
    if (patch.latencyMs !== undefined) dbPatch.latency_ms = patch.latencyMs;
    if (patch.workerId !== undefined) dbPatch.worker_id = patch.workerId;
    if (patch.processingStartedAt !== undefined) dbPatch.processing_started_at = patch.processingStartedAt;
    if (patch.processingLeaseUntil !== undefined) dbPatch.processing_lease_until = patch.processingLeaseUntil;
    if (patch.errorCode !== undefined) dbPatch.error_code = patch.errorCode;
    if (patch.errorMessage !== undefined) dbPatch.error_message = patch.errorMessage;
    if (patch.startedAt !== undefined) dbPatch.started_at = patch.startedAt;
    if (patch.completedAt !== undefined) dbPatch.completed_at = patch.completedAt;

    const { data, error } = await this.client.from("legal_embedding_job_items")
      .update(dbPatch).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return toItem(data as Record<string, unknown>);
  }

  async listItems(jobId: string, opts?: { status?: EmbeddingJobItemStatus[] }): Promise<EmbeddingJobItem[]> {
    let q = this.client.from("legal_embedding_job_items").select("*").eq("job_id", jobId);
    if (opts?.status?.length) q = q.in("status", opts.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(toItem);
  }

  async claimPendingItems(jobId: string, batchSize: number, workerId: string, leaseMs: number): Promise<EmbeddingJobItem[]> {
    // Vereinfachtes Claiming ohne Advisory Lock. Für Sprint 4.1D ausreichend.
    const now = Date.now();
    const nowIso = new Date().toISOString();
    const leaseIso = new Date(now + leaseMs).toISOString();

    const { data: candidates, error } = await this.client.from("legal_embedding_job_items")
      .select("id, status, processing_lease_until, attempt_count")
      .eq("job_id", jobId)
      .in("status", ["pending", "retryable"])
      .limit(batchSize);
    if (error) throw new Error(error.message);
    const ids = ((candidates ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return [];
    const { data, error: uErr } = await this.client.from("legal_embedding_job_items")
      .update({ status: "processing", worker_id: workerId, processing_started_at: nowIso, processing_lease_until: leaseIso })
      .in("id", ids).select("*");
    if (uErr) throw new Error(uErr.message);
    return ((data ?? []) as Record<string, unknown>[]).map(toItem);
  }
}
