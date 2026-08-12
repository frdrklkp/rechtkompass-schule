/**
 * Sprint 4.6C – React-Anbindung der Assessment Engine.
 * Der Hook spiegelt ausschließlich Engine-Ergebnisse; er berechnet keine Ampel.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ASSESSMENT_CONTEXT_KEY,
  AssessmentEngine,
  AssessmentError,
  computeInputHash,
  type AssessmentContextEntry,
  type AssessmentResult,
} from "@/services/assessment-engine";
import { SITUATION_CONTEXT_KEY, type SituationCase } from "@/services/situation-analyzer";

export interface UseAssessmentOptions {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
}

function readStoredEntry(
  engine: AssessmentEngine,
  raw: unknown,
): { entry: AssessmentContextEntry | null; error: string | null } {
  if (raw === undefined || raw === null) return { entry: null, error: null };
  if (typeof raw !== "object") {
    return { entry: null, error: "Das gespeicherte Bewertungsergebnis konnte nicht gelesen werden." };
  }
  const candidate = raw as AssessmentContextEntry;
  if (!candidate.result) return { entry: candidate, error: null };
  try {
    engine.deserialize(JSON.stringify(candidate.result));
    return { entry: candidate, error: null };
  } catch (error) {
    return {
      entry: null,
      error:
        error instanceof AssessmentError
          ? error.message
          : "Das gespeicherte Bewertungsergebnis konnte nicht geladen werden.",
    };
  }
}

export function useAssessment(options: UseAssessmentOptions) {
  const { navigatorId, workflowId, context, onPatchContext } = options;

  const engine = useMemo(
    () => new AssessmentEngine({ navigatorId, workflowId }),
    [navigatorId, workflowId],
  );

  const situation = (context[SITUATION_CONTEXT_KEY] ?? null) as SituationCase | null;
  const stored = useMemo(
    () => readStoredEntry(engine, context[ASSESSMENT_CONTEXT_KEY]),
    [engine, context],
  );

  const [runError, setRunError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(stored.error);
  useEffect(() => setLoadError(stored.error), [stored.error]);

  const validation = useMemo(() => engine.validateInput(situation), [engine, situation]);

  const currentHash = useMemo(
    () => (situation ? computeInputHash(situation) : ""),
    [situation],
  );

  const result: AssessmentResult | null = stored.entry?.result ?? null;
  const isStale = Boolean(result && result.evaluatedInputHash !== currentHash);

  const run = useCallback(() => {
    if (!situation) {
      setRunError("Es wurde noch keine Situation erfasst.");
      return null;
    }
    try {
      const next = engine.evaluate({
        navigatorId,
        workflowId,
        caseId: situation.caseId,
        situation,
        assessmentContext: {},
        schemaVersion: situation.schemaVersion,
        evaluatedAt: new Date().toISOString(),
      });
      const entry = engine.buildContextEntry(situation, next);
      onPatchContext({ [ASSESSMENT_CONTEXT_KEY]: entry });
      setRunError(null);
      setLoadError(null);
      return next;
    } catch (error) {
      setRunError(
        error instanceof AssessmentError
          ? error.message
          : "Die Bewertung konnte nicht ausgeführt werden.",
      );
      return null;
    }
  }, [engine, navigatorId, onPatchContext, situation, workflowId]);

  const reset = useCallback(() => {
    if (!situation) {
      onPatchContext({ [ASSESSMENT_CONTEXT_KEY]: null });
      setRunError(null);
      setLoadError(null);
      return;
    }
    engine.resetAssessment(situation.caseId);
    onPatchContext({ [ASSESSMENT_CONTEXT_KEY]: engine.buildContextEntry(situation, null) });
    setRunError(null);
    setLoadError(null);
  }, [engine, onPatchContext, situation]);

  return {
    engine,
    situation,
    validation,
    result,
    entry: stored.entry,
    isStale,
    runError,
    loadError,
    hasResult: result !== null,
    run,
    reset,
  };
}

export type AssessmentController = ReturnType<typeof useAssessment>;
