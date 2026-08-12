/**
 * Sprint 4.6E – Aufbau und Fortschreibung des Matching-Index.
 * Der Index ist reproduzierbar: gleiche Quelldaten ergeben denselben indexHash.
 */
import { hashOf, unique } from "./normalize";
import { defaultProfileMapper, type PracticeCaseMatchProfileMapper } from "./PracticeCaseMatchProfileMapper";
import { defaultReadinessCalculator, type MatchReadinessCalculator } from "./MatchReadinessCalculator";
import { defaultProfileValidator, type MatchProfileValidator } from "./MatchProfileValidator";
import {
  MATCHING_INDEX_VERSION,
  MATCHING_PROFILE_VERSION,
  type PracticeCaseIndexDelta,
  type PracticeCaseIndexEntry,
  type PracticeCaseIndexSkip,
  type PracticeCaseIndexStats,
  type PracticeCaseMatchIndex,
  type PracticeCaseSource,
} from "./types";

/** Reproduzierbarer Hash über eine Menge von Indexeinträgen. EINZIGE Formel. */
export function indexHashOf(entries: PracticeCaseIndexEntry[]): string {
  return hashOf(
    [...entries]
      .sort((a, b) => a.caseId.localeCompare(b.caseId))
      .map((e) => [e.caseId, e.profileHash]),
  );
}

export interface PracticeCaseIndexBuilderOptions {
  mapper?: PracticeCaseMatchProfileMapper;
  readiness?: MatchReadinessCalculator;
  validator?: MatchProfileValidator;
  /** Fester Zeitstempel für reproduzierbare Tests. */
  now?: () => string;
}


export class PracticeCaseIndexBuilder {
  private readonly mapper: PracticeCaseMatchProfileMapper;
  private readonly readiness: MatchReadinessCalculator;
  private readonly validator: MatchProfileValidator;
  private readonly now: () => string;

  constructor(options: PracticeCaseIndexBuilderOptions = {}) {
    this.mapper = options.mapper ?? defaultProfileMapper;
    this.readiness = options.readiness ?? defaultReadinessCalculator;
    this.validator = options.validator ?? defaultProfileValidator;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Analysiert alle Fälle, ohne den Index zu verändern. */
  audit(sources: PracticeCaseSource[]) {
    return sources.map((source) => {
      const profile = this.mapper.resolve(source);
      const readiness = this.readiness.calculate(source, profile);
      const validation = this.validator.validate(profile);
      return { source, profile, readiness, validation };
    });
  }

  build(sources: PracticeCaseSource[]): PracticeCaseMatchIndex {
    const builtAt = this.now();
    const entries: PracticeCaseIndexEntry[] = [];
    const skipped: PracticeCaseIndexSkip[] = [];

    for (const source of sources) {
      const profile = this.mapper.resolve(source);
      const validation = this.validator.validate(profile);
      const readiness = this.readiness.calculate(source, profile);

      if (source.status !== "published") {
        skipped.push({
          caseId: source.id,
          title: source.title,
          reason: "not_published",
          details: [`Status „${source.status}“ ist nicht veröffentlicht.`],
        });
        continue;
      }
      if (!validation.valid) {
        skipped.push({
          caseId: source.id,
          title: source.title,
          reason: "invalid_profile",
          details: validation.issues.filter((i) => i.severity === "error").map((i) => i.message),
        });
        continue;
      }
      if (!readiness.indexable) {
        skipped.push({
          caseId: source.id,
          title: source.title,
          reason: "not_indexable",
          details: readiness.checks
            .filter((c) => c.required && !c.passed)
            .map((c) => `${c.label}: ${c.hint}`),
        });
        continue;
      }

      entries.push({
        caseId: source.id,
        title: source.title,
        status: source.status,
        ampel: source.ampel,
        profile,
        tokens: this.mapper.tokensFor(source, profile),
        readiness,
        profileHash: hashOf(profile),
        indexedAt: builtAt,
      });
    }

    entries.sort((a, b) => a.caseId.localeCompare(b.caseId));
    skipped.sort((a, b) => a.caseId.localeCompare(b.caseId));

    return {
      indexVersion: MATCHING_INDEX_VERSION,
      profileVersion: MATCHING_PROFILE_VERSION,
      builtAt,
      indexHash: indexHashOf(entries),

      entries,
      skipped,
      stats: this.stats(sources, entries, skipped),
    };
  }

  /** Delta zweier Indexstände (für kontrollierte Fortschreibung). */
  diff(previous: PracticeCaseMatchIndex | null, next: PracticeCaseMatchIndex): PracticeCaseIndexDelta {
    const before = new Map((previous?.entries ?? []).map((e) => [e.caseId, e.profileHash]));
    const after = new Map(next.entries.map((e) => [e.caseId, e.profileHash]));
    const added: string[] = [];
    const changed: string[] = [];
    const unchanged: string[] = [];
    for (const [caseId, hash] of after) {
      if (!before.has(caseId)) added.push(caseId);
      else if (before.get(caseId) !== hash) changed.push(caseId);
      else unchanged.push(caseId);
    }
    const removed = [...before.keys()].filter((caseId) => !after.has(caseId));
    return {
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort(),
      unchanged: unchanged.sort(),
      indexHashBefore: previous?.indexHash ?? null,
      indexHashAfter: next.indexHash,
    };
  }

  private stats(
    sources: PracticeCaseSource[],
    entries: PracticeCaseIndexEntry[],
    skipped: PracticeCaseIndexSkip[],
  ): PracticeCaseIndexStats {
    const categories = unique(entries.flatMap((e) => e.profile.categories)).sort();
    return {
      sourceCount: sources.length,
      publishedCount: sources.filter((s) => s.status === "published").length,
      indexedCount: entries.length,
      skippedCount: skipped.length,
      curatedCount: entries.filter((e) => e.profile.origin === "curated").length,
      derivedCount: entries.filter((e) => e.profile.origin === "derived").length,
      approvedCount: entries.filter((e) => e.profile.status === "approved").length,
      byCategory: categories.map((category) => ({
        category,
        count: entries.filter((e) => e.profile.categories.includes(category)).length,
      })),
      readiness: {
        ready: entries.filter((e) => e.readiness.level === "ready").length,
        partial: entries.filter((e) => e.readiness.level === "partial").length,
        notReady: entries.filter((e) => e.readiness.level === "notReady").length,
      },
    };
  }
}

export const defaultIndexBuilder = new PracticeCaseIndexBuilder();
