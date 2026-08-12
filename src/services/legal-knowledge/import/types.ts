/**
 * Sprint 4.5C – Legal Knowledge Import Framework: Domain-Typen.
 *
 * Reine Datenstrukturen. Keine Abhängigkeit zu Supabase, Netzwerk oder KI.
 * Parser normalisieren beliebige Quellen in dieses Modell, das Framework
 * arbeitet ausschließlich darauf.
 */

export type LegalImportSourceKind =
  | "law"
  | "administrative_regulation"
  | "circular"
  | "ordinance"
  | "faq"
  | "court_decision"
  | "guideline"
  | "other";

export type LegalNodeKind =
  | "document"
  | "part"
  | "chapter"
  | "section"
  | "paragraph"
  | "article"
  | "subsection" // Absatz (z. B. „(1)")
  | "sentence" // Satz („Satz 3")
  | "item" // Aufzählungspunkt
  | "heading"
  | "text"; // Freitext ohne strukturelle Rolle (z. B. Erlass-Fließtext)

export interface LegalImportSource {
  /** Kanonische Kennung, stabil über Reimporte hinweg (Slug, ELI, Aktenzeichen, …). */
  key: string;
  kind: LegalImportSourceKind;
  title: string;
  shortName?: string | null;
  jurisdiction?: string | null;
  authority?: string | null;
  officialUrl?: string | null;
  language?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LegalImportVersion {
  /** Menschenlesbare Version, z. B. „Fassung 01.08.2024". */
  label: string;
  /** Optional ISO-Datum. */
  publishedAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  /** Frei belegbare Herausgeberkennzeichnung (z. B. „BASS 12-05 Nr. 1"). */
  citation?: string | null;
}

export interface LegalNode {
  /** Innerhalb eines Imports eindeutige lokale ID (kein Datenbank-Bezug). */
  localId: string;
  kind: LegalNodeKind;
  /** Nummerierung, z. B. „§ 42" oder „(3)" oder „a)". */
  number?: string | null;
  heading?: string | null;
  text?: string | null;
  /** Kinderreihenfolge ist bedeutungstragend. */
  children: LegalNode[];
  /** Frei belegbare Zusatzangaben (Fundstelle, Notiz, Marker …). */
  metadata?: Record<string, unknown>;
}

export interface NormalizedLegalDocument {
  source: LegalImportSource;
  version: LegalImportVersion;
  root: LegalNode; // kind === "document"
  /** Roh-Text der Quelle vor der Strukturierung (Debug/Golden-Reference). */
  rawText?: string | null;
}

export interface LegalImportInput {
  /** Rohinhalt, wie er von der Quelle geliefert wird. */
  raw: string;
  /** Kontext aus dem UI/Trigger, z. B. offizielle URL. */
  hint?: {
    officialUrl?: string | null;
    detectedTitle?: string | null;
    detectedVersion?: string | null;
  };
}

export interface LegalImportParser {
  /** Eindeutiger Bezeichner, z. B. „schulgesetz-nrw". */
  id: string;
  /** Menschenlesbarer Name. */
  label: string;
  /** Für welche Quellenart der Parser geeignet ist. */
  kind: LegalImportSourceKind;
  /** Deterministische Prüfung, ob dieser Parser das Rohmaterial verarbeiten kann. */
  canParse(input: LegalImportInput): boolean;
  /** Erzeugt normalisierte Domänenobjekte. Keine Datenbank, keine KI. */
  parse(input: LegalImportInput): NormalizedLegalDocument;
}

/* ---------- Validierung ---------- */

export type LegalImportIssueSeverity = "error" | "warning";

export interface LegalImportIssue {
  code:
    | "missing_source_key"
    | "missing_title"
    | "missing_version"
    | "empty_document"
    | "duplicate_local_id"
    | "invalid_reference"
    | "empty_text_leaf"
    | "version_conflict";
  severity: LegalImportIssueSeverity;
  message: string;
  nodeLocalId?: string;
}

export interface LegalImportValidationResult {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  issues: LegalImportIssue[];
}

/* ---------- Delta / Persistenz ---------- */

export type LegalImportNodeChange =
  | { op: "added"; localId: string; hash: string }
  | { op: "updated"; localId: string; hash: string; previousHash: string }
  | { op: "removed"; localId: string; previousHash: string }
  | { op: "unchanged"; localId: string; hash: string };

export interface LegalImportSnapshot {
  sourceKey: string;
  versionLabel: string;
  /** Stabile Hashes je Knoten aus dem letzten erfolgreichen Import. */
  nodeHashes: Record<string, string>;
}

export interface LegalImportDelta {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  changes: LegalImportNodeChange[];
}

export interface LegalImportOutcome {
  sourceKey: string;
  versionLabel: string;
  status: "completed" | "no_change" | "failed";
  delta: LegalImportDelta;
  validation: LegalImportValidationResult;
  document: NormalizedLegalDocument;
}
