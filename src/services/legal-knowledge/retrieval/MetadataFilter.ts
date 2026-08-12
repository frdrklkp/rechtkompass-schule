/**
 * Deterministische Metadatenfilter. Wirkt auf CandidateBundle.
 */
import type { PersistedChunk } from "../embeddings/repositories/InMemoryRepositories";
import type { RetrievalFilters } from "./types";

function s(v: unknown): string { return (v ?? "").toString().toLowerCase(); }

function matchesString(val: unknown, want?: string): boolean {
  if (!want) return true;
  return s(val) === s(want) || s(val).includes(s(want));
}

function matchesList(val: unknown, want?: string[]): boolean {
  if (!want || want.length === 0) return true;
  const v = s(val);
  return want.some((w) => s(w) === v);
}

export const MetadataFilter = {
  apply<T extends { chunk: PersistedChunk }>(items: T[], filters: RetrievalFilters): { kept: T[]; removed: T[] } {
    const kept: T[] = [];
    const removed: T[] = [];
    for (const item of items) {
      if (MetadataFilter.matches(item.chunk, filters)) kept.push(item); else removed.push(item);
    }
    return { kept, removed };
  },

  matches(chunk: PersistedChunk, filters: RetrievalFilters): boolean {
    const md = chunk.metadata ?? {};
    if (filters.activeOnly && chunk.active === false) return false;
    if (filters.sourceIds && filters.sourceIds.length > 0) {
      if (!chunk.sourceId || !filters.sourceIds.includes(chunk.sourceId)) return false;
    }
    if (!matchesString(md.law ?? md.sourceLabel, filters.law)) return false;
    if (!matchesString(md.jurisdiction, filters.jurisdiction)) return false;
    if (!matchesString(md.authority, filters.authority)) return false;
    if (!matchesString(md.version, filters.version)) return false;
    if (!matchesList(md.reviewStatus, filters.reviewStatus)) return false;
    if (!matchesList(md.lifecycle, filters.lifecycle)) return false;
    if (!matchesList((md as Record<string, unknown>).documentType, filters.documentType)) return false;
    if (!matchesList(md.chunkStrategy, filters.chunkTypes)) return false;
    if (!matchesString(md.paragraph, filters.paragraph)) return false;
    if (!matchesString(md.article, filters.article)) return false;
    if (filters.validAtDate) {
      const from = (md as Record<string, unknown>).validFrom as string | undefined;
      const to = (md as Record<string, unknown>).validTo as string | undefined;
      const at = filters.validAtDate;
      if (from && at < from) return false;
      if (to && at > to) return false;
    }
    return true;
  },

  /** Blocklist für ungültige/verworfene Quellen. */
  isBlocked(chunk: PersistedChunk): boolean {
    const md = chunk.metadata ?? {};
    const life = s(md.lifecycle);
    return life === "rejected" || life === "archived";
  },
};
