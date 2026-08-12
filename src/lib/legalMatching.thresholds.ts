/**
 * Zentrale Confidence-Schwellen für die Legal-Matching-Engine.
 * EINZIGE Definitionsstelle. Wird von der Engine, der Pipeline,
 * der UI und dem Quality Manager verwendet.
 */

export const LEGAL_MATCHING_THRESHOLDS = {
  /** Neue Kandidaten mit >= 85 % werden automatisch übernommen. */
  AUTO_ACCEPT_MIN: 85,
  /** 65..84 → fachlich plausibel, aber Review empfohlen (nicht auto). */
  REVIEW_MIN: 65,
  /** Ein bestehender Link wird NUR automatisch entfernt, wenn die
   *  Re-Evaluierung ihn mit dieser Mindest-Confidence als irrelevant
   *  einstuft. Vorsichtige Schwelle, damit KI-Unsicherheit keine
   *  redaktionellen Entscheidungen verwirft. */
  AUTO_REMOVE_IRRELEVANT_MIN: 80,
  /** Zielwerte für Rechtsgrundlagen-Struktur (Qualität, keine Auffüllung). */
  TARGET_MIN_SOURCES: 3,
  MIN_PRIMARY_COUNT: 1,
} as const;

export type LegalRelevanceRole = "primary" | "supporting" | "context" | "irrelevant";

export function ampelForConfidence(c: number): "gruen" | "gelb" | "orange" | "rot" {
  if (c >= 90) return "gruen";
  if (c >= LEGAL_MATCHING_THRESHOLDS.AUTO_ACCEPT_MIN) return "gelb";
  if (c >= LEGAL_MATCHING_THRESHOLDS.REVIEW_MIN) return "orange";
  return "rot";
}
