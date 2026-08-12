import type { RetrievalHit, RetrievalStatisticsReport } from "./types";

export interface StatisticsInput {
  totalCandidates: number;
  vectorCandidates: number;
  keywordCandidates: number;
  merged: number;
  filtered: number;
  hits: RetrievalHit[];
  latencyBreakdown: RetrievalStatisticsReport["latencyBreakdown"];
  latencyMs: number;
}

export const RetrievalStatistics = {
  build(input: StatisticsInput): RetrievalStatisticsReport {
    const scores = input.hits.map((h) => h.score);
    const confs = input.hits.map((h) => h.confidence);
    const avg = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
    return {
      totalCandidates: input.totalCandidates,
      vectorCandidates: input.vectorCandidates,
      keywordCandidates: input.keywordCandidates,
      merged: input.merged,
      filtered: input.filtered,
      returned: input.hits.length,
      averageScore: avg(scores),
      averageConfidence: avg(confs),
      topScore: scores.length ? Math.max(...scores) : 0,
      latencyMs: input.latencyMs,
      latencyBreakdown: input.latencyBreakdown,
    };
  },
};
