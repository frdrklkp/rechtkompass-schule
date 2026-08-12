/**
 * Sprint 4.6G – Deterministische Sortierung der Rechtsgrundlagen.
 *
 * Kriterien (stabil, in dieser Reihenfolge):
 * 1. Relevanz der redaktionellen Verknüpfung (high > medium > low > ohne).
 * 2. Quellenart (Gesetz vor Verordnung vor Verwaltungsvorschrift …).
 * 3. Kurzreferenz (natürliche Sortierung, z. B. § 2 vor § 10).
 * 4. Abschnitts-ID (letzter, stabiler Tiebreak).
 */
import type { ResolvedLegalReference } from "./types";

const RELEVANCE_WEIGHT: Record<string, number> = { high: 0, medium: 1, low: 2 };
const NO_RELEVANCE_WEIGHT = 3;

const SOURCE_TYPE_WEIGHT: Record<string, number> = {
  law: 0,
  ordinance: 1,
  administrative_regulation: 2,
  circular: 3,
  eu_regulation: 4,
  court_decision: 5,
  internal_guideline: 6,
  editorial_guideline: 7,
  other: 8,
};
const UNKNOWN_SOURCE_TYPE_WEIGHT = 9;

function relevanceWeight(ref: ResolvedLegalReference): number {
  return ref.relevance ? (RELEVANCE_WEIGHT[ref.relevance] ?? NO_RELEVANCE_WEIGHT) : NO_RELEVANCE_WEIGHT;
}

function sourceTypeWeight(ref: ResolvedLegalReference): number {
  const type = ref.source?.sourceType;
  if (!type) return UNKNOWN_SOURCE_TYPE_WEIGHT;
  return SOURCE_TYPE_WEIGHT[type] ?? UNKNOWN_SOURCE_TYPE_WEIGHT;
}

/** Liefert eine neue, deterministisch sortierte Liste. */
export function rankLegalReferences<T extends ResolvedLegalReference>(references: T[]): T[] {
  return [...references].sort((a, b) => {
    const byRelevance = relevanceWeight(a) - relevanceWeight(b);
    if (byRelevance !== 0) return byRelevance;
    const bySourceType = sourceTypeWeight(a) - sourceTypeWeight(b);
    if (bySourceType !== 0) return bySourceType;
    const byReference = a.reference.localeCompare(b.reference, "de", { numeric: true });
    if (byReference !== 0) return byReference;
    return a.sectionId.localeCompare(b.sectionId);
  });
}
