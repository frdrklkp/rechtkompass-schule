// Zentrale Query-Keys für Legal Knowledge.

import type { LegalSourceListFilter } from "@/services/legal-knowledge";

export const legalKnowledgeQueryKeys = {
  all: ["legal-knowledge"] as const,
  sources: () => [...legalKnowledgeQueryKeys.all, "sources"] as const,
  sourcesList: (filter?: LegalSourceListFilter) =>
    [...legalKnowledgeQueryKeys.sources(), "list", filter ?? {}] as const,
  source: (id: string) => [...legalKnowledgeQueryKeys.sources(), "detail", id] as const,
  sourceVersions: (id: string) =>
    [...legalKnowledgeQueryKeys.source(id), "versions"] as const,
  sourceReviewEvents: (id: string) =>
    [...legalKnowledgeQueryKeys.source(id), "events"] as const,
  ingestionJobs: () => [...legalKnowledgeQueryKeys.all, "ingestion-jobs"] as const,
  ingestionJobsForSource: (id: string) =>
    [...legalKnowledgeQueryKeys.ingestionJobs(), id] as const,
  embeddings: () => [...legalKnowledgeQueryKeys.all, "embeddings"] as const,
  embeddingModels: () => [...legalKnowledgeQueryKeys.embeddings(), "models"] as const,
  embeddingOverview: (sourceId: string) =>
    [...legalKnowledgeQueryKeys.embeddings(), "overview", sourceId] as const,
  embeddingJobs: (sourceId?: string) =>
    [...legalKnowledgeQueryKeys.embeddings(), "jobs", sourceId ?? "all"] as const,
  embeddingJob: (jobId: string) =>
    [...legalKnowledgeQueryKeys.embeddings(), "job", jobId] as const,
  embeddingValidation: (sourceId: string) =>
    [...legalKnowledgeQueryKeys.embeddings(), "validation", sourceId] as const,
};
