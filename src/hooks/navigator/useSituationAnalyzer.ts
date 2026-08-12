/**
 * Sprint 4.6B – React-Anbindung des Situation Analyzers.
 * Der Hook hält eine Service-Instanz und spiegelt deren Zustand.
 * Fachlogik verbleibt vollständig im Service.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SituationAnalyzerService,
  SituationDataError,
  type SituationAnswerValue,
  type SituationCase,
  type SituationValidationResult,
  type NewEvidence,
  type NewMeasure,
  type NewParticipant,
  type NewWitness,
  type SituationParticipant,
} from "@/services/situation-analyzer";

export interface UseSituationAnalyzerOptions {
  navigatorId: string;
  workflowId: string;
  /** Bereits gespeicherte Angaben aus dem Navigator-Kontext. */
  initialData?: unknown;
  /** Persistenz über den Navigator-Kontext. */
  onPersist?: (situationCase: SituationCase) => void;
}

export function useSituationAnalyzer(options: UseSituationAnalyzerOptions) {
  const { navigatorId, workflowId, initialData, onPersist } = options;
  const service = useMemo(
    () => new SituationAnalyzerService({ navigatorId, workflowId }),
    [navigatorId, workflowId],
  );
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;

  const [situationCase, setSituationCase] = useState<SituationCase | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [validation, setValidation] = useState<SituationValidationResult>({
    valid: false,
    issues: [],
  });
  const [showValidation, setShowValidation] = useState(false);

  const publish = useCallback(
    (next: SituationCase, persist: boolean) => {
      setSituationCase(next);
      setValidation(service.validate());
      if (persist) persistRef.current?.(next);
    },
    [service],
  );

  useEffect(() => {
    if (initialData === undefined || initialData === null) {
      publish(service.createCase(), false);
      setDataError(null);
      return;
    }
    try {
      publish(service.loadCase(initialData), false);
      setDataError(null);
    } catch (error) {
      setDataError(
        error instanceof SituationDataError
          ? error.message
          : "Die gespeicherten Angaben konnten nicht geladen werden.",
      );
    }
    // Nur beim Mount / Wechsel des Navigators laden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  const run = useCallback(
    (fn: (s: SituationAnalyzerService) => SituationCase) => {
      publish(fn(service), true);
    },
    [publish, service],
  );

  const restart = useCallback(() => {
    setDataError(null);
    publish(service.resetSituation(), true);
  }, [publish, service]);

  const complete = useCallback(() => {
    const result = service.completeSituation();
    setShowValidation(true);
    publish(service.getCase(), true);
    setValidation(result);
    return result;
  }, [publish, service]);

  return {
    ready: situationCase !== null,
    situationCase,
    schema: service.getSchema(),
    resolver: service.getResolver(),
    validation,
    showValidation,
    dataError,
    restart,
    complete,
    answer: (questionId: string, value: SituationAnswerValue) =>
      run((s) => s.answerQuestion(questionId, value)),
    markUnknown: (questionId: string) => run((s) => s.markUnknown(questionId)),
    markNotApplicable: (questionId: string) => run((s) => s.markNotApplicable(questionId)),
    clearAnswer: (questionId: string) => run((s) => s.clearAnswer(questionId)),
    updateRawDescription: (text: string) => run((s) => s.updateRawDescription(text)),
    addParticipant: (input: NewParticipant) => run((s) => s.addParticipant(input)),
    updateParticipant: (id: string, patch: Partial<Omit<SituationParticipant, "id">>) =>
      run((s) => s.updateParticipant(id, patch)),
    removeParticipant: (id: string) => run((s) => s.removeParticipant(id)),
    addWitness: (input: NewWitness) => run((s) => s.addWitness(input)),
    removeWitness: (id: string) => run((s) => s.removeWitness(id)),
    addEvidence: (input: NewEvidence) => run((s) => s.addEvidence(input)),
    removeEvidence: (id: string) => run((s) => s.removeEvidence(id)),
    addMeasure: (input: NewMeasure) => run((s) => s.addMeasure(input)),
    removeMeasure: (id: string) => run((s) => s.removeMeasure(id)),
  };
}

export type SituationAnalyzerController = ReturnType<typeof useSituationAnalyzer>;
