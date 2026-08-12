/**
 * Sprint 4.6E – Deterministisches Scoring eines Praxisfalls gegen Situationsmerkmale.
 * Keine KI, keine Embeddings: gewichtete Mengenüberdeckung mit Ausschlusslogik.
 */
import { coverageRatio, tokenize, unique } from "./normalize";
import {
  MATCH_DIMENSION_LABELS,
  MATCH_LOCATION_LABELS,
  MATCH_ROLE_LABELS,
  MATCH_SIGNAL_LABELS,
  MATCH_THRESHOLDS,
  MATCH_WEIGHTS,
  matchLevelForScore,
} from "./weights";
import type {
  MatchDimensionScore,
  MatchReason,
  PracticeCaseIndexEntry,
  PracticeCaseMatch,
  SituationMatchFeatures,
} from "./types";

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

function dimension(
  dim: MatchDimensionScore["dimension"],
  expected: string[],
  present: string[],
): MatchDimensionScore {
  const set = new Set(present);
  const matched = expected.filter((item) => set.has(item));
  const missed = expected.filter((item) => !set.has(item));
  const ratio = expected.length === 0 ? 0 : matched.length / expected.length;
  return {
    dimension: dim,
    weight: MATCH_WEIGHTS[dim],
    ratio,
    points: Math.round(ratio * MATCH_WEIGHTS[dim] * 100) / 100,
    matched,
    missed,
  };
}

export class PracticeCaseMatchScorer {
  score(entry: PracticeCaseIndexEntry, features: SituationMatchFeatures): PracticeCaseMatch {
    const profile = entry.profile;
    const reasons: MatchReason[] = [];
    const exclusionReasons: string[] = [];

    /* Ausschlussmerkmale */
    const situationSignals = new Set<string>(features.signals);
    for (const signal of profile.excludedSignals) {
      if (situationSignals.has(signal)) {
        exclusionReasons.push(`Ausschlussmerkmal erfüllt: ${label(MATCH_SIGNAL_LABELS, signal)}`);
        reasons.push({
          code: "excluded_signal_present",
          label: "Ausschlussmerkmal",
          detail: label(MATCH_SIGNAL_LABELS, signal),
          positive: false,
        });
      }
    }
    /* Pflichtmerkmale */
    for (const signal of profile.requiredSignals) {
      if (!situationSignals.has(signal)) {
        exclusionReasons.push(`Pflichtmerkmal fehlt: ${label(MATCH_SIGNAL_LABELS, signal)}`);
        reasons.push({
          code: "required_signal_missing",
          label: "Pflichtmerkmal fehlt",
          detail: label(MATCH_SIGNAL_LABELS, signal),
          positive: false,
        });
      }
    }

    /* Kategorie- und Begriffsvergleich über normalisierte Tokens */
    const situationTokens = unique([
      ...features.tokens,
      ...features.categoryHints.flatMap(tokenize),
    ]);
    const categoryTokens = unique(profile.categories.flatMap(tokenize));
    const subcategoryTokens = unique(profile.subcategories.flatMap(tokenize));
    const keywordTokens = unique([
      ...profile.keywords.flatMap(tokenize),
      ...profile.synonyms.flatMap(tokenize),
    ]);

    const dimensions: MatchDimensionScore[] = [
      dimension("category", categoryTokens, situationTokens),
      dimension("subcategory", subcategoryTokens, situationTokens),
      dimension("keywords", keywordTokens, situationTokens),
      dimension("roles", profile.roles, features.roles),
      dimension("signals", profile.expectedSignals, features.signals),
      dimension("location", profile.locationTypes, features.locationTypes),
    ];

    /* Nur bewertbare Dimensionen zählen; Gewichte werden neu normiert. */
    const scorable = dimensions.filter(
      (d) =>
        (d.dimension === "category" && categoryTokens.length > 0) ||
        (d.dimension === "subcategory" && subcategoryTokens.length > 0) ||
        (d.dimension === "keywords" && keywordTokens.length > 0) ||
        (d.dimension === "roles" && profile.roles.length > 0) ||
        (d.dimension === "signals" && profile.expectedSignals.length > 0) ||
        (d.dimension === "location" && profile.locationTypes.length > 0),
    );
    const totalWeight = scorable.reduce((sum, d) => sum + d.weight, 0);
    const earned = scorable.reduce((sum, d) => sum + d.ratio * d.weight, 0);
    const rawScore = totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 100);

    /* Begründungen */
    for (const d of scorable) {
      if (d.matched.length === 0) continue;
      const detail =
        d.dimension === "roles"
          ? d.matched.map((r) => label(MATCH_ROLE_LABELS, r)).join(", ")
          : d.dimension === "signals"
            ? d.matched.map((s) => label(MATCH_SIGNAL_LABELS, s)).join(", ")
            : d.dimension === "location"
              ? d.matched.map((l) => label(MATCH_LOCATION_LABELS, l)).join(", ")
              : d.matched.join(", ");
      reasons.push({
        code:
          d.dimension === "category"
            ? "category_match"
            : d.dimension === "subcategory"
              ? "subcategory_match"
              : d.dimension === "keywords"
                ? "keyword_match"
                : d.dimension === "roles"
                  ? "role_match"
                  : d.dimension === "signals"
                    ? "signal_match"
                    : "location_match",
        label: MATCH_DIMENSION_LABELS[d.dimension],
        detail,
        positive: true,
      });
    }
    if (reasons.every((r) => !r.positive)) {
      reasons.push({
        code: "no_overlap",
        label: "Keine Übereinstimmung",
        detail: "Zwischen Sachverhalt und Fallprofil bestehen keine gemeinsamen Merkmale.",
        positive: false,
      });
    }

    /* Konfidenz */
    let confidence = rawScore;
    const penalty = features.unknownAspects.length * MATCH_THRESHOLDS.CONFIDENCE_PENALTY_PER_UNKNOWN;
    if (penalty > 0) {
      confidence = Math.max(MATCH_THRESHOLDS.CONFIDENCE_FLOOR, confidence - penalty);
      reasons.push({
        code: "incomplete_situation",
        label: "Unklare Angaben",
        detail: features.unknownAspects.slice(0, 5).join(", "),
        positive: false,
      });
    }
    if (features.completionPercentage < 100) {
      confidence = Math.max(
        MATCH_THRESHOLDS.CONFIDENCE_FLOOR,
        Math.round(confidence * (0.6 + 0.4 * (features.completionPercentage / 100))),
      );
    }
    if (entry.profile.status !== "approved") {
      confidence = Math.max(MATCH_THRESHOLDS.CONFIDENCE_FLOOR, Math.round(confidence * 0.9));
    }

    const excluded = exclusionReasons.length > 0;
    const score = excluded ? 0 : rawScore;

    return {
      caseId: entry.caseId,
      title: entry.title,
      ampel: entry.ampel,
      score,
      level: excluded ? "none" : matchLevelForScore(score),
      confidence: excluded ? 0 : confidence,
      dimensions,
      reasons,
      excluded,
      exclusionReasons,
      profileStatus: entry.profile.status,
    };
  }

  /** Anteil erfüllter Erwartungsmerkmale (für Diagnose und Tests). */
  signalCoverage(entry: PracticeCaseIndexEntry, features: SituationMatchFeatures): number {
    return coverageRatio(entry.profile.expectedSignals, features.signals);
  }
}

export const defaultMatchScorer = new PracticeCaseMatchScorer();
