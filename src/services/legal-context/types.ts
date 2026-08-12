/**
 * Sprint 4.6G – Legal Context Integration: Typen und Konstanten.
 *
 * Architekturprinzip: Rechtsgrundlagen stammen ausschließlich aus kuratierten
 * Verknüpfungen (practice_cases -> case_legal_links -> legal_sections ->
 * legal_sources). Kein Sprachmodell wählt oder erfindet Rechtsnormen.
 */

/** Kontext-Schlüssel, unter dem das Ergebnis im Navigator-Kontext liegt. */
export const LEGAL_CONTEXT_KEY = "legalContext";

/** Schema-Version des persistierten Kontext-Eintrags. */
export const LEGAL_CONTEXT_SCHEMA_VERSION = 1;

/** Relevanzstufe der redaktionellen Verknüpfung (case_legal_links.relevance). */
export type LegalLinkRelevance = "high" | "medium" | "low";

/** Aktualitätsstatus einer aufgelösten Rechtsgrundlage. */
export type LegalFreshnessStatus = "current" | "aging" | "outdated" | "unknown";

/**
 * Herkunft des Rechtskontexts. "none" steht für die allgemeine Bearbeitung
 * ohne bestätigten Praxisfall – dann werden keine fallspezifischen
 * Rechtsgrundlagen angezeigt (und keine erfunden).
 */
export type LegalContextSource =
  | {
      kind: "practice_case";
      caseId: string;
      caseTitle: string;
      /** Stand des Praxisfalls (updated_at) zum Auflösezeitpunkt. */
      caseVersion: string | null;
    }
  | { kind: "none" };

/** Aufgelöste Angaben zur Rechtsquelle (legal_sources). */
export interface LegalSourceInfo {
  id: string;
  name: string;
  shortName: string | null;
  /** Text-Spalte source_type bzw. Enum source_type_v2 (v2 bevorzugt). */
  sourceType: string | null;
  jurisdiction: string | null;
  officialUrl: string | null;
  versionLabel: string | null;
  lifecycleStatus: string | null;
  verificationStatus: string | null;
  validFrom: string | null;
  validTo: string | null;
  lastVerifiedAt: string | null;
  lastReviewedAt: string | null;
  replacedBySourceId: string | null;
  updatedAt: string | null;
}

/**
 * Vollständig aufgelöste Rechtsgrundlage ohne abgeleitete Angaben
 * (Aktualität und Erklärung werden von Checker bzw. Explainer ergänzt).
 */
export interface ResolvedLegalReference {
  linkId: string;
  sectionId: string;
  /** Kurzreferenz, z. B. "§ 53". */
  reference: string;
  title: string | null;
  summary: string | null;
  practiceRelevance: string | null;
  recommendation: string | null;
  officialUrl: string | null;
  sectionStatus: string | null;
  sectionValidFrom: string | null;
  sectionValidTo: string | null;
  sectionVersionLabel: string | null;
  sectionLastReviewedAt: string | null;
  sectionUpdatedAt: string | null;
  /**
   * Unveränderter Quelltext des Abschnitts aus dem Legal-Knowledge-System
   * (legal_sections.original_text), falls vorhanden. Wird ausschließlich
   * durchgereicht – niemals zusammengefasst oder umformuliert.
   */
  originalText: string | null;
  source: LegalSourceInfo | null;
  relevance: LegalLinkRelevance | null;
  /** Redaktionelle Begründung der Verknüpfung (case_legal_links.explanation). */
  linkExplanation: string | null;
  linkCreatedAt: string | null;
}

/** Darstellungsfertige Rechtsgrundlage inkl. Aktualität und Herkunftstext. */
export interface LegalReference extends ResolvedLegalReference {
  freshness: LegalFreshnessStatus;
  freshnessReasons: string[];
  /** Nachvollziehbare Begründung, warum diese Grundlage angezeigt wird. */
  explanation: string;
}

export type LegalContextIssueType =
  | "missing_section"
  | "missing_source"
  | "outdated_reference"
  | "unverified_source";

export interface LegalContextIssue {
  type: LegalContextIssueType;
  sectionId: string | null;
  message: string;
}

/** Persistierbares Ergebnis (JSON-serialisierbar, Navigator-Kontext). */
export interface LegalContextResult {
  schemaVersion: number;
  source: LegalContextSource;
  references: LegalReference[];
  issues: LegalContextIssue[];
  /** Zeitpunkt der Auflösung (ISO). */
  resolvedAt: string;
  /**
   * djb2-Hash über die fachliche Eingabe (Fallstand, Verknüpfungen,
   * Abschnitts- und Quellenstände). Grundlage der Veraltungs-Erkennung.
   */
  inputHash: string;
}

/* ------------------------------ Rohdaten --------------------------------- */

/** Zeile aus practice_cases (nur benötigte Spalten). */
export interface LegalContextCaseRow {
  id: string;
  title: string | null;
  updated_at: string | null;
  status: string | null;
}

/** Zeile aus case_legal_links (beide historischen Spaltenvarianten). */
export interface LegalLinkRow {
  id: string;
  case_id?: string | null;
  legal_section_id?: string | null;
  section_id?: string | null;
  relevance?: string | null;
  explanation?: string | null;
  created_at?: string | null;
}

/** Zeile aus legal_sections (nur für den Kontext benötigte Spalten). */
export interface LegalSectionRow {
  id: string;
  source_id?: string | null;
  section_number?: string | null;
  title?: string | null;
  summary?: string | null;
  practice_relevance?: string | null;
  recommendation?: string | null;
  official_url?: string | null;
  version_label?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  status?: string | null;
  last_reviewed_at?: string | null;
  updated_at?: string | null;
  /** Gespeicherter Quelltext (Sprint 4.1B), falls vorhanden. */
  original_text?: string | null;
}

/** Zeile aus legal_sources (nur für den Kontext benötigte Spalten). */
export interface LegalSourceRow {
  id: string;
  name?: string | null;
  short_name?: string | null;
  source_type?: string | null;
  source_type_v2?: string | null;
  jurisdiction?: string | null;
  official_url?: string | null;
  version_label?: string | null;
  lifecycle_status?: string | null;
  verification_status?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  last_verified_at?: string | null;
  last_reviewed_at?: string | null;
  replaced_by_source_id?: string | null;
  updated_at?: string | null;
}

/** Flache, auflösbare Eingabe für Resolver und Hash. */
export interface LegalContextData {
  caseRow: LegalContextCaseRow | null;
  links: LegalLinkRow[];
  sections: LegalSectionRow[];
  sources: LegalSourceRow[];
}

/* ------------------------------ Ereignisse -------------------------------- */

export type LegalContextEventName =
  | "LegalContextResolved"
  | "LegalContextRestored"
  | "LegalContextRefreshed"
  | "LegalContextStaleDetected";

export interface LegalContextEvent {
  name: LegalContextEventName;
  at: string;
  detail?: Record<string, unknown>;
}

export type LegalContextEventListener = (event: LegalContextEvent) => void;
