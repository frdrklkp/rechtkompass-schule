/**
 * Sprint 4.6D – React-Anbindung der Action Engine.
 * Der Hook spiegelt ausschließlich Engine-Ergebnisse; er erzeugt keine
 * eigenen Handlungsschritte und bewertet nicht.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTION_CONTEXT_KEY,
  ActionEngine,
  ActionError,
  type ActionContextEntry,
  type ActionInput,
  type ActionPlan,
  type ActionPlanDelta,
  type ResponsibleRole,
} from "@/services/action-engine";
import {
  ASSESSMENT_CONTEXT_KEY,
  computeInputHash,
  type AssessmentContextEntry,
  type AssessmentResult,
} from "@/services/assessment-engine";
import { SITUATION_CONTEXT_KEY, type SituationCase } from "@/services/situation-analyzer";

export interface UseActionPlanOptions {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
}

function readStoredPlan(
  engine: ActionEngine,
  raw: unknown,
): { plan: ActionPlan | null; error: string | null } {
  if (raw === undefined || raw === null) return { plan: null, error: null };
  if (typeof raw !== "object") {
    return { plan: null, error: "Der gespeicherte Maßnahmenplan konnte nicht gelesen werden." };
  }
  const entry = raw as ActionContextEntry;
  if (!entry.plan) return { plan: null, error: null };
  try {
    return { plan: engine.deserialize(entry.plan), error: null };
  } catch (error) {
    return {
      plan: null,
      error:
        error instanceof ActionError
          ? error.message
          : "Der gespeicherte Maßnahmenplan konnte nicht geladen werden.",
    };
  }
}

export function useActionPlan(options: UseActionPlanOptions) {
  const { navigatorId, workflowId, context, onPatchContext } = options;

  const engine = useMemo(
    () => new ActionEngine({ navigatorId, workflowId }),
    [navigatorId, workflowId],
  );

  const situation = (context[SITUATION_CONTEXT_KEY] ?? null) as SituationCase | null;
  const assessmentEntry = (context[ASSESSMENT_CONTEXT_KEY] ?? null) as AssessmentContextEntry | null;
  const assessment: AssessmentResult | null = assessmentEntry?.result ?? null;

  const currentSituationHash = useMemo(
    () => (situation ? computeInputHash(situation) : ""),
    [situation],
  );
  const assessmentIsStale = Boolean(
    assessment && assessment.evaluatedInputHash !== currentSituationHash,
  );

  const stored = useMemo(
    () => readStoredPlan(engine, context[ACTION_CONTEXT_KEY]),
    [engine, context],
  );

  const [plan, setPlan] = useState<ActionPlan | null>(stored.plan);
  const [loadError, setLoadError] = useState<string | null>(stored.error);
  const [runError, setRunError] = useState<string | null>(null);
  const [delta, setDelta] = useState<ActionPlanDelta | null>(null);

  useEffect(() => {
    setPlan(stored.plan);
    setLoadError(stored.error);
  }, [stored.plan, stored.error]);

  const input: ActionInput | null = useMemo(() => {
    if (!situation || !assessment) return null;
    return {
      navigatorId,
      workflowId,
      caseId: situation.caseId,
      situation,
      assessment,
      actionContext: {
        hasCompletedRequiredAction: Boolean(
          plan?.actions.some((a) => a.required && a.status === "completed"),
        ),
      },
      schemaVersion: situation.schemaVersion,
      generatedAt: new Date().toISOString(),
      assessmentIsStale,
    };
  }, [assessment, assessmentIsStale, navigatorId, plan, situation, workflowId]);

  const validation = useMemo(() => engine.validateInput(input), [engine, input]);

  const isStale = useMemo(
    () =>
      engine.isStale(plan, {
        assessmentId: assessment?.assessmentId ?? "",
        assessmentHash: assessment?.evaluatedInputHash ?? "",
        assessmentIsStale,
      }),
    [assessment, assessmentIsStale, engine, plan],
  );

  const persist = useCallback(
    (next: ActionPlan | null) => {
      setPlan(next);
      onPatchContext({
        [ACTION_CONTEXT_KEY]: engine.buildContextEntry(next, assessment?.assessmentId ?? ""),
      });
    },
    [assessment, engine, onPatchContext],
  );

  const withErrorHandling = useCallback((fn: () => void) => {
    try {
      fn();
      setRunError(null);
    } catch (error) {
      setRunError(
        error instanceof ActionError
          ? error.message
          : "Die Aktion konnte nicht ausgeführt werden.",
      );
    }
  }, []);

  const generate = useCallback(() => {
    if (!input) {
      setRunError("Es liegt noch keine gültige Bewertung vor.");
      return;
    }
    withErrorHandling(() => {
      const result = engine.regenerateActionPlan(input, plan);
      setDelta(plan ? result.delta : null);
      setLoadError(null);
      persist(result.plan);
    });
  }, [engine, input, persist, plan, withErrorHandling]);

  const mutate = useCallback(
    (fn: (engine: ActionEngine, plan: ActionPlan) => ActionPlan) => {
      if (!plan) return;
      withErrorHandling(() => persist(fn(engine, plan)));
    },
    [engine, persist, plan, withErrorHandling],
  );

  return {
    engine,
    plan,
    delta,
    dismissDelta: () => setDelta(null),
    situation,
    assessment,
    assessmentIsStale,
    validation,
    isStale,
    hasPlan: plan !== null,
    loadError,
    runError,
    blockingReasons: plan ? engine.blockingReasons(plan) : [],
    generate,
    reset: () => {
      setDelta(null);
      if (plan) mutate((e, p) => e.resetActionPlan(p));
      else persist(null);
    },
    completeAction: (
      actionKey: string,
      data: { note?: string; result?: string; completedByRole?: ResponsibleRole | null; confirmation?: boolean },
    ) => mutate((e, p) => e.completeAction(p, actionKey, data)),
    reopenAction: (actionKey: string) => mutate((e, p) => e.reopenAction(p, actionKey)),
    skipAction: (actionKey: string, justification: string) =>
      mutate((e, p) => e.skipAction(p, actionKey, justification)),
    markNotApplicable: (actionKey: string, justification: string) =>
      mutate((e, p) => e.markNotApplicable(p, actionKey, justification)),
    updateNote: (actionKey: string, note: string) =>
      mutate((e, p) => e.updateActionNote(p, actionKey, note)),
  };
}

export type ActionPlanController = ReturnType<typeof useActionPlan>;
