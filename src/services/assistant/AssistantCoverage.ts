/**
 * Sprint 4.6F – Abdeckungsgrad der Trefferlage.
 *
 * Der Abdeckungsgrad beschreibt ausschließlich, wie belastbar der Abgleich ist.
 * Er ist keine rechtliche Bewertung und keine Empfehlung.
 */
import type { PracticeCaseMatchResult } from "@/services/practice-case-matching";
import type { SituationCase } from "@/services/situation-analyzer";
import type { AssistantCoverage, AssistantCoverageLevel } from "./types";

export const COVERAGE_THRESHOLDS = {
  HIGH: 70,
  MEDIUM: 45,
} as const;

export class AssistantCoverageCalculator {
  calculate(result: PracticeCaseMatchResult, situation: SituationCase): AssistantCoverage {
    const reasons: string[] = [];
    const missing: string[] = [...situation.completeness.missingRequiredQuestions];

    const best = result.matches[0] ?? null;
    const strongMatches = result.stats.strong;
    const completion = situation.completeness.completionPercentage;

    /* Trefferqualität (0..60) und Erfassungsgrad (0..40) getrennt gewichtet. */
    const matchPart = best ? Math.round((best.score * 0.4 + best.confidence * 0.2)) : 0;
    const completionPart = Math.round((completion / 100) * 40);
    const score = Math.max(0, Math.min(100, matchPart + completionPart));

    if (!best) reasons.push("Kein Praxisfall erreicht die Mindestübereinstimmung.");
    else {
      reasons.push(
        `Bester Treffer „${best.title}“ mit ${best.score} von 100 Punkten und ${best.confidence} % Konfidenz.`,
      );
      if (strongMatches > 0) reasons.push(`${strongMatches} Treffer mit hoher Übereinstimmung.`);
    }
    reasons.push(`Sachverhalt zu ${completion} % erfasst.`);
    if (result.features.unknownAspects.length > 0) {
      reasons.push(`Offene Angaben: ${result.features.unknownAspects.slice(0, 5).join(", ")}.`);
    }
    if (missing.length > 0) {
      reasons.push(`${missing.length} Pflichtangabe(n) fehlen noch.`);
    }

    let level: AssistantCoverageLevel;
    if (!best) level = "none";
    else if (score >= COVERAGE_THRESHOLDS.HIGH && strongMatches > 0) level = "high";
    else if (score >= COVERAGE_THRESHOLDS.MEDIUM) level = "medium";
    else level = "low";

    return {
      level,
      score,
      reasons,
      missing,
      strongMatches,
      evaluated: result.stats.evaluated,
    };
  }
}

export const defaultCoverageCalculator = new AssistantCoverageCalculator();
