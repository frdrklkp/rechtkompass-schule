/**
 * Sprint 4.6C – Validierung der Assessment-Eingaben.
 * Prüft ausschließlich Struktur und Kompatibilität, nicht die Fachlichkeit.
 */
import { SITUATION_SCHEMA_VERSION, type SituationCase } from "@/services/situation-analyzer";
import type { AssessmentRuleRegistry } from "./AssessmentRuleRegistry";
import type { AssessmentValidationIssue, AssessmentValidationResult } from "./types";

export class AssessmentValidator {
  validateSituation(situation: unknown): AssessmentValidationResult {
    const issues: AssessmentValidationIssue[] = [];

    if (situation === null || situation === undefined) {
      issues.push({
        code: "situation_missing",
        message: "Es wurde noch keine Situation erfasst. Bitte zunächst die Phase „Situation“ ausfüllen.",
      });
      return { valid: false, issues };
    }
    if (typeof situation !== "object") {
      issues.push({
        code: "situation_invalid",
        message: "Die erfassten Angaben haben ein unerwartetes Format.",
      });
      return { valid: false, issues };
    }

    const candidate = situation as Partial<SituationCase>;
    if (typeof candidate.schemaVersion !== "number") {
      issues.push({
        code: "situation_invalid",
        message: "Den erfassten Angaben fehlt die Schema-Version.",
        field: "schemaVersion",
      });
      return { valid: false, issues };
    }
    if (candidate.schemaVersion !== SITUATION_SCHEMA_VERSION) {
      issues.push({
        code: "situation_incompatible",
        message: `Die erfassten Angaben stammen aus Version ${candidate.schemaVersion} und sind mit der aktuellen Version ${SITUATION_SCHEMA_VERSION} nicht kompatibel.`,
        field: "schemaVersion",
      });
      return { valid: false, issues };
    }

    const requiredObjects: Array<keyof SituationCase> = [
      "incident",
      "dangerInformation",
      "documentationStatus",
      "completeness",
    ];
    for (const key of requiredObjects) {
      if (typeof candidate[key] !== "object" || candidate[key] === null) {
        issues.push({
          code: "situation_invalid",
          message: `Der Bereich „${String(key)}“ fehlt in den erfassten Angaben.`,
          field: String(key),
        });
      }
    }
    const requiredArrays: Array<keyof SituationCase> = [
      "participants",
      "witnesses",
      "evidence",
      "measuresTaken",
      "uncertainties",
    ];
    for (const key of requiredArrays) {
      if (!Array.isArray(candidate[key])) {
        issues.push({
          code: "situation_invalid",
          message: `Der Bereich „${String(key)}“ fehlt oder ist beschädigt.`,
          field: String(key),
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }

  validateRules(registry: AssessmentRuleRegistry): AssessmentValidationResult {
    const issues = registry.validateDefinitions();
    return { valid: issues.length === 0, issues };
  }
}
