/**
 * Kostenprognose und Ist-Kostenerfassung.
 * Kennzeichnet immer die Quelle (estimated, provider_reported, calculated).
 */
import type { EmbeddingCostInfo, EmbeddingModelDefinition } from "./types";

export const EmbeddingCostEstimator = {
  estimate(model: EmbeddingModelDefinition, totalTokens: number): number {
    const per1M = model.pricing.inputPer1M ?? 0;
    return (totalTokens / 1_000_000) * per1M;
  },
  fromReported(reportedUsd: number): EmbeddingCostInfo {
    return { estimatedUsd: reportedUsd, reportedUsd, source: "provider_reported" };
  },
  fromCalculated(model: EmbeddingModelDefinition, actualTokens: number): EmbeddingCostInfo {
    const usd = this.estimate(model, actualTokens);
    return { estimatedUsd: usd, reportedUsd: null, source: "calculated" };
  },
};
