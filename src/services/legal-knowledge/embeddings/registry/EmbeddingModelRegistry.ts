/**
 * Modellregistry für Embeddings. Zentraler Punkt der Wahrheit.
 * Keine Modell-IDs dürfen außerhalb der Registry hart codiert sein.
 */
import type { EmbeddingModelDefinition, EmbeddingProviderId } from "../types";
import { EmbeddingModelUnavailableError } from "../runtime/errors";

const NOW = "2026-07-29T00:00:00.000Z";

const MODELS: EmbeddingModelDefinition[] = [
  {
    modelId: "openai/text-embedding-3-small",
    providerId: "lovable-gateway",
    displayName: "OpenAI text-embedding-3-small (1536)",
    dimensions: 1536,
    maxInputTokens: 8192,
    batchSize: 32,
    enabled: true,
    isDefault: true,
    pricing: { inputPer1M: 0.02, currency: "USD", source: "estimated" },
    version: "2024-01",
    normalizationStrategy: "none",
    distanceMetric: "cosine",
    createdAt: NOW,
    deprecatedAt: null,
  },
  {
    modelId: "mock/embedding-1536",
    providerId: "mock",
    displayName: "Mock-Embedding (deterministisch, 1536)",
    dimensions: 1536,
    maxInputTokens: 8192,
    batchSize: 64,
    enabled: true,
    isDefault: false,
    pricing: { inputPer1M: 0, currency: "USD", source: "estimated" },
    version: "1.0",
    normalizationStrategy: "l2",
    distanceMetric: "cosine",
    createdAt: NOW,
    deprecatedAt: null,
  },
];

export const EmbeddingModelRegistry = {
  list(): EmbeddingModelDefinition[] {
    return MODELS.filter((m) => !m.deprecatedAt);
  },
  listAll(): EmbeddingModelDefinition[] { return [...MODELS]; },
  getDefault(): EmbeddingModelDefinition {
    const def = MODELS.find((m) => m.enabled && m.isDefault) ?? MODELS.find((m) => m.enabled);
    if (!def) throw new EmbeddingModelUnavailableError("Kein aktives Standardmodell konfiguriert");
    return def;
  },
  get(modelId: string): EmbeddingModelDefinition {
    const m = MODELS.find((x) => x.modelId === modelId);
    if (!m) throw new EmbeddingModelUnavailableError(`Unbekanntes Modell: ${modelId}`);
    if (!m.enabled) throw new EmbeddingModelUnavailableError(`Modell deaktiviert: ${modelId}`);
    return m;
  },
  byProvider(providerId: EmbeddingProviderId): EmbeddingModelDefinition[] {
    return MODELS.filter((m) => m.providerId === providerId && !m.deprecatedAt);
  },
};
