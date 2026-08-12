/**
 * Sprint 4.6E – Zentrale Fassade der Practice-Case-Matching-Grundlage.
 * Baut den Index reproduzierbar auf und ermittelt Treffer zu einem SituationCase.
 */
import type { SituationCase } from "@/services/situation-analyzer";
import { hashOf } from "./normalize";
import { defaultIndexBuilder, PracticeCaseIndexBuilder } from "./PracticeCaseIndexBuilder";
import { defaultFeatureExtractor, SituationFeatureExtractor } from "./SituationFeatureExtractor";
import { defaultMatchScorer, PracticeCaseMatchScorer } from "./PracticeCaseMatchScorer";
import { PracticeCaseMatchEventBus } from "./PracticeCaseMatchEventBus";
import {
  InMemoryPracticeCaseIndexStore,
  type PracticeCaseIndexStorePort,
} from "./PracticeCaseIndexStore";
import { MATCH_THRESHOLDS } from "./weights";
import type {
  PracticeCaseIndexDelta,
  PracticeCaseMatch,
  PracticeCaseMatchIndex,
  PracticeCaseMatchResult,
  PracticeCaseSource,
  SituationMatchFeatures,
} from "./types";

export class PracticeCaseMatchingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeCaseMatchingError";
  }
}

export interface PracticeCaseMatchingEngineOptions {
  builder?: PracticeCaseIndexBuilder;
  extractor?: SituationFeatureExtractor;
  scorer?: PracticeCaseMatchScorer;
  store?: PracticeCaseIndexStorePort;
  events?: PracticeCaseMatchEventBus;
  maxResults?: number;
}

export class PracticeCaseMatchingEngine {
  readonly events: PracticeCaseMatchEventBus;
  private readonly builder: PracticeCaseIndexBuilder;
  private readonly extractor: SituationFeatureExtractor;
  private readonly scorer: PracticeCaseMatchScorer;
  private readonly store: PracticeCaseIndexStorePort;
  private readonly maxResults: number;

  constructor(options: PracticeCaseMatchingEngineOptions = {}) {
    this.builder = options.builder ?? defaultIndexBuilder;
    this.extractor = options.extractor ?? defaultFeatureExtractor;
    this.scorer = options.scorer ?? defaultMatchScorer;
    this.store = options.store ?? new InMemoryPracticeCaseIndexStore();
    this.events = options.events ?? new PracticeCaseMatchEventBus();
    this.maxResults = options.maxResults ?? MATCH_THRESHOLDS.MAX_RESULTS;
  }

  /** Analyse ohne Indexveränderung. */
  audit(sources: PracticeCaseSource[]) {
    return this.builder.audit(sources);
  }

  /** Index vollständig neu aufbauen und speichern. */
  rebuildIndex(sources: PracticeCaseSource[]): { index: PracticeCaseMatchIndex; delta: PracticeCaseIndexDelta } {
    const previous = this.store.load();
    const index = this.builder.build(sources);
    const delta = this.builder.diff(previous, index);
    this.store.save(index);
    this.events.emit(previous ? "MatchIndexUpdated" : "MatchIndexBuilt", {
      indexed: index.stats.indexedCount,
      skipped: index.stats.skippedCount,
      indexHash: index.indexHash,
      added: delta.added.length,
      changed: delta.changed.length,
      removed: delta.removed.length,
    });
    return { index, delta };
  }

  getIndex(): PracticeCaseMatchIndex | null {
    return this.store.load();
  }

  /**
   * Einen bereits berechneten Index speichern (kontrollierte Teilaktualisierung
   * oder Einzelfall-Reindexierung). Der Index muss vom IndexBuilder stammen.
   */
  saveIndex(index: PracticeCaseMatchIndex, reason = "MatchIndexUpdated"): PracticeCaseMatchIndex {
    this.store.save(index);
    this.events.emit(reason === "MatchIndexBuilt" ? "MatchIndexBuilt" : "MatchIndexUpdated", {
      indexed: index.entries.length,
      skipped: index.skipped.length,
      indexHash: index.indexHash,
    });
    return index;
  }

  clearIndex(): void {
    this.store.clear();
  }


  /** Merkmale eines Sachverhalts ableiten. */
  extract(situation: SituationCase): SituationMatchFeatures {
    return this.extractor.extract(situation);
  }

  /** Passende Praxisfälle zu einem strukturierten Sachverhalt ermitteln. */
  match(situation: SituationCase): PracticeCaseMatchResult {
    const index = this.store.load();
    if (!index) throw new PracticeCaseMatchingError("Matching-Index ist nicht aufgebaut.");

    const features = this.extractor.extract(situation);
    const scored = index.entries.map((entry) => this.scorer.score(entry, features));
    const excluded = scored.filter((m) => m.excluded);
    const matches = scored
      .filter((m) => !m.excluded && m.level !== "none")
      .sort(sortMatches)
      .slice(0, this.maxResults);

    const limitations: string[] = [];
    if (features.unknownAspects.length > 0) {
      limitations.push(`Unklare Angaben: ${features.unknownAspects.slice(0, 5).join(", ")}`);
    }
    if (features.completionPercentage < 100) {
      limitations.push(`Sachverhalt zu ${features.completionPercentage} % erfasst.`);
    }
    if (index.stats.approvedCount === 0) {
      limitations.push("Kein Fallprofil ist redaktionell bestätigt.");
    }
    if (matches.length === 0) {
      limitations.push("Kein Praxisfall erreicht die Mindestübereinstimmung.");
    }

    const result: PracticeCaseMatchResult = {
      situationId: situation.caseId,
      matchedAt: new Date().toISOString(),
      inputHash: hashOf(features),
      indexHash: index.indexHash,
      indexVersion: index.indexVersion,
      matches,
      excluded,
      limitations,
      features,
      stats: {
        evaluated: scored.length,
        excludedCount: excluded.length,
        strong: matches.filter((m) => m.level === "strong").length,
        moderate: matches.filter((m) => m.level === "moderate").length,
        weak: matches.filter((m) => m.level === "weak").length,
      },
    };

    this.events.emit(matches.length > 0 ? "MatchingExecuted" : "MatchingSkipped", {
      situationId: situation.caseId,
      matches: matches.length,
      evaluated: scored.length,
    });
    return result;
  }

  /** Prüft, ob ein Ergebnis gegenüber Sachverhalt und Index veraltet ist. */
  isStale(result: PracticeCaseMatchResult, situation: SituationCase): boolean {
    const index = this.store.load();
    if (!index) return true;
    if (index.indexHash !== result.indexHash) return true;
    return hashOf(this.extractor.extract(situation)) !== result.inputHash;
  }
}

function sortMatches(a: PracticeCaseMatch, b: PracticeCaseMatch): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return a.caseId.localeCompare(b.caseId);
}
