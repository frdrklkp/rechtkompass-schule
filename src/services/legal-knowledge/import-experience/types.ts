/**
 * Sprint 4.5H – Import Experience & Quality Assurance: Domänentypen.
 *
 * Diese Schicht liegt ausschließlich NACH dem bestehenden Importframework
 * (Parser → Normalizer → Validator → Delta → Repository) und liest dessen
 * Ergebnisse nur aus. Sie verändert weder Framework, Connector noch Parser.
 */
import type {
  LegalImportDelta,
  LegalImportParser,
  LegalImportValidationResult,
  NormalizedLegalDocument,
} from "../import";

/** Fachliche Kategorie eines Knotens für Übersicht und Delta Explorer. */
export type ContentCategory = "document" | "paragraph" | "subsection" | "attachment";

export const CONTENT_CATEGORY_LABEL: Record<ContentCategory, string> = {
  document: "Dokument",
  paragraph: "Paragraph",
  subsection: "Absatz",
  attachment: "Anlage",
};

export interface ImportGeneralInfo {
  sourceTitle: string;
  sourceKey: string;
  parserLabel: string;
  parserId: string;
  versionLabel: string;
  importedAt: string;
  durationMs: number;
  status: "ready" | "blocked" | "no_change";
  statusLabel: string;
}

export interface DocumentOverview {
  documents: number;
  paragraphs: number;
  subsections: number;
  attachments: number;
  internalReferences: number;
  externalReferences: number;
}

export interface CategoryDelta {
  added: number;
  updated: number;
  removed: number;
}

export interface DeltaOverview {
  documents: CategoryDelta;
  paragraphs: CategoryDelta;
  attachments: CategoryDelta;
  subsections: CategoryDelta;
  total: CategoryDelta & { unchanged: number };
}

export interface ImportPreviewModel {
  general: ImportGeneralInfo;
  overview: DocumentOverview;
  delta: DeltaOverview;
  hasChanges: boolean;
}

export type DeltaGroupKind = "added" | "updated" | "removed";

export interface DeltaEntry {
  localId: string;
  title: string;
  identifier: string;
  version: string;
  category: ContentCategory;
  reason: string;
}

export interface DeltaGroup {
  kind: DeltaGroupKind;
  label: string;
  total: number;
  sections: { category: ContentCategory; label: string; entries: DeltaEntry[] }[];
}

export type CompareStatus = "added" | "updated" | "removed" | "unchanged";

export interface CompareSection {
  localId: string;
  title: string;
  status: CompareStatus;
  previousText: string | null;
  nextText: string | null;
}

export interface VersionComparison {
  sourceKey: string;
  installedVersion: string | null;
  incomingVersion: string;
  changedCount: number;
  sections: CompareSection[];
}

export interface ImportReport {
  id: string;
  generatedAt: string;
  mode: "wizard" | "connector";
  sourceKey: string;
  sourceTitle: string;
  versionLabel: string;
  importedAt: string;
  durationMs: number;
  parserId: string;
  parserLabel: string;
  documents: number;
  paragraphs: number;
  attachments: number;
  delta: { added: number; updated: number; removed: number; unchanged: number };
  versionConflicts: number;
  errors: string[];
  contentHash: string;
}

export interface ImportReportInput {
  document: NormalizedLegalDocument;
  delta: LegalImportDelta;
  validation: LegalImportValidationResult;
  parser: Pick<LegalImportParser, "id" | "label">;
  durationMs: number;
  mode: "wizard" | "connector";
  importedAt?: string;
  errors?: string[];
  id?: string;
}
