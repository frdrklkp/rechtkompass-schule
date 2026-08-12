// Deterministische Ingestion-Validierung.

import type {
  LegalContentStats,
  LegalIngestionMetadata,
  LegalIngestionValidationIssue,
  LegalIngestionValidationResult,
} from "./LegalIngestionTypes";

const MIN_CHARS = 40;
const MIN_WORDS = 8;

export function validateIngestion(
  normalized: string,
  stats: LegalContentStats,
  metadata: LegalIngestionMetadata,
): LegalIngestionValidationResult {
  const issues: LegalIngestionValidationIssue[] = [];

  if (!normalized.trim()) {
    issues.push({
      code: "content_empty",
      severity: "error",
      field: "content",
      message: "Es wurde kein Textinhalt erkannt.",
    });
  } else {
    if (stats.charCount < MIN_CHARS) {
      issues.push({
        code: "content_too_short",
        severity: "warning",
        field: "content",
        message: `Sehr kurzer Inhalt (${stats.charCount} Zeichen).`,
      });
    }
    if (stats.wordCount < MIN_WORDS) {
      issues.push({
        code: "content_low_wordcount",
        severity: "warning",
        field: "content",
        message: `Auffällig wenige Wörter (${stats.wordCount}).`,
      });
    }
    if (!stats.hasSectionMarkers) {
      issues.push({
        code: "content_no_sections",
        severity: "notice",
        field: "content",
        message: "Keine Paragraphen- oder Artikel-Marker erkannt.",
      });
    }
  }

  if (!metadata.detectedTitle) {
    issues.push({
      code: "meta_title_missing",
      severity: "warning",
      field: "title",
      message: "Titel konnte nicht automatisch erkannt werden.",
    });
  }
  if (!metadata.detectedJurisdiction) {
    issues.push({
      code: "meta_jurisdiction_missing",
      severity: "warning",
      field: "jurisdiction",
      message: "Zuständigkeit (z. B. Bundesland) fehlt.",
    });
  }
  if (!metadata.detectedType) {
    issues.push({
      code: "meta_type_missing",
      severity: "notice",
      field: "sourceType",
      message: "Rechtsquellen-Typ konnte nicht sicher bestimmt werden.",
    });
  }
  if (metadata.detectedValidFrom && metadata.detectedPublishedAt &&
      metadata.detectedValidFrom < metadata.detectedPublishedAt) {
    issues.push({
      code: "meta_date_inconsistent",
      severity: "warning",
      field: "validFrom",
      message: "Gültigkeitsbeginn liegt vor dem Veröffentlichungsdatum.",
    });
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const noticeCount = issues.filter((i) => i.severity === "notice").length;

  const readiness: LegalIngestionValidationResult["readiness"] =
    errorCount > 0 ? "blocked"
    : warningCount > 0 ? "needs_input"
    : "ready_for_review";

  return { issues, readiness, errorCount, warningCount, noticeCount };
}
