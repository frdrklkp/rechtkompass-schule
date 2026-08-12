/**
 * Nachvollziehbares Ranking. Kombiniert Signale mit dokumentierten Gewichten.
 * Keine Blackbox – jedes Signal wird protokolliert (Reasons).
 */
import { DEFAULT_RETRIEVAL_CONFIG, type RetrievalConfig } from "./config";
import type {
  CandidateBundle,
  RetrievalReason,
  RetrievalScoreBreakdown,
  RetrievalWeights,
} from "./types";

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

function metadataScore(bundle: CandidateBundle, query: { keywords: string[]; filters: unknown }): number {
  const md = bundle.chunk.metadata ?? {};
  let signals = 0;
  let hit = 0;
  const kws = query.keywords.map((k) => k.toLowerCase());
  const fields = [md.law, md.paragraph, md.article, md.section, md.chapter, md.sourceLabel];
  for (const f of fields) {
    if (!f) continue;
    signals++;
    const t = f.toString().toLowerCase();
    if (kws.some((k) => t.includes(k))) hit++;
  }
  return signals === 0 ? 0 : clamp01(hit / signals);
}

function referenceScore(bundle: CandidateBundle): number {
  const refCount = Array.isArray((bundle.chunk as unknown as { references?: unknown[] }).references)
    ? ((bundle.chunk as unknown as { references?: unknown[] }).references as unknown[]).length
    : bundle.chunk.token?.referenceCount ?? 0;
  return clamp01(refCount / 5);
}

function qualityScore(bundle: CandidateBundle): number {
  const tokens = bundle.chunk.token?.tokenEstimate ?? 0;
  // Optimum ~200-500 Tokens
  if (tokens <= 0) return 0;
  if (tokens < 40) return 0.3;
  if (tokens > 1200) return 0.4;
  if (tokens >= 150 && tokens <= 600) return 1;
  return 0.7;
}

function parserConfidence(bundle: CandidateBundle): number {
  const md = bundle.chunk.metadata ?? {};
  const c = Number(md.parserConfidence ?? 0);
  if (!Number.isFinite(c) || c <= 0) return 0.5;
  return clamp01(c);
}

function reviewBoost(bundle: CandidateBundle, cfg: RetrievalConfig): number {
  const md = bundle.chunk.metadata ?? {};
  const rev = cfg.reviewStatusBoost[(md.reviewStatus ?? "unverified").toString()] ?? 0.2;
  const life = cfg.lifecycleBoost[(md.lifecycle ?? "active").toString()] ?? 0.5;
  return clamp01((rev + life) / 2);
}

export interface RankResult {
  bundle: CandidateBundle;
  score: number;
  breakdown: RetrievalScoreBreakdown;
  reasons: RetrievalReason[];
}

export const ChunkRanker = {
  rank(
    bundles: CandidateBundle[],
    query: { keywords: string[]; filters: unknown },
    config: RetrievalConfig = DEFAULT_RETRIEVAL_CONFIG,
  ): RankResult[] {
    const w: RetrievalWeights = config.weights;
    const results: RankResult[] = [];

    for (const bundle of bundles) {
      const vector = clamp01(bundle.vectorScore);
      const keyword = clamp01(bundle.keywordScore);
      const metadata = metadataScore(bundle, query);
      const reference = referenceScore(bundle);
      const quality = qualityScore(bundle);
      const parser = parserConfidence(bundle);
      const review = reviewBoost(bundle, config);

      const final = clamp01(
        vector * w.vector +
        keyword * w.keyword +
        metadata * w.metadata +
        reference * w.reference +
        quality * w.quality +
        parser * w.parserConfidence +
        review * w.reviewBoost,
      );

      const breakdown: RetrievalScoreBreakdown = {
        vector, keyword, metadata, reference, quality,
        parserConfidence: parser, reviewBoost: review, final,
        weights: w,
      };

      const reasons: RetrievalReason[] = [];
      if (vector > 0) reasons.push({ code: "semantic_match", message: `Semantische Nähe: ${(vector * 100).toFixed(0)} %` });
      if (keyword > 0) reasons.push({
        code: "keyword_match",
        message: `Trefferworte: ${bundle.matchedTerms.slice(0, 5).join(", ")}`,
        detail: { fields: bundle.matchedFields },
      });
      if (metadata > 0) reasons.push({ code: "metadata_match", message: "Fundstelle passt zu Suchbegriffen" });
      if (reference > 0.3) reasons.push({ code: "reference_density", message: "Enthält viele Rechtsverweise" });
      if (review >= 0.8) reasons.push({ code: "trusted_source", message: "Quelle geprüft und aktiv" });
      if (review < 0.2) reasons.push({ code: "unreliable_source", message: "Quelle nicht ausreichend geprüft" });

      results.push({ bundle, score: final, breakdown, reasons });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  },
};
