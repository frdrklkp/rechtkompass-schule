/**
 * Sprint 4.6E – Bestandsaudit über den Praxisfallbestand.
 *
 * Alle Werte werden ausschließlich aus den übergebenen Quelldaten berechnet.
 * Es gibt keine fest codierten Zahlen: wächst der Bestand, wachsen die Werte.
 */
import { defaultProfileMapper, type PracticeCaseMatchProfileMapper } from "./PracticeCaseMatchProfileMapper";
import { defaultReadinessCalculator, type MatchReadinessCalculator } from "./MatchReadinessCalculator";
import { defaultProfileValidator, type MatchProfileValidator } from "./MatchProfileValidator";
import { hashOf, unique } from "./normalize";
import type {
  MatchProfileStatus,
  MatchProfileValidationResult,
  MatchReadinessLevel,
  MatchReadinessResult,
  MatchingProfile,
  PracticeCaseIndexEntry,
  PracticeCaseIndexSkip,
  PracticeCaseMatchIndex,
  PracticeCaseSource,
  PracticeCaseStatus,
} from "./types";

/** Indexzustand eines einzelnen Falls. */
export type CaseIndexState = "indexed" | "stale" | "notIndexed" | "skipped";

export interface PracticeCaseAuditRow {
  caseId: string;
  title: string;
  status: PracticeCaseStatus;
  category: string | null;
  profile: MatchingProfile;
  /** Rein aus den Falldaten abgeleitetes Profil (Vergleichsbasis). */
  derivedProfile: MatchingProfile;
  /** true, wenn ein redaktionell gepflegtes Profil vorliegt. */
  curated: boolean;
  readiness: MatchReadinessResult;
  validation: MatchProfileValidationResult;
  /** Hash des aktuell wirksamen Profils. */
  contentHash: string;
  /** Hash des im Index gespeicherten Profils, falls indexiert. */
  indexedHash: string | null;
  indexedAt: string | null;
  indexState: CaseIndexState;
  skipReason: PracticeCaseIndexSkip | null;
  warnings: string[];
  errors: string[];
  hasDecisionTree: boolean;
  legalCount: number;
  templateCount: number;
  keywordCount: number;
}

export interface PracticeCaseInventoryAudit {
  totalCases: number;
  publishedCases: number;
  byStatus: Array<{ status: PracticeCaseStatus; count: number }>;
  keywordLinkCount: number;
  legalLinkCount: number;
  templateLinkCount: number;
  withDecisionTree: number;
  withLegalSections: number;
  withTemplates: number;
  withKeywords: number;
  matchReady: number;
  notIndexable: number;
  indexedCount: number;
  staleCount: number;
  profileStatusDistribution: Array<{ status: MatchProfileStatus; count: number }>;
  readinessDistribution: Array<{ level: MatchReadinessLevel; count: number }>;
  categories: Array<{ category: string; count: number }>;
  indexHash: string | null;
  indexVersion: number | null;
  builtAt: string | null;
  /** Reproduzierbarer Hash über den Quellbestand (unabhängig vom Index). */
  inventoryHash: string;
}

const STATUS_ORDER: PracticeCaseStatus[] = ["draft", "review", "published", "archived"];
const PROFILE_STATUS_ORDER: MatchProfileStatus[] = ["derived", "draft", "review", "approved"];
const READINESS_ORDER: MatchReadinessLevel[] = ["ready", "partial", "notReady"];

export interface PracticeCaseAuditorOptions {
  mapper?: PracticeCaseMatchProfileMapper;
  readiness?: MatchReadinessCalculator;
  validator?: MatchProfileValidator;
}

export class PracticeCaseAuditor {
  private readonly mapper: PracticeCaseMatchProfileMapper;
  private readonly readiness: MatchReadinessCalculator;
  private readonly validator: MatchProfileValidator;

  constructor(options: PracticeCaseAuditorOptions = {}) {
    this.mapper = options.mapper ?? defaultProfileMapper;
    this.readiness = options.readiness ?? defaultReadinessCalculator;
    this.validator = options.validator ?? defaultProfileValidator;
  }

  /** Eine Zeile je Praxisfall, inklusive Indexzustand. */
  rows(sources: PracticeCaseSource[], index: PracticeCaseMatchIndex | null): PracticeCaseAuditRow[] {
    const entries = new Map<string, PracticeCaseIndexEntry>(
      (index?.entries ?? []).map((e) => [e.caseId, e]),
    );
    const skips = new Map<string, PracticeCaseIndexSkip>(
      (index?.skipped ?? []).map((s) => [s.caseId, s]),
    );

    return sources
      .map((source) => {
        const profile = this.mapper.resolve(source);
        const derivedProfile = this.mapper.derive(source);
        const readiness = this.readiness.calculate(source, profile);
        const validation = this.validator.validate(profile);
        const contentHash = hashOf(profile);
        const entry = entries.get(source.id) ?? null;
        const skip = skips.get(source.id) ?? null;

        const indexState: CaseIndexState = entry
          ? entry.profileHash === contentHash
            ? "indexed"
            : "stale"
          : skip
            ? "skipped"
            : "notIndexed";

        const warnings = validation.issues
          .filter((i) => i.severity === "warning")
          .map((i) => i.message);
        const errors = validation.issues.filter((i) => i.severity === "error").map((i) => i.message);
        if (!readiness.indexable) {
          for (const check of readiness.checks) {
            if (check.required && !check.passed) errors.push(`${check.label}: ${check.hint}`);
          }
        }

        return {
          caseId: source.id,
          title: source.title,
          status: source.status,
          category: source.category,
          profile,
          derivedProfile,
          curated: !!source.curatedProfile,
          readiness,
          validation,
          contentHash,
          indexedHash: entry?.profileHash ?? null,
          indexedAt: entry?.indexedAt ?? null,
          indexState,
          skipReason: skip,
          warnings: unique(warnings),
          errors: unique(errors),
          hasDecisionTree: source.hasDecisionTree,
          legalCount: source.legalSectionIds.length,
          templateCount: source.templateIds.length,
          keywordCount: source.keywords.length,
        } satisfies PracticeCaseAuditRow;
      })
      .sort((a, b) => a.title.localeCompare(b.title, "de"));
  }

  /** Aggregierte Bestandskennzahlen. */
  inventory(
    sources: PracticeCaseSource[],
    index: PracticeCaseMatchIndex | null,
    rows?: PracticeCaseAuditRow[],
  ): PracticeCaseInventoryAudit {
    const list = rows ?? this.rows(sources, index);
    const count = <T>(items: T[], predicate: (item: T) => boolean) => items.filter(predicate).length;

    return {
      totalCases: sources.length,
      publishedCases: count(sources, (s) => s.status === "published"),
      byStatus: STATUS_ORDER.map((status) => ({
        status,
        count: count(sources, (s) => s.status === status),
      })).filter((s) => s.count > 0),
      keywordLinkCount: sources.reduce((sum, s) => sum + s.keywords.length, 0),
      legalLinkCount: sources.reduce((sum, s) => sum + s.legalSectionIds.length, 0),
      templateLinkCount: sources.reduce((sum, s) => sum + s.templateIds.length, 0),
      withDecisionTree: count(sources, (s) => s.hasDecisionTree),
      withLegalSections: count(sources, (s) => s.legalSectionIds.length > 0),
      withTemplates: count(sources, (s) => s.templateIds.length > 0),
      withKeywords: count(sources, (s) => s.keywords.length > 0),
      matchReady: count(list, (r) => r.readiness.indexable && r.status === "published"),
      notIndexable: count(list, (r) => !r.readiness.indexable),
      indexedCount: index?.entries.length ?? 0,
      staleCount: count(list, (r) => r.indexState === "stale"),
      profileStatusDistribution: PROFILE_STATUS_ORDER.map((status) => ({
        status,
        count: count(list, (r) => r.profile.status === status),
      })),
      readinessDistribution: READINESS_ORDER.map((level) => ({
        level,
        count: count(list, (r) => r.readiness.level === level),
      })),
      categories: unique(list.map((r) => r.category ?? "—"))
        .sort((a, b) => a.localeCompare(b, "de"))
        .map((category) => ({
          category,
          count: count(list, (r) => (r.category ?? "—") === category),
        })),
      indexHash: index?.indexHash ?? null,
      indexVersion: index?.indexVersion ?? null,
      builtAt: index?.builtAt ?? null,
      inventoryHash: hashOf(
        [...sources]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((s) => [s.id, s.status, hashOf(this.mapper.resolve(s))]),
      ),
    };
  }
}

export const defaultPracticeCaseAuditor = new PracticeCaseAuditor();

/* --------------------------------- Filter -------------------------------- */

export interface PracticeCaseAuditFilter {
  profileStatus?: MatchProfileStatus | "all";
  readiness?: MatchReadinessLevel | "all";
  indexable?: "all" | "yes" | "no";
  category?: string | "all";
  decisionTree?: "all" | "yes" | "no";
  legal?: "all" | "yes" | "no";
  templates?: "all" | "yes" | "no";
  indexState?: CaseIndexState | "all";
  warnings?: "all" | "only";
  errors?: "all" | "only";
  search?: string;
}

export const EMPTY_AUDIT_FILTER: PracticeCaseAuditFilter = {
  profileStatus: "all",
  readiness: "all",
  indexable: "all",
  category: "all",
  decisionTree: "all",
  legal: "all",
  templates: "all",
  indexState: "all",
  warnings: "all",
  errors: "all",
  search: "",
};

function yesNo(flag: boolean, mode: "all" | "yes" | "no" | undefined): boolean {
  if (!mode || mode === "all") return true;
  return mode === "yes" ? flag : !flag;
}

export function filterAuditRows(
  rows: PracticeCaseAuditRow[],
  filter: PracticeCaseAuditFilter,
): PracticeCaseAuditRow[] {
  const search = (filter.search ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.profileStatus && filter.profileStatus !== "all" && row.profile.status !== filter.profileStatus)
      return false;
    if (filter.readiness && filter.readiness !== "all" && row.readiness.level !== filter.readiness) return false;
    if (!yesNo(row.readiness.indexable, filter.indexable)) return false;
    if (filter.category && filter.category !== "all" && (row.category ?? "—") !== filter.category) return false;
    if (!yesNo(row.hasDecisionTree, filter.decisionTree)) return false;
    if (!yesNo(row.legalCount > 0, filter.legal)) return false;
    if (!yesNo(row.templateCount > 0, filter.templates)) return false;
    if (filter.indexState && filter.indexState !== "all" && row.indexState !== filter.indexState) return false;
    if (filter.warnings === "only" && row.warnings.length === 0) return false;
    if (filter.errors === "only" && row.errors.length === 0) return false;
    if (search && !row.title.toLowerCase().includes(search)) return false;
    return true;
  });
}
