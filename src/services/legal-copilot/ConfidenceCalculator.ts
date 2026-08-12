/** Kombinierte Konfidenz aus Retrieval, LLM-Selbsteinschätzung, Coverage, Review. */
import type { RetrievalResult } from "../legal-knowledge/retrieval/types";
import type { CopilotConfidence, GroundedChunk } from "./types";

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

const REVIEW_WEIGHT: Record<string, number> = {
  verified: 1,
  reviewed: 0.9,
  needs_review: 0.5,
  unverified: 0.3,
  rejected: 0,
  archived: 0.1,
};

export const ConfidenceCalculator = {
  compute(input: {
    retrieval: RetrievalResult;
    grounded: GroundedChunk[];
    llmSelfConfidence?: number | null;
    answered: boolean;
  }): CopilotConfidence {
    const hits = input.retrieval.hits;
    const topScore = hits[0]?.score ?? 0;
    const avgTop3 = hits.slice(0, 3).reduce((s, h) => s + h.score, 0) / Math.max(1, Math.min(3, hits.length));
    const retrievalScore = clamp01(topScore * 0.6 + avgTop3 * 0.4);

    const sourceCoverage = clamp01(input.grounded.length / 5);

    const reviewAvg = input.grounded.length === 0
      ? 0.2
      : input.grounded.reduce((s, g) => {
          const rs = (g.hit.metadata?.reviewStatus ?? "unverified").toString();
          return s + (REVIEW_WEIGHT[rs] ?? 0.3);
        }, 0) / input.grounded.length;

    const llm = clamp01(input.llmSelfConfidence ?? 0.7);

    const overall = clamp01(
      retrievalScore * 0.45 +
      llm * 0.2 +
      sourceCoverage * 0.15 +
      reviewAvg * 0.2,
    ) * (input.answered ? 1 : 0.4);

    const level: CopilotConfidence["level"] =
      overall >= 0.7 ? "high" : overall >= 0.45 ? "medium" : "low";

    return {
      retrieval: retrievalScore,
      llm,
      sourceCoverage,
      reviewStatus: reviewAvg,
      overall,
      level,
    };
  },
};
