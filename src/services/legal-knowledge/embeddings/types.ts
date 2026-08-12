/**
 * Sprint 4.1D — Legal Embedding Platform.
 * Domain-Typen (providerunabhängig).
 */
import type { ChunkNode } from "../chunks/types";

export const INPUT_FORMAT_VERSION = 1;

export type EmbeddingProviderId =
  | "lovable-gateway"
  | "mock"
  | "openai-native"
  | "google-native";

export type EmbeddingDistanceMetric = "cosine" | "inner_product" | "euclidean";

export type EmbeddingNormalizationStrategy = "none" | "l2";

export interface EmbeddingModelDefinition {
  modelId: string;
  providerId: EmbeddingProviderId;
  displayName: string;
  dimensions: number;
  maxInputTokens: number;
  batchSize: number;
  enabled: boolean;
  isDefault: boolean;
  pricing: {
    /** USD per 1M input tokens. May be null if unknown. */
    inputPer1M: number | null;
    currency: "USD" | "EUR";
    source: "estimated" | "provider_reported";
  };
  version: string;
  normalizationStrategy: EmbeddingNormalizationStrategy;
  distanceMetric: EmbeddingDistanceMetric;
  createdAt: string;
  deprecatedAt: string | null;
}

export interface EmbeddingUsage {
  promptTokens: number;
  totalTokens: number;
}

export interface EmbeddingCostInfo {
  estimatedUsd: number;
  reportedUsd: number | null;
  source: "estimated" | "provider_reported" | "calculated";
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
  modelVersion: string;
  provider: EmbeddingProviderId;
  dimensions: number;
  usage?: EmbeddingUsage;
  latencyMs: number;
  requestId?: string;
  createdAt: string;
}

export interface EmbeddingBatchItemFailure {
  index: number;
  code: string;
  message: string;
  retryable: boolean;
}

export interface EmbeddingBatchResult {
  results: Array<EmbeddingResult | null>;
  failedItems: EmbeddingBatchItemFailure[];
  usage?: EmbeddingUsage;
  provider: EmbeddingProviderId;
  model: string;
  modelVersion: string;
  latencyMs: number;
}

export type EmbeddingChunkStatus =
  | "not_embedded"
  | "queued"
  | "processing"
  | "embedded"
  | "outdated"
  | "failed"
  | "model_mismatch"
  | "dimension_mismatch"
  | "disabled";

export interface EmbeddingRecord {
  id: string;
  sourceId: string;
  chunkId: string;
  chunkStableHash: string;
  chunkPath: string;
  providerId: EmbeddingProviderId;
  modelId: string;
  modelVersion: string;
  dimensions: number;
  vector: number[];
  status: "embedded" | "outdated" | "failed" | "disabled";
  contentHash: string;
  inputFormatVersion: number;
  tokenCount: number | null;
  inputCharacterCount: number | null;
  usage: EmbeddingUsage | null;
  cost: EmbeddingCostInfo | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  embeddedAt: string;
  invalidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EmbeddingJobStatus =
  | "queued"
  | "preparing"
  | "running"
  | "partially_completed"
  | "completed"
  | "failed"
  | "cancelled";

export type EmbeddingJobTrigger =
  | "manual"
  | "source_import"
  | "source_rebuild"
  | "model_migration"
  | "retry"
  | "maintenance";

export type EmbeddingJobItemStatus =
  | "pending"
  | "processing"
  | "completed"
  | "skipped"
  | "retryable"
  | "failed";

export interface EmbeddingJob {
  id: string;
  sourceId: string;
  providerId: EmbeddingProviderId;
  modelId: string;
  modelVersion: string;
  inputFormatVersion: number;
  status: EmbeddingJobStatus;
  requestedBy: string | null;
  triggerType: EmbeddingJobTrigger;
  totals: {
    total: number;
    pending: number;
    processed: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  tokens: { estimated: number; actual: number };
  cost: { estimated: number; actual: number; source: "estimated" | "provider_reported" | "calculated" };
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  errorSummary: Record<string, number>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EmbeddingJobItem {
  id: string;
  jobId: string;
  chunkId: string;
  chunkStableHash: string;
  status: EmbeddingJobItemStatus;
  attemptCount: number;
  providerRequestId: string | null;
  tokenCount: number | null;
  latencyMs: number | null;
  workerId: string | null;
  processingStartedAt: string | null;
  processingLeaseUntil: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmbeddingJobPreview {
  sourceId: string;
  modelId: string;
  modelVersion: string;
  providerId: EmbeddingProviderId;
  dimensions: number;
  inputFormatVersion: number;
  totals: {
    chunks: number;
    upToDate: number;
    toEmbed: number;
    outdated: number;
    failed: number;
  };
  estimatedTokens: number;
  estimatedCostUsd: number;
}

export interface EmbeddingSourceOverview {
  sourceId: string;
  sourceLabel: string;
  totals: {
    chunks: number;
    embedded: number;
    outdated: number;
    failed: number;
    missing: number;
  };
  coverageRatio: number;
  activeModel: { modelId: string; modelVersion: string; providerId: EmbeddingProviderId } | null;
  lastSuccessfulRunAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  ampel: "green" | "yellow" | "red" | "grey";
}

export interface EmbeddingValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  chunkId?: string;
  embeddingId?: string;
}

export interface EmbeddingValidationReport {
  errors: EmbeddingValidationIssue[];
  warnings: EmbeddingValidationIssue[];
  info: EmbeddingValidationIssue[];
  ok: boolean;
}

export interface EmbeddingInputPayload {
  text: string;
  characterCount: number;
  tokenEstimate: number;
  contentHash: string;
  inputFormatVersion: number;
}

export type ChunkForEmbedding = Pick<
  ChunkNode,
  | "chunkId"
  | "stableHash"
  | "sourceId"
  | "path"
  | "displayPath"
  | "title"
  | "displayTitle"
  | "content"
  | "normalizedContent"
  | "metadata"
  | "token"
> & { primarySection?: string };

export const EMBEDDING_DOMAIN_VERSION = "1.0.0";
