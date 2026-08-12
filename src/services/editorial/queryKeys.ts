// Zentrale Query-Keys für Editorial-Bereiche.
// Alle Editorial-Hooks nutzen ausschließlich diese Keys, damit die
// Invalidierung nach Workflowaktionen zentral kontrolliert werden kann.

import type { CaseFilters, Pagination, Sorting } from "./types";

export const editorialQueryKeys = {
  all: ["editorial"] as const,
  dashboard: () => [...editorialQueryKeys.all, "dashboard"] as const,
  cases: () => [...editorialQueryKeys.all, "cases"] as const,
  casesList: (
    filters: CaseFilters,
    pagination: Pagination,
    sorting: Sorting,
  ) =>
    [
      ...editorialQueryKeys.cases(),
      { filters, pagination, sorting },
    ] as const,
  case: (id: string) => [...editorialQueryKeys.all, "case", id] as const,
  caseVersions: (id: string) =>
    [...editorialQueryKeys.case(id), "versions"] as const,
  caseReviews: (id: string) =>
    [...editorialQueryKeys.case(id), "reviews"] as const,
  caseEvents: (id: string) =>
    [...editorialQueryKeys.case(id), "events"] as const,
  caseLegalFlags: (id: string) =>
    [...editorialQueryKeys.case(id), "legal-flags"] as const,
  reviewsMine: (filters?: Record<string, unknown>) =>
    [
      ...editorialQueryKeys.all,
      "reviews",
      "mine",
      filters ?? {},
    ] as const,
  userContext: () => [...editorialQueryKeys.all, "user-context"] as const,
  quality: {
    all: () => [...editorialQueryKeys.all, "quality"] as const,
    dashboard: () =>
      [...editorialQueryKeys.all, "quality", "dashboard"] as const,
    cases: (params?: Record<string, unknown>) =>
      [...editorialQueryKeys.all, "quality", "cases", params ?? {}] as const,
    case: (id: string) =>
      [...editorialQueryKeys.all, "quality", "case", id] as const,
    publishing: (view: string) =>
      [...editorialQueryKeys.all, "quality", "publishing", view] as const,
    legal: () => [...editorialQueryKeys.all, "quality", "legal"] as const,
    reviews: () => [...editorialQueryKeys.all, "quality", "reviews"] as const,
    health: () => [...editorialQueryKeys.all, "quality", "health"] as const,
  },
};

export function invalidationKeysAfterWorkflow(caseId: string) {
  return [
    editorialQueryKeys.dashboard(),
    editorialQueryKeys.cases(),
    editorialQueryKeys.case(caseId),
    editorialQueryKeys.caseVersions(caseId),
    editorialQueryKeys.caseReviews(caseId),
    editorialQueryKeys.caseEvents(caseId),
    editorialQueryKeys.reviewsMine(),
    // Quality-Views hängen an denselben Fakten (Fall, Reviews, Flags).
    editorialQueryKeys.quality.case(caseId),
    editorialQueryKeys.quality.dashboard(),
    editorialQueryKeys.quality.cases(),
    editorialQueryKeys.quality.publishing("ready"),
    editorialQueryKeys.quality.publishing("warnings"),
    editorialQueryKeys.quality.publishing("blocked"),
    editorialQueryKeys.quality.publishing("recent"),
    editorialQueryKeys.quality.legal(),
    editorialQueryKeys.quality.reviews(),
    editorialQueryKeys.quality.health(),
  ] as const;
}
