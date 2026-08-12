// Query-Hooks für Legal Embeddings.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { legalKnowledgeQueryKeys } from "./queryKeys";
import { EmbeddingModelRegistry } from "@/services/legal-knowledge/embeddings";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || (typeof json === "object" && json && "error" in json && (json as { error?: string }).error)) {
    throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return json as T;
}

export function useLegalEmbeddingModels() {
  return useQuery({
    queryKey: legalKnowledgeQueryKeys.embeddingModels(),
    queryFn: async () => EmbeddingModelRegistry.list(),
    staleTime: Infinity,
  });
}

export function useLegalEmbeddingOverview(sourceId: string | undefined) {
  return useQuery({
    queryKey: sourceId ? legalKnowledgeQueryKeys.embeddingOverview(sourceId) : ["legal-embeddings", "overview", "none"],
    queryFn: () => fetchJson<{
      overview: unknown; jobs: unknown[];
      model?: { modelId: string; version: string; providerId: string; dimensions: number };
      setup?: { schemaMigrated: boolean };
      error?: string;
    }>(`/api/legal-embeddings-status?sourceId=${encodeURIComponent(sourceId!)}`),
    enabled: !!sourceId,
  });
}

export function usePreviewLegalEmbeddingJob() {
  return useMutation({
    mutationFn: (args: { sourceId: string; modelId?: string }) =>
      fetchJson<{ preview: unknown }>("/api/legal-embeddings-preview", {
        method: "POST", body: JSON.stringify(args),
      }),
  });
}

export function useStartLegalEmbeddingJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { sourceId: string; modelId?: string; batchSize?: number }) => {
      // Startet und läuft in mehreren Runs, bis done=true. UI zeigt Fortschritt.
      let jobId: string | undefined;
      let done = false;
      let final: unknown = null;
      const cumulative = { processed: 0, successful: 0, failed: 0, skipped: 0 };
      while (!done) {
        const res = await fetchJson<{
          jobId: string; done: boolean; processed: number; successful: number;
          failed: number; skipped: number; job: unknown;
        }>("/api/legal-embeddings-run", {
          method: "POST",
          body: JSON.stringify({ jobId, sourceId: args.sourceId, modelId: args.modelId, batchSize: args.batchSize ?? 16 }),
        });
        jobId = res.jobId;
        done = res.done;
        cumulative.processed += res.processed;
        cumulative.successful += res.successful;
        cumulative.failed += res.failed;
        cumulative.skipped += res.skipped;
        final = res.job;
      }
      return { jobId, job: final, cumulative };
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.embeddingOverview(vars.sourceId) });
    },
  });
}

export function useCancelLegalEmbeddingJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { jobId: string; sourceId?: string }) =>
      fetchJson<{ job: unknown }>("/api/legal-embeddings-cancel", {
        method: "POST", body: JSON.stringify({ jobId: args.jobId }),
      }),
    onSuccess: (_r, vars) => {
      if (vars.sourceId) qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.embeddingOverview(vars.sourceId) });
    },
  });
}

export function useRetryLegalEmbeddingItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { jobId: string; sourceId?: string }) =>
      fetchJson<{ retriedItems: number }>("/api/legal-embeddings-retry", {
        method: "POST", body: JSON.stringify({ jobId: args.jobId }),
      }),
    onSuccess: (_r, vars) => {
      if (vars.sourceId) qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.embeddingOverview(vars.sourceId) });
    },
  });
}

export function useValidateLegalEmbeddings() {
  return useMutation({
    mutationFn: (args: { sourceId: string; modelId?: string }) =>
      fetchJson<{ report: unknown }>("/api/legal-embeddings-validate", {
        method: "POST", body: JSON.stringify(args),
      }),
  });
}

export function useSyncLegalChunks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { sourceId: string; chunks: unknown[] }) =>
      fetchJson<{ synced: number; deactivated: number }>("/api/legal-chunks-sync", {
        method: "POST", body: JSON.stringify(args),
      }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.embeddingOverview(vars.sourceId) });
    },
  });
}
