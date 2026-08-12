/**
 * Sprint 4.1C — Chunk Engine domain types.
 * Deterministic, structural chunking over the SectionNode tree.
 * No embeddings, no pgvector, no retrieval, no AI.
 */
import type {
  SectionMetadata,
  SectionNode,
  SectionReference,
} from "../document/types";

export const CHUNK_TYPES = [
  "paragraph",
  "paragraph_with_absaetze",
  "paragraph_with_definitions",
  "article",
  "annex",
  "definition",
  "table",
  "merged_paragraphs",
  "split_paragraph_absatz",
  "split_paragraph_sentence",
  "meta",
] as const;

export type ChunkType = (typeof CHUNK_TYPES)[number];

export const CHUNK_TYPE_LABELS: Record<ChunkType, string> = {
  paragraph: "Paragraph",
  paragraph_with_absaetze: "Paragraph mit Absätzen",
  paragraph_with_definitions: "Paragraph mit Definitionen",
  article: "Artikel",
  annex: "Anlage",
  definition: "Definition",
  table: "Tabelle",
  merged_paragraphs: "Zusammengefasste Paragraphen",
  split_paragraph_absatz: "Absatz (Teilstück)",
  split_paragraph_sentence: "Satz (Teilstück)",
  meta: "Kapitelübersicht",
};

export const CHUNK_STRATEGY_LABELS: Record<ChunkType, string> = {
  paragraph: "Einzelparagraph",
  paragraph_with_absaetze: "Paragraph mit Absätzen",
  paragraph_with_definitions: "Paragraph mit Definitionen",
  article: "Artikel",
  annex: "Anlage",
  definition: "Definition",
  table: "Tabelle",
  merged_paragraphs: "Zusammenführung kleiner Einheiten",
  split_paragraph_absatz: "Aufteilung nach Absätzen",
  split_paragraph_sentence: "Aufteilung nach Sätzen",
  meta: "Meta-/Übersichtsknoten",
};

export interface ChunkMetadata {
  sourceLabel?: string;
  authority?: string;
  jurisdiction?: string;
  version?: string;
  language?: string;
  law?: string;
  chapter?: string;
  section?: string;
  paragraph?: string;
  article?: string;
  absatz?: string;
  sentence?: string;
  number?: string;
  letter?: string;
  annex?: string;
  reviewStatus?: string;
  lifecycle?: string;
  parserConfidence?: number;
  chunkStrategy?: ChunkType;
  [key: string]: unknown;
}

export interface ChunkTokenInfo {
  characterCount: number;
  wordCount: number;
  tokenEstimate: number;
  sentenceCount: number;
  averageSentenceLength: number;
  referenceCount: number;
}

export interface ChunkNode {
  /** Local id (deterministic, derived from stableHash). */
  localId: string;
  chunkId: string;
  documentId: string | null;
  sourceId: string | null;
  sectionIds: string[];
  primarySection: string;
  path: string;
  displayPath: string;
  breadcrumb: string[];
  chunkType: ChunkType;
  strategyLabel: string;
  title: string;
  displayTitle: string;
  content: string;
  normalizedContent: string;
  summary: string | null;
  metadata: ChunkMetadata;
  stableHash: string;
  token: ChunkTokenInfo;
  order: number;
  parentChunk: string | null;
  children: string[];
  references: SectionReference[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  chunkId?: string;
  path?: string;
}

export interface ChunkValidationReport {
  errors: ChunkValidationIssue[];
  warnings: ChunkValidationIssue[];
  info: ChunkValidationIssue[];
  ok: boolean;
}

export interface ChunkStatisticsReport {
  chunkCount: number;
  avgTokens: number;
  maxTokens: number;
  minTokens: number;
  totalTokens: number;
  totalCharacters: number;
  largestChunkId: string | null;
  smallestChunkId: string | null;
  chunkTypes: Record<ChunkType, number>;
  coverageRatio: number;
  referenceDensity: number;
  sectionsCovered: number;
  sectionsTotal: number;
}

export interface ChunkCollection {
  sourceId: string | null;
  sourceLabel: string;
  chunks: ChunkNode[];
  statistics: ChunkStatisticsReport;
  validation: ChunkValidationReport;
  engineVersion: string;
  createdAt: string;
}

export interface ChunkEngineOptions {
  /** Soft threshold in estimated tokens above which we prefer to split at legal boundaries. */
  splitThresholdTokens?: number;
  /** Soft threshold in estimated tokens below which small sibling paragraphs may be merged. */
  mergeThresholdTokens?: number;
  /** Enable merging of small siblings. Default: true. */
  enableMerging?: boolean;
  /** Enable splitting of oversized paragraphs. Default: true. */
  enableSplitting?: boolean;
  /** Include meta chunks for structural nodes (chapter, section). Default: true. */
  includeMetaChunks?: boolean;
  /** Base metadata inherited by every chunk. */
  baseMetadata?: Partial<ChunkMetadata>;
}

export const DEFAULT_CHUNK_ENGINE_OPTIONS: Required<Omit<ChunkEngineOptions, "baseMetadata">> = {
  splitThresholdTokens: 800,
  mergeThresholdTokens: 40,
  enableMerging: true,
  enableSplitting: true,
  includeMetaChunks: true,
};

/** Re-export so consumers can import from a single module. */
export type { SectionMetadata, SectionNode, SectionReference };

export const CHUNK_ENGINE_VERSION = "1.0.0";
