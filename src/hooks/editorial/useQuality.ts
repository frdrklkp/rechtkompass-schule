// React-Query-Hooks für die Qualitätsplattform.

import { useQuery } from "@tanstack/react-query";
import {
  EditorialQualityQueryService,
  editorialQueryKeys,
  type QualityCaseListInput,
} from "@/services/editorial";

export function useCaseQuality(caseId: string | undefined) {
  return useQuery({
    queryKey: caseId
      ? editorialQueryKeys.quality.case(caseId)
      : ["editorial", "quality", "case", "none"],
    queryFn: () =>
      caseId
        ? EditorialQualityQueryService.assessCase(caseId)
        : Promise.resolve(null),
    enabled: !!caseId,
    staleTime: 30_000,
  });
}

export function useQualityCases(input: QualityCaseListInput) {
  return useQuery({
    queryKey: editorialQueryKeys.quality.cases({
      filters: input.filters,
      pagination: input.pagination,
      sorting: input.sorting,
    }),
    queryFn: () => EditorialQualityQueryService.assessCases(input),
    staleTime: 15_000,
  });
}

export function useQualityDashboard() {
  return useQuery({
    queryKey: editorialQueryKeys.quality.dashboard(),
    queryFn: () => EditorialQualityQueryService.getQualityDashboardMetrics(),
    staleTime: 30_000,
  });
}

export function usePublishingQueue(
  view: "ready" | "warnings" | "blocked" | "recent",
) {
  return useQuery({
    queryKey: editorialQueryKeys.quality.publishing(view),
    queryFn: () => EditorialQualityQueryService.getPublishingQueue(view),
    staleTime: 15_000,
  });
}

export function useLegalQualityOverview() {
  return useQuery({
    queryKey: editorialQueryKeys.quality.legal(),
    queryFn: () => EditorialQualityQueryService.getLegalQualityOverview(),
    staleTime: 30_000,
  });
}

export function useReviewAnalytics() {
  return useQuery({
    queryKey: editorialQueryKeys.quality.reviews(),
    queryFn: () => EditorialQualityQueryService.getReviewAnalytics(),
    staleTime: 60_000,
  });
}

export function useEditorialHealthInsights() {
  return useQuery({
    queryKey: editorialQueryKeys.quality.health(),
    queryFn: () => EditorialQualityQueryService.getEditorialHealthInsights(),
    staleTime: 30_000,
  });
}
