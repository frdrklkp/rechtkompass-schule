/**
 * Tier 3 – React-Anbindung der Kachel-Erfassung.
 * Der Hook hält den Orchestrator und spiegelt dessen Sitzung; Fachlogik
 * verbleibt vollständig im TileIntakeOrchestrator.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTileIntakeOrchestrator,
  TileIntakeError,
  type TileIntakeDocumentationResult,
  type TileIntakeMode,
  type TileIntakeSession,
} from "@/services/assistant/tile-intake";
import type {
  NewEvidence,
  NewMeasure,
  NewParticipant,
  NewWitness,
  SituationAnswerValue,
  SituationParticipant,
} from "@/services/situation-analyzer";
import {
  practiceCaseMatchingEngine,
  usePracticeCaseSources,
} from "@/hooks/matching/usePracticeCaseMatching";

export function useTileIntake() {
  const sourcesQ = usePracticeCaseSources();
  const orchestrator = useMemo(() => createTileIntakeOrchestrator(practiceCaseMatchingEngine), []);

  const [session, setSession] = useState<TileIntakeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const sync = useCallback((next: TileIntakeSession) => setSession(next), []);

  useEffect(() => {
    sync(orchestrator.getSession());
    setHydrated(true);
  }, [orchestrator, sync]);

  const ensureIndex = useCallback(() => {
    const sources = sourcesQ.data ?? [];
    if (sources.length === 0) return false;
    const index = practiceCaseMatchingEngine.getIndex();
    if (!index || index.entries.length === 0) practiceCaseMatchingEngine.rebuildIndex(sources);
    return true;
  }, [sourcesQ.data]);

  const run = useCallback(
    (fn: () => TileIntakeSession) => {
      try {
        sync(fn());
        setError(null);
        return true;
      } catch (e) {
        setError(
          e instanceof TileIntakeError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Unerwarteter Fehler in der Fallerfassung.",
        );
        return false;
      }
    },
    [sync],
  );

  const chooseMode = useCallback(
    (mode: TileIntakeMode) => {
      ensureIndex();
      return run(() => orchestrator.chooseMode(mode));
    },
    [ensureIndex, orchestrator, run],
  );

  const selectedSource = useMemo(() => {
    const id = session?.selectedCaseId;
    if (!id) return null;
    return (sourcesQ.data ?? []).find((s) => s.id === id) ?? null;
  }, [session?.selectedCaseId, sourcesQ.data]);

  const completeAndHandoff = useCallback((): TileIntakeDocumentationResult | null => {
    try {
      const result = orchestrator.completeAndHandoff(selectedSource);
      sync(orchestrator.getSession());
      setError(null);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Übergabe zur Fallbearbeitung ist nicht möglich.");
      return null;
    }
  }, [orchestrator, selectedSource, sync]);

  const upgradeToDocumentation = useCallback((): TileIntakeDocumentationResult | null => {
    try {
      const result = orchestrator.upgradeToDocumentation(selectedSource);
      sync(orchestrator.getSession());
      setError(null);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Übergabe zur Fallbearbeitung ist nicht möglich.");
      return null;
    }
  }, [orchestrator, selectedSource, sync]);

  return {
    hydrated,
    session,
    error,
    sourcesLoading: sourcesQ.isLoading,
    sources: sourcesQ.data ?? [],
    selectedSource,
    currentStep: () => orchestrator.currentStep(),
    progress: () => orchestrator.progress(),
    chooseMode,
    answer: (value: SituationAnswerValue) => run(() => orchestrator.answer(value)),
    markUnknown: () => run(() => orchestrator.markUnknown()),
    back: () => run(() => orchestrator.back()),
    addParticipant: (input: NewParticipant) => run(() => orchestrator.addParticipant(input)),
    updateParticipant: (id: string, patch: Partial<Omit<SituationParticipant, "id">>) =>
      run(() => orchestrator.updateParticipant(id, patch)),
    removeParticipant: (id: string) => run(() => orchestrator.removeParticipant(id)),
    addEvidence: (input: NewEvidence) => run(() => orchestrator.addEvidence(input)),
    removeEvidence: (id: string) => run(() => orchestrator.removeEvidence(id)),
    addWitness: (input: NewWitness) => run(() => orchestrator.addWitness(input)),
    removeWitness: (id: string) => run(() => orchestrator.removeWitness(id)),
    addMeasure: (input: NewMeasure) => run(() => orchestrator.addMeasure(input)),
    removeMeasure: (id: string) => run(() => orchestrator.removeMeasure(id)),
    confirmEditorStep: () => run(() => orchestrator.confirmEditorStep()),
    startOptionalDetails: () => run(() => orchestrator.startOptionalDetails()),
    skipOptionalDetails: () => run(() => orchestrator.skipOptionalDetails()),
    selectCase: (caseId: string | null) => run(() => orchestrator.selectCase(caseId)),
    completeAndHandoff,
    upgradeToDocumentation,
    reset: () => {
      sync(orchestrator.reset());
      setError(null);
    },
  };
}

export type TileIntakeController = ReturnType<typeof useTileIntake>;
