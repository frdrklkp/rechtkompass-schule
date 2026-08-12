/**
 * Repository-Ports und InMemory-Referenzimplementierungen.
 * Supabase-Implementierungen werden in derselben Domäne parallel gehalten.
 */
import type {
  EmbeddingJob,
  EmbeddingJobItem,
  EmbeddingJobItemStatus,
  EmbeddingJobStatus,
  EmbeddingRecord,
  ChunkForEmbedding,
} from "../types";

export interface PersistedChunk extends ChunkForEmbedding {
  id: string;
  active: boolean;
  chunkVersion: number;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkRepositoryPort {
  upsertMany(chunks: PersistedChunk[]): Promise<void>;
  listBySource(sourceId: string, opts?: { activeOnly?: boolean }): Promise<PersistedChunk[]>;
  getById(id: string): Promise<PersistedChunk | null>;
  deactivate(sourceId: string, keepIds: string[]): Promise<number>;
}

export interface EmbeddingRepositoryPort {
  upsert(record: Omit<EmbeddingRecord, "id" | "createdAt" | "updatedAt">): Promise<EmbeddingRecord>;
  findActive(chunkId: string, modelId: string, modelVersion: string, inputFormatVersion: number): Promise<EmbeddingRecord | null>;
  listBySource(sourceId: string): Promise<EmbeddingRecord[]>;
  invalidate(chunkId: string, opts?: { modelId?: string }): Promise<number>;
  invalidateBySource(sourceId: string): Promise<number>;
}

export interface EmbeddingJobRepositoryPort {
  createJob(job: Omit<EmbeddingJob, "id" | "createdAt" | "updatedAt">): Promise<EmbeddingJob>;
  updateJob(id: string, patch: Partial<EmbeddingJob>): Promise<EmbeddingJob>;
  getJob(id: string): Promise<EmbeddingJob | null>;
  listJobs(sourceId?: string): Promise<EmbeddingJob[]>;
  createItems(items: Array<Omit<EmbeddingJobItem, "id" | "createdAt" | "updatedAt">>): Promise<EmbeddingJobItem[]>;
  updateItem(id: string, patch: Partial<EmbeddingJobItem>): Promise<EmbeddingJobItem>;
  listItems(jobId: string, opts?: { status?: EmbeddingJobItemStatus[] }): Promise<EmbeddingJobItem[]>;
  claimPendingItems(jobId: string, batchSize: number, workerId: string, leaseMs: number): Promise<EmbeddingJobItem[]>;
}

// ---------- InMemory (Tests + Fallback) --------------------------------------

let idCounter = 1;
function nextId(prefix: string): string { return `${prefix}-${idCounter++}`; }

export class InMemoryChunkRepository implements ChunkRepositoryPort {
  private byId = new Map<string, PersistedChunk>();
  async upsertMany(chunks: PersistedChunk[]): Promise<void> {
    for (const c of chunks) this.byId.set(c.id, c);
  }
  async listBySource(sourceId: string, opts?: { activeOnly?: boolean }): Promise<PersistedChunk[]> {
    return [...this.byId.values()].filter((c) => c.sourceId === sourceId && (!opts?.activeOnly || c.active));
  }
  async getById(id: string): Promise<PersistedChunk | null> { return this.byId.get(id) ?? null; }
  async deactivate(sourceId: string, keepIds: string[]): Promise<number> {
    const keep = new Set(keepIds);
    let n = 0;
    for (const c of this.byId.values()) {
      if (c.sourceId === sourceId && !keep.has(c.id) && c.active) { c.active = false; n++; }
    }
    return n;
  }
}

export class InMemoryEmbeddingRepository implements EmbeddingRepositoryPort {
  private records = new Map<string, EmbeddingRecord>();
  async upsert(record: Omit<EmbeddingRecord, "id" | "createdAt" | "updatedAt">): Promise<EmbeddingRecord> {
    // Alte aktive Version invalidieren
    for (const r of this.records.values()) {
      if (
        r.chunkId === record.chunkId &&
        r.modelId === record.modelId &&
        r.modelVersion === record.modelVersion &&
        r.inputFormatVersion === record.inputFormatVersion &&
        r.invalidatedAt === null
      ) {
        r.invalidatedAt = new Date().toISOString();
      }
    }
    const id = nextId("emb");
    const now = new Date().toISOString();
    const full: EmbeddingRecord = { ...record, id, createdAt: now, updatedAt: now };
    this.records.set(id, full);
    return full;
  }
  async findActive(chunkId: string, modelId: string, modelVersion: string, inputFormatVersion: number): Promise<EmbeddingRecord | null> {
    for (const r of this.records.values()) {
      if (r.chunkId === chunkId && r.modelId === modelId && r.modelVersion === modelVersion &&
          r.inputFormatVersion === inputFormatVersion && r.invalidatedAt === null) return r;
    }
    return null;
  }
  async listBySource(sourceId: string): Promise<EmbeddingRecord[]> {
    return [...this.records.values()].filter((r) => r.sourceId === sourceId);
  }
  async invalidate(chunkId: string, opts?: { modelId?: string }): Promise<number> {
    let n = 0;
    const now = new Date().toISOString();
    for (const r of this.records.values()) {
      if (r.chunkId === chunkId && r.invalidatedAt === null && (!opts?.modelId || r.modelId === opts.modelId)) {
        r.invalidatedAt = now; n++;
      }
    }
    return n;
  }
  async invalidateBySource(sourceId: string): Promise<number> {
    let n = 0;
    const now = new Date().toISOString();
    for (const r of this.records.values()) {
      if (r.sourceId === sourceId && r.invalidatedAt === null) { r.invalidatedAt = now; n++; }
    }
    return n;
  }
}

export class InMemoryEmbeddingJobRepository implements EmbeddingJobRepositoryPort {
  private jobs = new Map<string, EmbeddingJob>();
  private items = new Map<string, EmbeddingJobItem>();

  async createJob(job: Omit<EmbeddingJob, "id" | "createdAt" | "updatedAt">): Promise<EmbeddingJob> {
    const id = nextId("job");
    const now = new Date().toISOString();
    const full: EmbeddingJob = { ...job, id, createdAt: now, updatedAt: now };
    this.jobs.set(id, full);
    return full;
  }
  async updateJob(id: string, patch: Partial<EmbeddingJob>): Promise<EmbeddingJob> {
    const cur = this.jobs.get(id);
    if (!cur) throw new Error(`job ${id} not found`);
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    this.jobs.set(id, next);
    return next;
  }
  async getJob(id: string): Promise<EmbeddingJob | null> { return this.jobs.get(id) ?? null; }
  async listJobs(sourceId?: string): Promise<EmbeddingJob[]> {
    const all = [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sourceId ? all.filter((j) => j.sourceId === sourceId) : all;
  }
  async createItems(items: Array<Omit<EmbeddingJobItem, "id" | "createdAt" | "updatedAt">>): Promise<EmbeddingJobItem[]> {
    const out: EmbeddingJobItem[] = [];
    for (const it of items) {
      const id = nextId("item");
      const now = new Date().toISOString();
      const full: EmbeddingJobItem = { ...it, id, createdAt: now, updatedAt: now };
      this.items.set(id, full);
      out.push(full);
    }
    return out;
  }
  async updateItem(id: string, patch: Partial<EmbeddingJobItem>): Promise<EmbeddingJobItem> {
    const cur = this.items.get(id);
    if (!cur) throw new Error(`item ${id} not found`);
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    this.items.set(id, next);
    return next;
  }
  async listItems(jobId: string, opts?: { status?: EmbeddingJobItemStatus[] }): Promise<EmbeddingJobItem[]> {
    let out = [...this.items.values()].filter((i) => i.jobId === jobId);
    if (opts?.status?.length) out = out.filter((i) => opts.status!.includes(i.status));
    return out;
  }
  async claimPendingItems(jobId: string, batchSize: number, workerId: string, leaseMs: number): Promise<EmbeddingJobItem[]> {
    const now = Date.now();
    const claimed: EmbeddingJobItem[] = [];
    for (const it of this.items.values()) {
      if (claimed.length >= batchSize) break;
      if (it.jobId !== jobId) continue;
      const leaseExpired = !it.processingLeaseUntil || Date.parse(it.processingLeaseUntil) < now;
      const isClaimable = it.status === "pending" || it.status === "retryable" || (it.status === "processing" && leaseExpired);
      if (!isClaimable) continue;
      it.status = "processing";
      it.workerId = workerId;
      it.processingStartedAt = new Date().toISOString();
      it.processingLeaseUntil = new Date(now + leaseMs).toISOString();
      it.updatedAt = it.processingStartedAt;
      claimed.push(it);
    }
    return claimed;
  }
}

function _statusHelper(_s: EmbeddingJobStatus) { /* keep-alive for type import */ }
export { _statusHelper };
