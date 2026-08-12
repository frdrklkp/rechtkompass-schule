import { DEFAULT_WEIGHTS, type RetrievalWeights } from "./types";

export interface RetrievalConfig {
  defaultLimit: number;
  maxLimit: number;
  vectorTopK: number;
  keywordTopK: number;
  minVectorSimilarity: number;
  minKeywordScore: number;
  minFinalScore: number;
  highlightsPerHit: number;
  excerptChars: number;
  weights: RetrievalWeights;
  reviewStatusBoost: Record<string, number>;
  lifecycleBoost: Record<string, number>;
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  defaultLimit: 10,
  maxLimit: 50,
  vectorTopK: 30,
  keywordTopK: 30,
  minVectorSimilarity: 0.15,
  minKeywordScore: 0.05,
  minFinalScore: 0.05,
  highlightsPerHit: 5,
  excerptChars: 320,
  weights: DEFAULT_WEIGHTS,
  reviewStatusBoost: {
    authority_verified: 1.0,
    editorial_reviewed: 0.75,
    technical_validated: 0.5,
    unverified: 0.15,
  },
  lifecycleBoost: {
    active: 1.0,
    verified: 0.9,
    imported: 0.5,
    needs_review: 0.4,
    outdated: 0.2,
    archived: 0.05,
    rejected: 0.0,
    draft: 0.4,
  },
};
