/**
 * Sprint 4.1B — Document Structure domain types.
 * Purely structural. No embeddings, no RAG, no AI.
 */

export const SECTION_TYPES = [
  "document",
  "book",
  "part",
  "title",
  "chapter",
  "subchapter",
  "section",
  "subsection",
  "paragraph",
  "article",
  "absatz",
  "sentence",
  "number",
  "letter",
  "annex",
  "table",
  "image",
  "definition",
  "example",
  "footnote",
  "reference",
  "unknown",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

/** Rank drives hierarchy push/pop in the state machine. Lower rank = higher in the tree. */
export const SECTION_RANK: Record<SectionType, number> = {
  document: 0,
  book: 1,
  part: 2,
  title: 3,
  chapter: 4,
  subchapter: 5,
  section: 6,
  subsection: 7,
  paragraph: 10,
  article: 10,
  annex: 10,
  absatz: 20,
  sentence: 30,
  number: 40,
  letter: 50,
  definition: 60,
  example: 60,
  table: 60,
  image: 60,
  footnote: 70,
  reference: 80,
  unknown: 99,
};

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  document: "Dokument",
  book: "Buch",
  part: "Teil",
  title: "Titel",
  chapter: "Kapitel",
  subchapter: "Unterkapitel",
  section: "Abschnitt",
  subsection: "Unterabschnitt",
  paragraph: "Paragraph",
  article: "Artikel",
  absatz: "Absatz",
  sentence: "Satz",
  number: "Nummer",
  letter: "Buchstabe",
  annex: "Anlage",
  table: "Tabelle",
  image: "Abbildung",
  definition: "Definition",
  example: "Beispiel",
  footnote: "Fußnote",
  reference: "Verweis",
  unknown: "Unbekannt",
};

export interface SectionReference {
  raw: string;
  refType: "paragraph" | "article" | "annex" | "absatz" | "satz" | "nummer" | "external";
  refValue: Record<string, string>;
  startOffset?: number;
  endOffset?: number;
  confidence: number;
}

export interface SectionMetadata {
  sourceLabel?: string;
  authority?: string;
  jurisdiction?: string;
  version?: string;
  language?: string;
  chapter?: string;
  section?: string;
  paragraph?: string;
  article?: string;
  absatz?: string;
  sentence?: string;
  number?: string;
  letter?: string;
  annex?: string;
  parserMethod?: string;
  parserConfidence?: number;
  [key: string]: unknown;
}

export interface SectionNode {
  /** Stable local id (deterministic hash-derived) used before persistence. */
  localId: string;
  /** Persisted DB id (uuid) once written. */
  id?: string;
  parentLocalId: string | null;
  parentId?: string | null;
  order: number;
  depth: number;
  type: SectionType;
  number: string | null;
  label: string | null;
  title: string | null;
  displayTitle: string;
  originalText: string;
  normalizedText: string;
  summary: string | null;
  path: string;
  displayPath: string;
  breadcrumb: string[];
  startOffset: number;
  endOffset: number;
  stableHash: string;
  parserMethod: string;
  confidence: number;
  metadata: SectionMetadata;
  references: SectionReference[];
  children: SectionNode[];
}

export interface OutlineEntry {
  localId: string;
  type: SectionType;
  label: string;
  displayTitle: string;
  path: string;
  depth: number;
  children: OutlineEntry[];
}

export interface DocumentStatistics {
  chapters: number;
  paragraphs: number;
  articles: number;
  absaetze: number;
  sentences: number;
  numbers: number;
  definitions: number;
  tables: number;
  references: number;
  annexes: number;
  characters: number;
  tokensEstimated: number;
  parserConfidence: number;
  averageDepth: number;
  maxDepth: number;
  sectionsTotal: number;
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  localId?: string;
  path?: string;
}

export interface ValidationReport {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
  ok: boolean;
}

export interface DocumentTree {
  sourceId: string | null;
  sourceLabel: string;
  root: SectionNode;
  flat: SectionNode[];
  outline: OutlineEntry[];
  statistics: DocumentStatistics;
  validation: ValidationReport;
  parserMethod: string;
  parserVersion: string;
  createdAt: string;
}
