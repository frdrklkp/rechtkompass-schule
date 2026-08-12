/**
 * Sprint 4.6E – React-Anbindung der Matching-Grundlage.
 * Hält die Engine-Instanz, lädt Quelldaten und stellt Auditwerte bereit.
 */
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LocalStoragePracticeCaseIndexStore,
  PracticeCaseMatchingEngine,
  applyStaleOnly,
  defaultPracticeCaseAuditor,
  previewIndex,
  reindexCase,
  verifyIndex,
  type PracticeCaseAuditRow,
  type PracticeCaseIndexPreview,
  type PracticeCaseMatchIndex,
  type PracticeCaseSource,
} from "@/services/practice-case-matching";
import {
  fetchPracticeCaseSource,
  fetchPracticeCaseSources,
  saveCuratedMatchingProfile,
} from "@/lib/practiceCaseMatchingRepo";
import type { MatchingProfile } from "@/services/practice-case-matching/types";

/** Eine Engine-Instanz je Browser-Session mit LocalStorage-Persistenz. */
export const practiceCaseMatchingEngine = new PracticeCaseMatchingEngine({
  store: new LocalStoragePracticeCaseIndexStore(),
});

export const matchingQueryKeys = {
  sources: ["practice-case-matching", "sources"] as const,
  source: (caseId: string) => ["practice-case-matching", "source", caseId] as const,
};

export function usePracticeCaseSources() {
  return useQuery({
    queryKey: matchingQueryKeys.sources,
    queryFn: fetchPracticeCaseSources,
    staleTime: 30_000,
  });
}

export function usePracticeCaseSource(caseId: string | null) {
  return useQuery({
    queryKey: matchingQueryKeys.source(caseId ?? "none"),
    queryFn: () => fetchPracticeCaseSource(caseId as string),
    enabled: !!caseId && caseId !== "neu",
    staleTime: 15_000,
  });
}

/** Gespeicherter Index als Reaktionswert (LocalStorage ist nicht reaktiv). */
export function useMatchingIndex() {
  const [index, setIndex] = useState<PracticeCaseMatchIndex | null>(() =>
    typeof window === "undefined" ? null : practiceCaseMatchingEngine.getIndex(),
  );
  const refresh = useCallback(() => setIndex(practiceCaseMatchingEngine.getIndex()), []);
  return { index, setIndex, refresh };
}

export interface MatchingDashboardState {
  sources: PracticeCaseSource[];
  rows: PracticeCaseAuditRow[];
  inventory: ReturnType<typeof defaultPracticeCaseAuditor.inventory>;
  index: PracticeCaseMatchIndex | null;
  verification: ReturnType<typeof verifyIndex>;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  buildPreview: () => PracticeCaseIndexPreview;
  applyPreview: (preview: PracticeCaseIndexPreview, mode: "full" | "staleOnly") => void;
  reindexOne: (caseId: string) => void;
  resetIndex: () => void;
}

/** Zentraler Zustand für Auditübersicht und Indexsteuerung. */
export function useMatchingDashboard(): MatchingDashboardState {
  const sourcesQ = usePracticeCaseSources();
  const { index, setIndex, refresh: refreshIndex } = useMatchingIndex();
  const sources = sourcesQ.data ?? [];

  const rows = useMemo(
    () => defaultPracticeCaseAuditor.rows(sources, index),
    [sources, index],
  );
  const inventory = useMemo(
    () => defaultPracticeCaseAuditor.inventory(sources, index, rows),
    [sources, index, rows],
  );
  const verification = useMemo(() => verifyIndex(index, sources), [index, sources]);

  return {
    sources,
    rows,
    inventory,
    index,
    verification,
    loading: sourcesQ.isLoading,
    error: (sourcesQ.error as Error | null) ?? null,
    refresh: () => {
      void sourcesQ.refetch();
      refreshIndex();
    },
    buildPreview: () => previewIndex(sources, index),
    applyPreview: (preview, mode) => {
      const next = mode === "full" ? preview.next : applyStaleOnly(preview, index);
      practiceCaseMatchingEngine.saveIndex(next, index ? "MatchIndexUpdated" : "MatchIndexBuilt");
      setIndex(practiceCaseMatchingEngine.getIndex());
    },
    reindexOne: (caseId) => {
      const source = sources.find((s) => s.id === caseId);
      if (!source) return;
      const { index: next } = reindexCase(index, source);
      practiceCaseMatchingEngine.saveIndex(next);
      setIndex(practiceCaseMatchingEngine.getIndex());
    },
    resetIndex: () => {
      practiceCaseMatchingEngine.clearIndex();
      setIndex(null);
    },
  };
}

/** Kuratiertes Profil speichern und abhängige Abfragen auffrischen. */
export function useSaveMatchingProfile(caseId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: Partial<MatchingProfile> | null) =>
      saveCuratedMatchingProfile(caseId as string, profile),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: matchingQueryKeys.sources });
      if (caseId) void queryClient.invalidateQueries({ queryKey: matchingQueryKeys.source(caseId) });
    },
  });
}
