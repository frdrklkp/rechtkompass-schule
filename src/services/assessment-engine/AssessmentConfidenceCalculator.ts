/**
 * Sprint 4.6C – Berechnung der Aussagekraft der Datengrundlage.
 * Beschreibt ausschließlich die technische Auswertbarkeit, keine Rechtssicherheit.
 */
import type { RuleEvaluation } from "./AssessmentRuleEvaluator";
import type {
  AssessmentConfidence,
  AssessmentMissingInformation,
  ConfidenceLevel,
} from "./types";

export interface ConfidenceInput {
  matched: RuleEvaluation[];
  enabledRuleCount: number;
  dataCompleteness: number;
  uncertaintyCount: number;
  missingInformation: AssessmentMissingInformation[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class AssessmentConfidenceCalculator {
  calculate(input: ConfidenceInput): AssessmentConfidence {
    const dataCompleteness = clamp(Math.round(input.dataCompleteness), 0, 100);
    const ruleCoverage =
      input.enabledRuleCount === 0
        ? 0
        : clamp(Math.round((input.matched.length / input.enabledRuleCount) * 100), 0, 100);

    const impact = input.matched.reduce((sum, e) => sum + (e.rule.result.confidenceImpact ?? 0), 0);
    const uncertaintyCount = input.uncertaintyCount + input.missingInformation.length;

    const base = 0.6 * dataCompleteness + 0.4 * ruleCoverage;
    const score = clamp(Math.round(base + impact - 5 * uncertaintyCount), 0, 100);

    const level: ConfidenceLevel =
      input.matched.length === 0 ? "unknown" : score >= 75 ? "high" : score >= 45 ? "medium" : "low";

    const reasons: string[] = [];
    reasons.push(`Die Erfassung ist zu ${dataCompleteness} % vollständig.`);
    reasons.push(`${input.matched.length} von ${input.enabledRuleCount} Bewertungsregeln konnten angewendet werden.`);
    if (uncertaintyCount > 0) {
      reasons.push(`${uncertaintyCount} Angabe(n) sind offen oder ausdrücklich unbekannt.`);
    } else {
      reasons.push("Es sind keine offenen oder unbekannten Angaben erfasst.");
    }
    if (impact > 0) reasons.push("Vorhandene Dokumentation oder Nachweise stärken die Datengrundlage.");
    if (impact < 0) reasons.push("Fehlende Pflichtangaben schwächen die Datengrundlage.");

    return { score, level, reasons, dataCompleteness, ruleCoverage, uncertaintyCount };
  }
}
