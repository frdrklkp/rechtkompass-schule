/**
 * Sprint 4.6E – Validierung von Matching-Profilen (deterministisch).
 */
import { MATCHING_PROFILE_VERSION, isMatchSignal, type MatchProfileIssue, type MatchProfileValidationResult, type MatchingProfile } from "./types";

export class MatchProfileValidator {
  validate(profile: MatchingProfile): MatchProfileValidationResult {
    const issues: MatchProfileIssue[] = [];

    if (profile.profileVersion !== MATCHING_PROFILE_VERSION) {
      issues.push({
        code: "version_mismatch",
        field: "profileVersion",
        message: `Profilversion ${profile.profileVersion} weicht von der erwarteten Version ${MATCHING_PROFILE_VERSION} ab.`,
        severity: "error",
      });
    }
    if (profile.categories.length === 0) {
      issues.push({
        code: "missing_category",
        field: "categories",
        message: "Mindestens eine Kategorie ist erforderlich.",
        severity: "error",
      });
    }
    if (profile.keywords.length < 3) {
      issues.push({
        code: "missing_keywords",
        field: "keywords",
        message: "Mindestens drei Schlagwörter werden empfohlen.",
        severity: "warning",
      });
    }

    const allSignals = [
      ...profile.expectedSignals.map((s) => ["expectedSignals", s] as const),
      ...profile.requiredSignals.map((s) => ["requiredSignals", s] as const),
      ...profile.excludedSignals.map((s) => ["excludedSignals", s] as const),
    ];
    for (const [field, signal] of allSignals) {
      if (!isMatchSignal(signal)) {
        issues.push({
          code: "unknown_signal",
          field,
          message: `Unbekanntes Merkmal „${String(signal)}“.`,
          severity: "error",
        });
      }
    }

    const excluded = new Set<string>(profile.excludedSignals);
    for (const signal of [...profile.requiredSignals, ...profile.expectedSignals]) {
      if (excluded.has(signal)) {
        issues.push({
          code: "signal_conflict",
          field: "excludedSignals",
          message: `Merkmal „${signal}“ ist gleichzeitig erwartet und ausgeschlossen.`,
          severity: "error",
        });
      }
    }

    const duplicateFields: Array<[string, string[]]> = [
      ["categories", profile.categories],
      ["subcategories", profile.subcategories],
      ["keywords", profile.keywords],
      ["synonyms", profile.synonyms],
      ["roles", profile.roles],
      ["locationTypes", profile.locationTypes],
      ["legalSectionIds", profile.legalSectionIds],
    ];
    for (const [field, values] of duplicateFields) {
      if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) {
        issues.push({
          code: "duplicate_entry",
          field,
          message: `Doppelte Einträge in „${field}“.`,
          severity: "warning",
        });
      }
    }

    return { valid: issues.every((i) => i.severity !== "error"), issues };
  }
}

export const defaultProfileValidator = new MatchProfileValidator();
