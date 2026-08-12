/**
 * Sprint 4.6H – Dokumentationsassistent: Typen und Konstanten.
 *
 * Architekturprinzip: Dokumente werden ausschließlich aus bereits vorhandenen
 * strukturierten Falldaten erzeugt (SituationCase, AssessmentResult,
 * ActionPlan, LegalContext, bestätigter Praxisfall). Es werden keine
 * Tatsachen, Namen oder Daten erfunden; fehlende Angaben werden sichtbar
 * markiert. Keine KI-Rechtsformulierung.
 */

/** Kontext-Schlüssel, unter dem der Stand im Navigator-Kontext liegt. */
export const DOCUMENTATION_CONTEXT_KEY = "documentation";

/** Schema-Version des persistierten Kontext-Eintrags. */
export const DOCUMENTATION_SCHEMA_VERSION = 1;

/** Navigator-Phase, der die Entwürfe zugeordnet werden. */
export const DOCUMENTATION_STEP_ID = "dokumentation";

/**
 * Erstellbarkeitsstatus einer Vorlage:
 * - ready: alle benötigten Angaben liegen vor
 * - incomplete: Angaben fehlen – Erstellung möglich, Lücken werden markiert
 * - blocked: kein erfasster Sachverhalt – Erstellung nicht möglich
 * - unknown: keine Vorlagen bzw. noch nicht vorbereitet
 */
export type DocumentationReadiness = "ready" | "incomplete" | "blocked" | "unknown";

/** Herkunft einer aufgelösten Vorlage (deterministische Auflösungsreihenfolge). */
export type DocumentationTemplateSource = "practice_case" | "category" | "generic";

/** Aufgelöste, darstellungsfertige Dokumentvorlage. */
export interface DocumentationTemplateRef {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  documentType: string | null;
  markdownBody: string;
  source: DocumentationTemplateSource;
  sortOrder: number;
}

/** Vorlage, die nicht verwendbar ist (z. B. ohne Inhalt). */
export interface DocumentationSkippedTemplate {
  id: string;
  title: string;
  reason: string;
}

/** Fehlende Angabe, die ein Platzhalter benötigt. */
export interface DocumentationMissingField {
  key: string;
  reason: "unknown" | "empty" | "ai_disabled";
}

/** Readiness-Ergebnis je Vorlage. */
export interface DocumentationTemplateReadiness {
  templateId: string;
  readiness: DocumentationReadiness;
  missingFields: DocumentationMissingField[];
}

export type DocumentationDraftStatus = "generated" | "edited";

/**
 * Entwurf eines Dokuments. Bearbeitungen fließen nicht in den
 * SituationCase zurück (keine automatische Rückspeicherung).
 */
export interface DocumentationDraft {
  id: string;
  templateId: string;
  templateSlug: string;
  title: string;
  markdown: string;
  status: DocumentationDraftStatus;
  /** Eingabe-Hash zum Erzeugungszeitpunkt (Veraltungserkennung). */
  inputHash: string;
  missingPlaceholders: DocumentationMissingField[];
  createdAt: string;
  updatedAt: string;
}

/** Persistierbarer Stand der Dokumentationsphase (JSON-serialisierbar). */
export interface DocumentationContextEntry {
  schemaVersion: number;
  /**
   * djb2-Hash über Situation, Bewertung, Maßnahmenplan, Rechtskontext,
   * Praxisfall und Vorlagen. Grundlage der Veraltungserkennung.
   */
  inputHash: string;
  /** Bestätigter Praxisfall (falls vorhanden). */
  caseId: string | null;
  templates: DocumentationTemplateRef[];
  readiness: DocumentationTemplateReadiness[];
  /** Alle Entwürfe; alte Versionen bleiben bei Neugenerierung erhalten. */
  drafts: DocumentationDraft[];
  preparedAt: string;
  updatedAt: string;
}

/* --------------------------------- Events -------------------------------- */

export type DocumentationEventName =
  | "DocumentationPrepared"
  | "DocumentationRestored"
  | "DocumentationDraftGenerated"
  | "DocumentationDraftUpdated"
  | "DocumentationDraftRemoved"
  | "DocumentationExported"
  | "DocumentationStaleDetected";

export interface DocumentationEvent {
  name: DocumentationEventName;
  at: string;
  detail?: Record<string, unknown>;
}

export type DocumentationEventListener = (event: DocumentationEvent) => void;

/* ------------------------------ Textbausteine ---------------------------- */

export const DOCUMENTATION_READINESS_LABELS: Record<DocumentationReadiness, string> = {
  ready: "Vollständig",
  incomplete: "Unvollständig – Angaben fehlen",
  blocked: "Blockiert – Sachverhalt fehlt",
  unknown: "Noch nicht geprüft",
};

export const DOCUMENTATION_TEMPLATE_SOURCE_LABELS: Record<DocumentationTemplateSource, string> = {
  practice_case: "Praxisfall",
  category: "Kategorie",
  generic: "Allgemein",
};

export const DOCUMENTATION_DRAFT_STATUS_LABELS: Record<DocumentationDraftStatus, string> = {
  generated: "Entwurf",
  edited: "Bearbeitet",
};

export const DOCUMENTATION_LIMITATIONS: string[] = [
  "Dokumente werden ausschließlich aus den erfassten Angaben erzeugt.",
  "Fehlende Angaben werden als ⟨fehlend⟩ markiert und nicht ergänzt.",
  "Änderungen am Entwurf verändern die erfassten Falldaten nicht.",
  "Jedes Dokument ist vor Verwendung fachlich zu prüfen.",
];
