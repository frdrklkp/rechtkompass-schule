/**
 * Providervertrag. Provider-spezifische Antworten dürfen NICHT nach außen dringen.
 */
import type {
  EmbeddingBatchResult,
  EmbeddingModelDefinition,
  EmbeddingProviderId,
  EmbeddingResult,
} from "../types";

export interface EmbeddingProviderHealth {
  ok: boolean;
  providerId: EmbeddingProviderId;
  latencyMs: number;
  detail?: string;
  checkedAt: string;
}

export interface EmbeddingProvider {
  readonly id: EmbeddingProviderId;
  supportsModel(modelId: string): boolean;
  getModelCapabilities(modelId: string): EmbeddingModelDefinition;
  embedOne(input: string, opts: { modelId: string; signal?: AbortSignal }): Promise<EmbeddingResult>;
  embedMany(inputs: string[], opts: { modelId: string; signal?: AbortSignal }): Promise<EmbeddingBatchResult>;
  healthCheck(signal?: AbortSignal): Promise<EmbeddingProviderHealth>;
}
