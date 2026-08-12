import type { CopilotStatistics, CopilotTokenUsage } from "./types";

export const CopilotStatisticsBuilder = {
  build(input: {
    retrievalMs: number;
    llmMs: number;
    totalMs: number;
    candidates: number;
    hits: number;
    usedHits: number;
    providerId: string;
    model: string;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
  }): CopilotStatistics {
    let tokens: CopilotTokenUsage | undefined;
    if (input.usage) {
      const prompt = input.usage.promptTokens ?? 0;
      const completion = input.usage.completionTokens ?? 0;
      const total = input.usage.totalTokens ?? prompt + completion;
      // Grobe Kosten-Schätzung (Gemini Flash Range) – rein informativ, keine Verrechnung.
      const cost = (prompt * 0.075 + completion * 0.30) / 1_000_000;
      tokens = { promptTokens: prompt, completionTokens: completion, totalTokens: total, estimatedCostUsd: cost };
    }
    return {
      retrievalMs: input.retrievalMs,
      llmMs: input.llmMs,
      totalMs: input.totalMs,
      candidates: input.candidates,
      hits: input.hits,
      usedHits: input.usedHits,
      providerId: input.providerId,
      model: input.model,
      tokens,
    };
  },
};
