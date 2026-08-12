// Hooks für Legal Knowledge (Query + Mutations).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LegalSourceRegistryService,
  LegalIngestionService,
  type CreateLegalSourceInput,
  type LegalSourceListFilter,
  type LegalSourceLifecycle,
  type LegalSourceVerification,
  type LegalIngestionRequest,
} from "@/services/legal-knowledge";
import { LegalIngestionRepository } from "@/services/legal-knowledge/repositories/LegalIngestionRepository";
import { legalKnowledgeQueryKeys } from "./queryKeys";

export function useLegalSources(filter?: LegalSourceListFilter) {
  return useQuery({
    queryKey: legalKnowledgeQueryKeys.sourcesList(filter),
    queryFn: () => LegalSourceRegistryService.list(filter),
  });
}

export function useLegalSource(id: string | undefined) {
  return useQuery({
    queryKey: id ? legalKnowledgeQueryKeys.source(id) : ["legal-knowledge", "source", "none"],
    queryFn: () => LegalSourceRegistryService.get(id as string),
    enabled: !!id,
  });
}

export function useLegalSourceVersions(id: string | undefined) {
  return useQuery({
    queryKey: id ? legalKnowledgeQueryKeys.sourceVersions(id) : ["legal-knowledge", "versions", "none"],
    queryFn: () => LegalSourceRegistryService.versionsOf(id as string),
    enabled: !!id,
  });
}

export function useLegalSourceReviewEvents(id: string | undefined) {
  return useQuery({
    queryKey: id ? legalKnowledgeQueryKeys.sourceReviewEvents(id) : ["legal-knowledge", "events", "none"],
    queryFn: () => LegalSourceRegistryService.reviewEvents(id as string),
    enabled: !!id,
  });
}

export function useLegalIngestionJobs() {
  return useQuery({
    queryKey: legalKnowledgeQueryKeys.ingestionJobs(),
    queryFn: () => LegalIngestionRepository.list(),
  });
}

export function useLegalIngestionJobsForSource(id: string | undefined) {
  return useQuery({
    queryKey: id ? legalKnowledgeQueryKeys.ingestionJobsForSource(id) : ["legal-knowledge", "jobs", "none"],
    queryFn: () => LegalIngestionRepository.listForSource(id as string),
    enabled: !!id,
  });
}

export function useRunLegalIngestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { request: LegalIngestionRequest; persistJob?: boolean }) =>
      LegalIngestionService.run(args.request, args.persistJob ?? false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.ingestionJobs() });
    },
  });
}

export function useCreateLegalSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLegalSourceInput) => LegalSourceRegistryService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.sources() });
    },
  });
}

export function useUpdateLegalSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<CreateLegalSourceInput> }) =>
      LegalSourceRegistryService.update(args.id, args.patch),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.source(vars.id) });
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.sources() });
    },
  });
}

export function useTransitionLegalSourceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; to: LegalSourceLifecycle; note?: string | null }) =>
      LegalSourceRegistryService.transitionStatus(args.id, args.to, args.note ?? null),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.source(vars.id) });
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.sourceReviewEvents(vars.id) });
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.sources() });
    },
  });
}

export function useSetLegalSourceVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; verification: LegalSourceVerification }) =>
      LegalSourceRegistryService.setVerification(args.id, args.verification),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.source(vars.id) });
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.sources() });
    },
  });
}

export function useCreateLegalSourceVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { ofSourceId: string; input: CreateLegalSourceInput }) =>
      LegalSourceRegistryService.createNewVersion(args.ofSourceId, args.input),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.sources() });
      qc.invalidateQueries({ queryKey: legalKnowledgeQueryKeys.sourceVersions(vars.ofSourceId) });
    },
  });
}
