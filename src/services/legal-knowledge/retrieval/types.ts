/**
 * Sprint 4.1E – Hybrid Retrieval & Citation Engine.
 * Reine Retrieval-Typen: welche Wissenseinheiten sind relevant?
 * Keine Antwortgenerierung, keine Textproduktion, keine Rechtsberatung.
 */
import type { PersistedChunk } from "../embeddings/repositories/InMemoryRepositories";
import type { EmbeddingRecord } from "../embeddings/types";

export const RETRIEVAL_DOMAIN_VERSION = "1.0.0";

export type SearchType = "hybrid" | "keyword_only" | "vector_only";

export interface RetrievalFilters {
  sourceIds?: string[];
  law?: string;
  jurisdiction?: string;
  authority?: string;
  version?: string;
  reviewStatus?: string[];
  lifecycle?: string[];
  documentType?: string[];
  chunkTypes?: string[];
  paragraph?: string;
  article?: string;
  activeOnly?: boolean;
  validAtDate?: string | null;
}

export interface RetrievalQuery {
  rawQuery: string;
  normalizedQuery: string;
  keywords: string[];
  expansions: string[];
  language: "de";
  filters: RetrievalFilters;
  limit: number;
  offset: number;
  searchType: SearchType;
  debug: boolean;
}

export interface RetrievalCitation {
  /** Freundliche Fundstelle für die Redaktion. */
  display: string;
  law: string | null;
  chapter: string | null;
  section: string | null;
  paragraph: string | null;
  article: string | null;
  absatz: string | null;
  sentence: string | null;
  number: string | null;
  annex: string | null;
  path: string;
  version: string | null;
  sourceId: string | null;
  sourceLabel: string | null;
  chunkId: string;
  officialUrl: string | null;
}

export interface RetrievalScoreBreakdown {
  vector: number;
  keyword: number;
  metadata: number;
  reference: number;
  quality: number;
  parserConfidence: number;
  reviewBoost: number;
  final: number;
  weights: RetrievalWeights;
}

export interface RetrievalWeights {
  vector: number;
  keyword: number;
  metadata: number;
  reference: number;
  quality: number;
  parserConfidence: number;
  reviewBoost: number;
}

export const DEFAULT_WEIGHTS: RetrievalWeights = {
  vector: 0.45,
  keyword: 0.3,
  metadata: 0.08,
  reference: 0.05,
  quality: 0.05,
  parserConfidence: 0.04,
  reviewBoost: 0.03,
};

export interface RetrievalReason {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface RetrievalHit {
  chunkId: string;
  chunkStableHash: string;
  score: number;
  confidence: number;
  rankingPosition: number;
  scoreBreakdown: RetrievalScoreBreakdown;
  reasons: RetrievalReason[];
  citation: RetrievalCitation;
  highlights: string[];
  excerpt: string;
  content: string;
  metadata: Record<string, unknown>;
  references: unknown[];
  path: string;
  displayPath: string;
  chunkType: string;
}

export interface RetrievalValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  chunkId?: string;
}

export interface RetrievalValidationReport {
  errors: RetrievalValidationIssue[];
  warnings: RetrievalValidationIssue[];
  info: RetrievalValidationIssue[];
  ok: boolean;
}

export interface RetrievalStatisticsReport {
  totalCandidates: number;
  vectorCandidates: number;
  keywordCandidates: number;
  merged: number;
  filtered: number;
  returned: number;
  averageScore: number;
  averageConfidence: number;
  topScore: number;
  latencyMs: number;
  latencyBreakdown: {
    normalize: number;
    embed: number;
    vector: number;
    keyword: number;
    filter: number;
    merge: number;
    rank: number;
    cite: number;
    validate: number;
  };
}

export interface RetrievalResult {
  query: RetrievalQuery;
  hits: RetrievalHit[];
  statistics: RetrievalStatisticsReport;
  validation: RetrievalValidationReport;
  debug: RetrievalDebugPayload | null;
  createdAt: string;
  domainVersion: string;
}

export interface RetrievalDebugPayload {
  normalized: string;
  keywords: string[];
  expansions: string[];
  weights: RetrievalWeights;
  candidates: Array<{
    chunkId: string;
    fromVector: boolean;
    fromKeyword: boolean;
    vectorScore: number;
    keywordScore: number;
    metadataScore: number;
    finalScore: number;
  }>;
}

export interface EmbeddingSearchCandidate {
  chunkId: string;
  stableHash: string;
  similarity: number;
}

export interface KeywordSearchCandidate {
  chunkId: string;
  stableHash: string;
  score: number;
  matchedFields: string[];
  matchedTerms: string[];
}

export interface CandidateBundle {
  chunk: PersistedChunk;
  embedding: EmbeddingRecord | null;
  vectorScore: number;
  keywordScore: number;
  matchedFields: string[];
  matchedTerms: string[];
}
