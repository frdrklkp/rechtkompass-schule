/**
 * Sprint 4.6E – Ansichtsmodelle für die redaktionelle Oberfläche.
 * Reine Projektion vorhandener Ergebnisse, keine eigene Matching-Logik.
 */
import { defaultProfileMapper } from "./PracticeCaseMatchProfileMapper";
import { defaultReadinessCalculator } from "./MatchReadinessCalculator";
import { defaultProfileValidator } from "./MatchProfileValidator";
import { hashOf } from "./normalize";
import type {
  MatchProfileIssue,
  MatchReadinessResult,
  MatchingProfile,
  PracticeCaseMatchIndex,
  PracticeCaseSource,
} from "./types";

export type MatchProfileFieldKey =
  | "categories"
  | "subcategories"
  | "keywords"
  | "synonyms"
  | "roles"
  | "locationTypes"
  | "expectedSignals"
  | "requiredSignals"
  | "excludedSignals";

export const MATCH_PROFILE_FIELD_LABELS: Record<MatchProfileFieldKey, string> = {
  categories: "Kategorien",
  subcategories: "Unterkategorien",
  keywords: "Schlagwörter",
  synonyms: "Synonyme",
  roles: "Beteiligtenrollen",
  locationTypes: "Orte",
  expectedSignals: "Erwartete Merkmale",
  requiredSignals: "Verpflichtende Merkmale",
  excludedSignals: "Ausschlussmerkmale",
};

export interface MatchProfileFieldView {
  key: MatchProfileFieldKey;
  label: string;
  /** Wirksame Werte (kuratiert, sonst abgeleitet). */
  values: string[];
  /** Automatisch aus den Falldaten abgeleitete Werte. */
  derivedValues: string[];
  /** Werte, die ausschließlich redaktionell gepflegt wurden. */
  curatedOnly: string[];
  /** Abgeleitete Werte, die redaktionell entfernt wurden. */
  removedFromDerived: string[];
  origin: "derived" | "curated" | "mixed" | "empty";
}

export interface MatchIndexStatusView {
  contentHash: string;
  indexedHash: string | null;
  indexedAt: string | null;
  state: "indexed" | "stale" | "notIndexed" | "skipped";
  stateLabel: string;
  indexHash: string | null;
  indexVersion: number | null;
  skipDetails: string[];
}

export interface MatchProfilePanelModel {
  caseId: string;
  title: string;
  profile: MatchingProfile;
  derivedProfile: MatchingProfile;
  curated: boolean;
  matchingEnabled: boolean;
  fields: MatchProfileFieldView[];
  readiness: MatchReadinessResult;
  issues: MatchProfileIssue[];
  conflicts: MatchProfileIssue[];
  missingRequired: Array<{ id: string; label: string; hint: string }>;
  indexStatus: MatchIndexStatusView;
  links: { legal: number; templates: number; keywords: number; decisionTree: boolean };
}

const STATE_LABELS: Record<MatchIndexStatusView["state"], string> = {
  indexed: "indexiert und aktuell",
  stale: "indexiert, aber veraltet",
  notIndexed: "nicht im Index",
  skipped: "übersprungen",
};

export const MATCH_PROFILE_STATUS_LABELS: Record<MatchingProfile["status"], string> = {
  derived: "Automatisch abgeleitet",
  draft: "Entwurf",
  review: "In Prüfung",
  approved: "Redaktionell bestätigt",
};

function fieldView(
  key: MatchProfileFieldKey,
  profile: MatchingProfile,
  derived: MatchingProfile,
): MatchProfileFieldView {
  const values = (profile[key] as string[]) ?? [];
  const derivedValues = (derived[key] as string[]) ?? [];
  const curatedOnly = values.filter((v) => !derivedValues.includes(v));
  const removedFromDerived = derivedValues.filter((v) => !values.includes(v));
  const origin: MatchProfileFieldView["origin"] =
    values.length === 0
      ? "empty"
      : curatedOnly.length === 0
        ? "derived"
        : curatedOnly.length === values.length
          ? "curated"
          : "mixed";
  return {
    key,
    label: MATCH_PROFILE_FIELD_LABELS[key],
    values,
    derivedValues,
    curatedOnly,
    removedFromDerived,
    origin,
  };
}

/** Vollständiges Ansichtsmodell des Matching-Profils eines Falls. */
export function buildProfilePanelModel(
  source: PracticeCaseSource,
  index: PracticeCaseMatchIndex | null = null,
): MatchProfilePanelModel {
  const profile = defaultProfileMapper.resolve(source);
  const derivedProfile = defaultProfileMapper.derive(source);
  const readiness = defaultReadinessCalculator.calculate(source, profile);
  const validation = defaultProfileValidator.validate(profile);
  const contentHash = hashOf(profile);

  const entry = index?.entries.find((e) => e.caseId === source.id) ?? null;
  const skip = index?.skipped.find((s) => s.caseId === source.id) ?? null;
  const state: MatchIndexStatusView["state"] = entry
    ? entry.profileHash === contentHash
      ? "indexed"
      : "stale"
    : skip
      ? "skipped"
      : "notIndexed";

  const matchingEnabled =
    (source.curatedProfile as { matchingEnabled?: boolean } | null)?.matchingEnabled !== false;

  return {
    caseId: source.id,
    title: source.title,
    profile,
    derivedProfile,
    curated: !!source.curatedProfile,
    matchingEnabled,
    fields: (Object.keys(MATCH_PROFILE_FIELD_LABELS) as MatchProfileFieldKey[]).map((key) =>
      fieldView(key, profile, derivedProfile),
    ),
    readiness,
    issues: validation.issues,
    conflicts: validation.issues.filter(
      (i) => i.code === "signal_conflict" || i.code === "duplicate_entry",
    ),
    missingRequired: readiness.checks
      .filter((c) => c.required && !c.passed)
      .map((c) => ({ id: c.id, label: c.label, hint: c.hint })),
    indexStatus: {
      contentHash,
      indexedHash: entry?.profileHash ?? null,
      indexedAt: entry?.indexedAt ?? null,
      state,
      stateLabel: STATE_LABELS[state],
      indexHash: index?.indexHash ?? null,
      indexVersion: index?.indexVersion ?? null,
      skipDetails: skip?.details ?? [],
    },
    links: {
      legal: source.legalSectionIds.length,
      templates: source.templateIds.length,
      keywords: source.keywords.length,
      decisionTree: source.hasDecisionTree,
    },
  };
}
