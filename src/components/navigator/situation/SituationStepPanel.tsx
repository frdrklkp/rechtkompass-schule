/**
 * Sprint 4.6B – Anbindung des Situation Analyzers an die Navigator-Phase „Situation“.
 * Persistenz erfolgt ausschließlich über den bestehenden Navigator-Kontext.
 */
import { useCallback } from "react";
import { SituationAnalyzer } from "./SituationAnalyzer";
import { useSituationAnalyzer } from "@/hooks/navigator/useSituationAnalyzer";
import { SITUATION_CONTEXT_KEY, type SituationCase } from "@/services/situation-analyzer";

export interface SituationStepPanelProps {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
}

export function SituationStepPanel({
  navigatorId,
  workflowId,
  context,
  onPatchContext,
}: SituationStepPanelProps) {
  const persist = useCallback(
    (situationCase: SituationCase) => {
      onPatchContext({ [SITUATION_CONTEXT_KEY]: situationCase });
    },
    [onPatchContext],
  );

  const controller = useSituationAnalyzer({
    navigatorId,
    workflowId,
    initialData: context[SITUATION_CONTEXT_KEY],
    onPersist: persist,
  });

  return <SituationAnalyzer controller={controller} />;
}

/** Liest den gespeicherten Erfassungsstatus aus dem Navigator-Kontext. */
export function isSituationComplete(context: Record<string, unknown>): boolean {
  const stored = context[SITUATION_CONTEXT_KEY];
  if (typeof stored !== "object" || stored === null) return false;
  return (stored as { status?: string }).status === "complete";
}
