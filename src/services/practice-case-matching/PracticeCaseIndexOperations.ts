/**
 * Sprint 4.6E – Kontrollierte Indexoperationen.
 *
 * Nutzt ausschließlich den bestehenden PracticeCaseIndexBuilder und den
 * Repository-Port. Es entsteht keine zweite Index-Implementierung: jede
 * Operation erzeugt ein vollständiges, reproduzierbares Indexobjekt.
 */
import { defaultIndexBuilder, indexHashOf, PracticeCaseIndexBuilder } from "./PracticeCaseIndexBuilder";
import { MATCHING_INDEX_VERSION, MATCHING_PROFILE_VERSION } from "./types";
import type {
  PracticeCaseIndexDelta,
  PracticeCaseIndexEntry,
  PracticeCaseIndexSkip,
  PracticeCaseMatchIndex,
  PracticeCaseSource,
} from "./types";

export interface PracticeCaseIndexPreview {
  /** Vorschau-Index; wird erst nach Bestätigung gespeichert. */
  next: PracticeCaseMatchIndex;
  delta: PracticeCaseIndexDelta;
  added: PracticeCaseIndexEntry[];
  changed: PracticeCaseIndexEntry[];
  unchanged: PracticeCaseIndexEntry[];
  removed: string[];
  skipped: PracticeCaseIndexSkip[];
  warnings: string[];
  errors: string[];
}

/** Vorschau berechnen, ohne den gespeicherten Index zu verändern. */
export function previewIndex(
  sources: PracticeCaseSource[],
  previous: PracticeCaseMatchIndex | null,
  builder: PracticeCaseIndexBuilder = defaultIndexBuilder,
): PracticeCaseIndexPreview {
  const next = builder.build(sources);
  const delta = builder.diff(previous, next);
  const byId = new Map(next.entries.map((e) => [e.caseId, e]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as PracticeCaseIndexEntry[];

  const warnings: string[] = [];
  const errors: string[] = [];
  for (const skip of next.skipped) {
    const text = `${skip.title}: ${skip.details.join(" · ") || skip.reason}`;
    if (skip.reason === "invalid_profile") errors.push(text);
    else warnings.push(text);
  }
  if (next.entries.length === 0) errors.push("Kein Praxisfall ist indexierbar.");

  return {
    next,
    delta,
    added: pick(delta.added),
    changed: pick(delta.changed),
    unchanged: pick(delta.unchanged),
    removed: delta.removed,
    skipped: next.skipped,
    warnings,
    errors,
  };
}

/**
 * Nur veraltete, neue und entfernte Einträge übernehmen. Unveränderte Einträge
 * behalten ihren ursprünglichen Indexzeitpunkt.
 */
export function applyStaleOnly(
  preview: PracticeCaseIndexPreview,
  previous: PracticeCaseMatchIndex | null,
): PracticeCaseMatchIndex {
  const previousById = new Map((previous?.entries ?? []).map((e) => [e.caseId, e]));
  const entries = preview.next.entries.map((entry) => {
    const before = previousById.get(entry.caseId);
    return before && before.profileHash === entry.profileHash ? before : entry;
  });
  entries.sort((a, b) => a.caseId.localeCompare(b.caseId));
  return { ...preview.next, entries, indexHash: indexHashOf(entries) };
}

/** Einen einzelnen Praxisfall neu indexieren, alle anderen Einträge bleiben unverändert. */
export function reindexCase(
  previous: PracticeCaseMatchIndex | null,
  source: PracticeCaseSource,
  builder: PracticeCaseIndexBuilder = defaultIndexBuilder,
): { index: PracticeCaseMatchIndex; indexed: boolean; skipped: PracticeCaseIndexSkip | null } {
  const single = builder.build([source]);
  const entry = single.entries[0] ?? null;
  const skipped = single.skipped[0] ?? null;

  const base = previous ?? {
    indexVersion: MATCHING_INDEX_VERSION,
    profileVersion: MATCHING_PROFILE_VERSION,
    builtAt: single.builtAt,
    indexHash: "",
    entries: [],
    skipped: [],
    stats: single.stats,
  };

  const entries = base.entries.filter((e) => e.caseId !== source.id);
  if (entry) entries.push(entry);
  entries.sort((a, b) => a.caseId.localeCompare(b.caseId));

  const skips = base.skipped.filter((s) => s.caseId !== source.id);
  if (skipped) skips.push(skipped);
  skips.sort((a, b) => a.caseId.localeCompare(b.caseId));

  return {
    index: {
      ...base,
      builtAt: single.builtAt,
      entries,
      skipped: skips,
      indexHash: indexHashOf(entries),
    },
    indexed: !!entry,
    skipped,
  };
}

export interface IndexVerification {
  ok: boolean;
  /** Hash, der sich aus einem Neuaufbau der Quelldaten ergibt. */
  expectedHash: string;
  actualHash: string;
  versionOk: boolean;
  issues: string[];
}

/** Prüft, ob der gespeicherte Index dem Quellbestand entspricht. */
export function verifyIndex(
  index: PracticeCaseMatchIndex | null,
  sources: PracticeCaseSource[],
  builder: PracticeCaseIndexBuilder = defaultIndexBuilder,
): IndexVerification {
  const rebuilt = builder.build(sources);
  const issues: string[] = [];
  if (!index) {
    return {
      ok: false,
      expectedHash: rebuilt.indexHash,
      actualHash: "",
      versionOk: false,
      issues: ["Es ist kein Index gespeichert."],
    };
  }
  const versionOk =
    index.indexVersion === MATCHING_INDEX_VERSION && index.profileVersion === MATCHING_PROFILE_VERSION;
  if (!versionOk) issues.push("Index- oder Profilversion weicht ab. Neuaufbau erforderlich.");
  if (index.indexHash !== rebuilt.indexHash)
    issues.push("Indexhash weicht vom Quellbestand ab. Einträge sind veraltet.");
  const indexed = new Set(index.entries.map((e) => e.caseId));
  for (const entry of rebuilt.entries) {
    if (!indexed.has(entry.caseId)) issues.push(`Nicht indexiert: ${entry.title}`);
  }
  const expected = new Set(rebuilt.entries.map((e) => e.caseId));
  for (const entry of index.entries) {
    if (!expected.has(entry.caseId)) issues.push(`Nicht mehr indexierbar: ${entry.title}`);
  }
  return {
    ok: issues.length === 0,
    expectedHash: rebuilt.indexHash,
    actualHash: index.indexHash,
    versionOk,
    issues,
  };
}

/** Auditbericht als JSON-Text (Export ohne zusätzliche Abhängigkeiten). */
export function buildAuditReport(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 2);
}
