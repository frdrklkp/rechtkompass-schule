// Zentrale Score-, Grade- und Aging-Berechnung. EINZIGE Definitionsstelle.

import type { QualityGrade, QualityRuleResult } from "./types";

export const GRADE_THRESHOLDS: Array<{ min: number; grade: QualityGrade }> = [
  { min: 90, grade: "A" },
  { min: 80, grade: "B" },
  { min: 70, grade: "C" },
  { min: 60, grade: "D" },
  { min: 50, grade: "E" },
  { min: 0, grade: "F" },
];

export const AGING_THRESHOLDS = {
  reviewRecommendedDays: 365,
  outdatedDays: 730,
} as const;

export function calcScore(results: QualityRuleResult[], maxScore: number) {
  const raw = results
    .filter((r) => r.passed && r.severity !== "info")
    .reduce((s, r) => s + r.scoreImpact, 0);
  const score = Math.max(0, Math.min(maxScore, raw));
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return { score, percentage };
}

export function gradeFor(percentage: number, assessable: boolean): QualityGrade {
  if (!assessable) return "ungraded";
  for (const t of GRADE_THRESHOLDS) if (percentage >= t.min) return t.grade;
  return "F";
}

export function agingLevelFor(updatedAt: string | null | undefined) {
  if (!updatedAt) return "outdated" as const;
  const ms = Date.now() - new Date(updatedAt).getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days >= AGING_THRESHOLDS.outdatedDays) return "outdated" as const;
  if (days >= AGING_THRESHOLDS.reviewRecommendedDays)
    return "review_recommended" as const;
  return "current" as const;
}
