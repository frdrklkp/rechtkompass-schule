// Query- und Mutation-Hooks für den Editorial-Bereich.
// Kapselt EditorialQueryService + EditorialWorkflowService mit
// React-Query. Kein Frontend-Code darf supabase.rpc direkt nutzen.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  EditorialQueryService,
  EditorialWorkflowService,
  editorialQueryKeys,
  invalidationKeysAfterWorkflow,
  isEditorialError,
  type CaseFilters,
  type Pagination,
  type Sorting,
  type CaseReviewRow,
  type DashboardMetrics,
  type EditorialCaseRow,
  type CaseEventRow,
  type CaseVersionRow,
  type CaseLegalReviewFlagRow,
} from "@/services/editorial";
import type {
  ArchiveInput,
  DecideReviewInput,
  PublishInput,
  ReactivateInput,
  RevertToDraftInput,
  SubmitForReviewInput,
} from "@/services/editorial/EditorialWorkflowService";

// -------- lesende Hooks --------

export function useEditorialUserContext() {
  return useQuery({
    queryKey: editorialQueryKeys.userContext(),
    queryFn: () => EditorialQueryService.getCurrentUserEditorialContext(),
    staleTime: 60_000,
  });
}

export function useDashboardMetrics(
  userId: string | null,
  opts?: UseQueryOptions<DashboardMetrics>,
) {
  return useQuery<DashboardMetrics>({
    queryKey: editorialQueryKeys.dashboard(),
    queryFn: () => EditorialQueryService.getDashboardMetrics(userId),
    ...opts,
  });
}

export function useEditorialCases(
  filters: CaseFilters,
  pagination: Pagination,
  sorting: Sorting,
) {
  return useQuery({
    queryKey: editorialQueryKeys.casesList(filters, pagination, sorting),
    queryFn: () =>
      EditorialQueryService.getCases(filters, pagination, sorting),
  });
}

export function useEditorialCase(caseId: string | undefined) {
  return useQuery<EditorialCaseRow | null>({
    queryKey: caseId ? editorialQueryKeys.case(caseId) : ["editorial", "case", "none"],
    queryFn: () =>
      caseId ? EditorialQueryService.getCaseById(caseId) : Promise.resolve(null),
    enabled: !!caseId,
  });
}

export function useCaseVersions(caseId: string | undefined) {
  return useQuery<CaseVersionRow[]>({
    queryKey: caseId
      ? editorialQueryKeys.caseVersions(caseId)
      : ["editorial", "versions", "none"],
    queryFn: () =>
      caseId ? EditorialQueryService.getCaseVersions(caseId) : Promise.resolve([]),
    enabled: !!caseId,
  });
}

export function useCaseReviews(caseId: string | undefined) {
  return useQuery<CaseReviewRow[]>({
    queryKey: caseId
      ? editorialQueryKeys.caseReviews(caseId)
      : ["editorial", "reviews", "none"],
    queryFn: () =>
      caseId ? EditorialQueryService.getCaseReviews(caseId) : Promise.resolve([]),
    enabled: !!caseId,
  });
}

export function useCaseEvents(caseId: string | undefined) {
  return useQuery<CaseEventRow[]>({
    queryKey: caseId
      ? editorialQueryKeys.caseEvents(caseId)
      : ["editorial", "events", "none"],
    queryFn: () =>
      caseId ? EditorialQueryService.getCaseEvents(caseId) : Promise.resolve([]),
    enabled: !!caseId,
  });
}

export function useCaseLegalFlags(caseId: string | undefined) {
  return useQuery<CaseLegalReviewFlagRow[]>({
    queryKey: caseId
      ? editorialQueryKeys.caseLegalFlags(caseId)
      : ["editorial", "legal-flags", "none"],
    queryFn: () =>
      caseId
        ? EditorialQueryService.getLegalReviewFlags(caseId)
        : Promise.resolve([]),
    enabled: !!caseId,
  });
}

export function useMyReviews(
  view: "open" | "assigned_to_me" | "unassigned" | "decided",
  userId: string | null,
) {
  return useQuery({
    queryKey: editorialQueryKeys.reviewsMine({ view, userId }),
    queryFn: () => EditorialQueryService.getMyReviews({ view, userId }),
  });
}

// -------- Mutations --------

function useWorkflowInvalidation() {
  const qc = useQueryClient();
  return async (caseId: string) => {
    const keys = invalidationKeysAfterWorkflow(caseId);
    await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
  };
}

function handleError(err: unknown, fallback: string) {
  const msg = isEditorialError(err) ? err.userMessage : fallback;
  toast.error(msg);
  return err;
}

export function useSubmitForReview() {
  const invalidate = useWorkflowInvalidation();
  return useMutation({
    mutationFn: (input: SubmitForReviewInput) =>
      EditorialWorkflowService.submitForReview(input),
    onSuccess: async (_data, vars) => {
      await invalidate(vars.caseId);
      toast.success("Fall zur Prüfung eingereicht.");
    },
    onError: (err) => handleError(err, "Einreichung fehlgeschlagen."),
  });
}

export function useDecideReview(caseId: string | null) {
  const invalidate = useWorkflowInvalidation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DecideReviewInput) =>
      EditorialWorkflowService.decideReview(input),
    onSuccess: async () => {
      if (caseId) await invalidate(caseId);
      await qc.invalidateQueries({ queryKey: editorialQueryKeys.reviewsMine() });
      await qc.invalidateQueries({ queryKey: editorialQueryKeys.dashboard() });
      toast.success("Reviewentscheidung gespeichert.");
    },
    onError: (err) => handleError(err, "Reviewentscheidung fehlgeschlagen."),
  });
}

export function usePublish() {
  const invalidate = useWorkflowInvalidation();
  return useMutation({
    mutationFn: (input: PublishInput) => EditorialWorkflowService.publish(input),
    onSuccess: async (_d, vars) => {
      await invalidate(vars.caseId);
      toast.success("Fall veröffentlicht.");
    },
    onError: (err) => handleError(err, "Veröffentlichung fehlgeschlagen."),
  });
}

export function useArchive() {
  const invalidate = useWorkflowInvalidation();
  return useMutation({
    mutationFn: (input: ArchiveInput) => EditorialWorkflowService.archive(input),
    onSuccess: async (_d, vars) => {
      await invalidate(vars.caseId);
      toast.success("Fall archiviert.");
    },
    onError: (err) => handleError(err, "Archivierung fehlgeschlagen."),
  });
}

export function useReactivate() {
  const invalidate = useWorkflowInvalidation();
  return useMutation({
    mutationFn: (input: ReactivateInput) =>
      EditorialWorkflowService.reactivate(input),
    onSuccess: async (_d, vars) => {
      await invalidate(vars.caseId);
      toast.success("Fall reaktiviert.");
    },
    onError: (err) => handleError(err, "Reaktivierung fehlgeschlagen."),
  });
}

export function useRevertToDraft() {
  const invalidate = useWorkflowInvalidation();
  return useMutation({
    mutationFn: (input: RevertToDraftInput) =>
      EditorialWorkflowService.revertToDraft(input),
    onSuccess: async (_d, vars) => {
      await invalidate(vars.caseId);
      toast.success("Fall auf Entwurf zurückgesetzt.");
    },
    onError: (err) => handleError(err, "Zurücksetzen fehlgeschlagen."),
  });
}
