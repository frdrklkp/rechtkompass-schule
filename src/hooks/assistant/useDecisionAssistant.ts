/**
 * Sprint 4.6F – React-Anbindung des Entscheidungsassistenten.
 * Der Hook hält den Orchestrator und spiegelt dessen Sitzung.
 * Fachlogik verbleibt vollständig im Service.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AssistantError,
  AssistantOrchestrator,
  LocalStorageAssistantSessionStore,
  startNavigatorFromAssistant,
  type AssistantQuestion,
  type AssistantSession,
  type AssistantStaleReason,
} from "@/services/assistant";
import { defaultLegalContextService } from "@/services/legal-context";
import {
  defaultDocumentationTemplateFetcher,
  resolveDocumentationTemplates,
} from "@/services/documentation-assistant";
import type { AssistantLegalPreviewData } from "@/components/assistant/AssistantLegalPreview";

import type { SituationAnswerValue } from "@/services/situation-analyzer";
import {
  practiceCaseMatchingEngine,
  usePracticeCaseSources,
} from "@/hooks/matching/usePracticeCaseMatching";

export function useDecisionAssistant() {
  const sourcesQ = usePracticeCaseSources();
  const orchestrator = useMemo(
    () =>
      new AssistantOrchestrator({
        matching: practiceCaseMatchingEngine,
        store: new LocalStorageAssistantSessionStore(),
      }),
    [],
  );

  const [session, setSession] = useState<AssistantSession | null>(null);
  const [questions, setQuestions] = useState<AssistantQuestion[]>([]);
  const [stale, setStale] = useState<AssistantStaleReason>("no_result");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const sync = useCallback(
    (next: AssistantSession | null) => {
      setSession(next);
      setQuestions(orchestrator.questions());
      setStale(orchestrator.staleReason());
    },
    [orchestrator],
  );

  useEffect(() => {
    sync(orchestrator.getSession());
    setHydrated(true);
  }, [orchestrator, sync]);

  const run = useCallback(
    (fn: () => AssistantSession) => {
      try {
        sync(fn());
        setError(null);
        return true;
      } catch (e) {
        setError(
          e instanceof AssistantError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Unerwarteter Fehler im Assistenten.",
        );
        return false;
      }
    },
    [sync],
  );

  /** Index bei Bedarf aus dem geladenen Fallbestand aufbauen. */
  const ensureIndex = useCallback(() => {
    const sources = sourcesQ.data ?? [];
    if (sources.length === 0) return false;
    const index = practiceCaseMatchingEngine.getIndex();
    if (!index || index.entries.length === 0) orchestrator.prepareIndex(sources);
    return true;
  }, [orchestrator, sourcesQ.data]);

  const structure = useCallback(
    (description: string) => run(() => orchestrator.structure(description)),
    [orchestrator, run],
  );

  const runMatching = useCallback(() => {
    if (!ensureIndex()) {
      setError("Der Fallbestand ist noch nicht geladen. Bitte kurz warten und erneut versuchen.");
      return false;
    }
    return run(() => orchestrator.runMatching());
  }, [ensureIndex, orchestrator, run]);

  const structureAndMatch = useCallback(
    (description: string) => {
      if (!structure(description)) return false;
      return runMatching();
    },
    [runMatching, structure],
  );

  const rebuildIndex = useCallback(() => {
    const sources = sourcesQ.data ?? [];
    if (sources.length === 0) return;
    orchestrator.prepareIndex(sources);
    setStale(orchestrator.staleReason());
  }, [orchestrator, sourcesQ.data]);

  /** Quelldatensatz des bestätigten Praxisfalls (nur vorhandene Falldaten). */
  const selectedSource = useMemo(() => {
    const id = session?.selectedCaseId;
    if (!id) return null;
    return (sourcesQ.data ?? []).find((s) => s.id === id) ?? null;
  }, [session?.selectedCaseId, sourcesQ.data]);

  /*
   * Sprint 4.6G – Kompakte Rechtsgrundlagen-Vorschau. Nutzt denselben
   * Query-Schlüssel wie der Navigator (geteilter Cache); ohne bestätigten
   * Praxisfall wird nichts aufgelöst und nichts angezeigt.
   */
  const selectedCaseId = session?.selectedCaseId ?? null;
  const legalQ = useQuery({
    queryKey: ["legal-context", selectedCaseId],
    queryFn: () => defaultLegalContextService.resolveForCase(selectedCaseId!),
    enabled: selectedCaseId !== null,
    staleTime: 60_000,
  });

  const legalPreview = useMemo<AssistantLegalPreviewData | null>(() => {
    if (!selectedCaseId || !legalQ.data) return null;
    const references = legalQ.data.references;
    return {
      referenceCount: references.length,
      topReferences: references.slice(0, 3).map((r) => ({
        id: r.sectionId,
        sourceLabel: r.source?.shortName ?? r.source?.name ?? "Rechtsquelle nicht hinterlegt",
        reference: r.reference,
        freshness: r.freshness,
      })),
    };
  }, [selectedCaseId, legalQ.data]);

  /*
   * Sprint 4.6H – Vorschau der Dokumentationsphase: Anzahl der für diesen
   * Vorgang verfügbaren Vorlagen. Derselbe Query-Schlüssel wie im Navigator
   * (geteilter Cache); die Auflösung ist deterministisch (Praxisfall →
   * Kategorie → allgemein).
   */
  const situationCategory = session?.situation?.category?.trim() || null;
  const docsQ = useQuery({
    queryKey: ["documentation-templates", selectedCaseId, situationCategory],
    queryFn: async () => {
      const data = await defaultDocumentationTemplateFetcher(selectedCaseId);
      return resolveDocumentationTemplates(data, situationCategory).templates.length;
    },
    enabled: session?.situation != null,
    staleTime: 60_000,
  });
  const documentationPreview = useMemo<{ templateCount: number } | null>(() => {
    if (session?.situation == null || docsQ.data === undefined) return null;
    return { templateCount: docsQ.data };
  }, [session?.situation, docsQ.data]);

  /**
   * Übergabe an den Decision Navigator. Der Sachverhalt wird vollständig
   * übernommen; es erfolgt keine erneute Erfassung.
   */
  const handOffToNavigator = useCallback(() => {
    try {
      const context = orchestrator.buildHandoffContext(selectedSource);
      const result = startNavigatorFromAssistant(context);
      sync(orchestrator.completeHandoff());
      setError(null);
      return result;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Die Übergabe an den Navigator ist nicht möglich.",
      );
      return null;
    }
  }, [orchestrator, selectedSource, sync]);

  return {
    hydrated,
    session,
    questions,
    stale,
    error,
    sourcesLoading: sourcesQ.isLoading,
    sourcesError: sourcesQ.error instanceof Error ? sourcesQ.error : null,
    caseCount: sourcesQ.data?.length ?? 0,
    sources: sourcesQ.data ?? [],
    selectedSource,
    legalPreview,
    documentationPreview,
    structure,
    structureAndMatch,
    runMatching,
    rebuildIndex,
    answer: (questionId: string, value: SituationAnswerValue) =>
      run(() => orchestrator.answerQuestion(questionId, value)),
    markUnknown: (questionId: string) => run(() => orchestrator.markQuestionUnknown(questionId)),
    selectCase: (caseId: string | null) => run(() => orchestrator.selectCase(caseId)),
    buildHandoffContext: () => orchestrator.buildHandoffContext(selectedSource),
    handOffToNavigator,
    completeHandoff: () => run(() => orchestrator.completeHandoff()),
    pause: () => run(() => orchestrator.pause()),
    resumeSession: () => run(() => orchestrator.resume()),
    cancel: () => run(() => orchestrator.cancel()),
    reset: () => {
      orchestrator.reset();
      sync(null);
      setError(null);
    },
  };
}

export type DecisionAssistantController = ReturnType<typeof useDecisionAssistant>;

