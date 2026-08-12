/**
 * Baut ausgehende Suchanfragen (RetrievalQuery) aus Roh-Input.
 * Kein Netzwerkzugriff, keine DB-Aufrufe.
 */
import { DEFAULT_RETRIEVAL_CONFIG, type RetrievalConfig } from "./config";
import { QueryNormalizer } from "./QueryNormalizer";
import type { RetrievalFilters, RetrievalQuery, SearchType } from "./types";

export interface BuildQueryInput {
  query: string;
  filters?: RetrievalFilters;
  limit?: number;
  offset?: number;
  searchType?: SearchType;
  debug?: boolean;
  config?: Partial<RetrievalConfig>;
}

export const SearchQueryBuilder = {
  build(input: BuildQueryInput): RetrievalQuery {
    const cfg = { ...DEFAULT_RETRIEVAL_CONFIG, ...(input.config ?? {}) };
    const normalized = QueryNormalizer.normalize(input.query ?? "");
    const rawLimit = Number.isFinite(input.limit) ? Number(input.limit) : cfg.defaultLimit;
    const limit = Math.max(1, Math.min(cfg.maxLimit, rawLimit));
    const offset = Math.max(0, Number.isFinite(input.offset) ? Number(input.offset) : 0);
    return {
      rawQuery: normalized.original,
      normalizedQuery: normalized.normalized,
      keywords: normalized.keywords,
      expansions: normalized.expansions,
      language: "de",
      filters: {
        activeOnly: true,
        ...(input.filters ?? {}),
      },
      limit,
      offset,
      searchType: input.searchType ?? "hybrid",
      debug: Boolean(input.debug),
    };
  },
};
