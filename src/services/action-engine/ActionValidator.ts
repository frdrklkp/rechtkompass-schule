/**
 * Sprint 4.6D – Validierung der Voraussetzungen für eine Maßnahmengenerierung.
 */
import type {
  ActionInput,
  ActionValidationIssue,
  ActionValidationResult,
} from "./types";

const EVALUABLE_STATUS = ["completed", "incomplete", "conflicted", "inProgress"];

export class ActionValidator {
  validate(input: Partial<ActionInput> | null | undefined): ActionValidationResult {
    const issues: ActionValidationIssue[] = [];

    if (!input || !input.situation) {
      issues.push({
        code: "situation_missing",
        message:
          "Es wurde noch keine Situation erfasst. Bitte kehren Sie zur Phase „Situation“ zurück.",
      });
      return { valid: false, issues };
    }

    const situation = input.situation;
    if (typeof situation !== "object" || !situation.caseId || !situation.incident) {
      issues.push({
        code: "situation_invalid",
        message: "Die erfassten Angaben sind unvollständig oder nicht lesbar.",
      });
    }

    const assessment = input.assessment;
    if (!assessment) {
      issues.push({
        code: "assessment_missing",
        message:
          "Es liegt noch keine Bewertung vor. Bitte führen Sie zuerst die Bewertung aus.",
      });
      return { valid: false, issues };
    }

    if (input.assessmentIsStale) {
      issues.push({
        code: "assessment_stale",
        message:
          "Die Bewertung ist nicht mehr aktuell. Bitte zuerst neu bewerten.",
      });
    }

    if (assessment.conflicts.some((c) => c.blocksAssessment)) {
      issues.push({
        code: "assessment_conflicted",
        message:
          "Die Bewertung enthält Widersprüche, die eine eindeutige Grundlage verhindern. Bitte prüfen Sie zuerst die Angaben.",
      });
    }

    if (!EVALUABLE_STATUS.includes(assessment.status)) {
      issues.push({
        code: "assessment_status_not_evaluable",
        message:
          "Die vorhandene Bewertung besitzt keinen auswertbaren Status. Bitte führen Sie die Bewertung erneut aus.",
      });
    }

    return { valid: issues.length === 0, issues };
  }
}
