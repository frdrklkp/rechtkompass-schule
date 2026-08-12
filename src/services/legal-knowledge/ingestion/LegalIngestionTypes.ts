// Sprint 4.1A – Ingestion Types.

export type LegalIngestionStatus =
  | "pending"
  | "loading"
  | "loaded"
  | "normalizing"
  | "validating"
  | "ready_for_review"
  | "completed"
  | "failed"
  | "cancelled";

export type LegalIngestionInputType =
  | "manual_text"
  | "official_url"
  | "existing_db"
  | "pdf"
  | "html"
  | "docx"
  | "markdown";

export const LEGAL_INGESTION_STATUS_LABELS: Record<LegalIngestionStatus, string> = {
  pending: "Ausstehend",
  loading: "Lade",
  loaded: "Geladen",
  normalizing: "Normalisiere",
  validating: "Prüfe",
  ready_for_review: "Bereit zur Prüfung",
  completed: "Abgeschlossen",
  failed: "Fehler",
  cancelled: "Abgebrochen",
};

export interface LegalIngestionRequest {
  inputType: LegalIngestionInputType;
  inputLocation?: string | null;
  rawInput?: string; // für manual_text
  intendedSourceId?: string | null; // beim Aktualisieren einer bestehenden Quelle
}

export interface LegalIngestionValidationIssue {
  code: string;
  severity: "error" | "warning" | "notice";
  field?: string;
  message: string;
}

export interface LegalIngestionValidationResult {
  issues: LegalIngestionValidationIssue[];
  readiness: "ready_for_review" | "needs_input" | "blocked";
  errorCount: number;
  warningCount: number;
  noticeCount: number;
}

export interface LegalIngestionMetadata {
  detectedTitle?: string;
  detectedShortName?: string;
  detectedType?: string;
  detectedJurisdiction?: string;
  detectedAuthority?: string;
  detectedPublishedAt?: string;
  detectedValidFrom?: string;
  detectedValidTo?: string;
  detectedVersionLabel?: string;
  detectedLanguage?: string;
  paragraphCount?: number;
  articleCount?: number;
  confidence?: Record<string, number>;
}

export interface LegalContentStats {
  charCount: number;
  wordCount: number;
  lineCount: number;
  paragraphCount: number;
  hasSectionMarkers: boolean;
  detectedFormat: "plain" | "structured" | "empty";
}

export interface LegalIngestionResult {
  jobId: string | null;
  status: LegalIngestionStatus;
  normalizedContent: string;
  originalContent: string;
  checksum: string;
  metadata: LegalIngestionMetadata;
  contentStats: LegalContentStats;
  validation: LegalIngestionValidationResult;
  duplicates: LegalDuplicateCandidate[];
}

export type LegalDuplicateMatchKind =
  | "exact_checksum"
  | "exact_url"
  | "probable_title"
  | "version_variant"
  | "none";

export interface LegalDuplicateCandidate {
  sourceId: string;
  title: string;
  shortName: string | null;
  matchKind: LegalDuplicateMatchKind;
  confidence: number; // 0..1
  reason: string;
}

export interface LegalIngestionJobRow {
  id: string;
  sourceId: string | null;
  inputType: LegalIngestionInputType;
  inputLocation: string | null;
  status: LegalIngestionStatus;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdBy: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  warnings: LegalIngestionValidationIssue[];
  extractedMetadata: LegalIngestionMetadata;
  contentStats: LegalContentStats | Record<string, unknown>;
  checksum: string | null;
  createdAt: string;
  updatedAt: string;
}
