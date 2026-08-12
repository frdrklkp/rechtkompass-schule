/**
 * Sprint 4.6G – React-Anbindung des Legal Context für den Decision Navigator.
 *
 * Der Hook liest den bestätigten Praxisfall aus dem Navigator-Kontext
 * (ASSISTANT_SELECTED_CASE_KEY), löst die kuratierten Rechtsgrundlagen über
 * den LegalContextService auf und hinterlegt das Ergebnis unter
 * context.legalContext. Gespeicherte Einträge werden nach Reload
 * wiederhergestellt; Änderungen an Fall oder Quellen werden über den
 * Eingabe-Hash als veraltet erkannt.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ASSISTANT_SELECTED_CASE_KEY,
  type AssistantSelectedCaseContext,
} from "@/services/assistant";
import {
  defaultLegalContextService,
  LEGAL_CONTEXT_KEY,
  type LegalContextResult,
  type LegalContextService,
} from "@/services/legal-context";

export interface UseLegalContextOptions {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
  /** Injizierbar für Tests/Sonderfälle. */
  service?: LegalContextService;
}

function readSelectedCase(raw: unknown): AssistantSelectedCaseContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as Partial<AssistantSelectedCaseContext>;
  return typeof candidate.caseId === "string" && candidate.caseId.length > 0
    ? (candidate as AssistantSelectedCaseContext)
    : null;
}

export function useLegalContext(options: UseLegalContextOptions) {
  const { context, onPatchContext } = options;
  const service = options.service ?? defaultLegalContextService;

  const selectedCase = useMemo(
    () => readSelectedCase(context[ASSISTANT_SELECTED_CASE_KEY]),
    [context],
  );
  const caseId = selectedCase?.caseId ?? null;

  const stored = useMemo(
    () => service.restore(context[LEGAL_CONTEXT_KEY]),
    [service, context],
  );

  const query = useQuery({
    queryKey: ["legal-context", caseId],
    queryFn: () => service.resolveForCase(caseId!),
    enabled: caseId !== null,
    staleTime: 60_000,
  });

  const fresh = query.data ?? null;
  const entry: LegalContextResult | null = stored.entry ?? null;

  /*
   * Erstbefüllung: liegt noch kein Eintrag vor, wird das frisch aufgelöste
   * Ergebnis in den Navigator-Kontext übernommen. Abweichungen bei
   * vorhandenem Eintrag werden nicht automatisch überschrieben, sondern
   * als "veraltet" gemeldet (redaktionelle Kontrolle, s. refresh).
   */
  const [dismissedHash, setDismissedHash] = useState<string | null>(null);
  const patchedHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fresh || entry || patchedHashRef.current === fresh.inputHash) return;
    patchedHashRef.current = fresh.inputHash;
    onPatchContext({ [LEGAL_CONTEXT_KEY]: fresh });
  }, [fresh, entry, onPatchContext]);

  const isStale = Boolean(entry && fresh && service.isStale(entry, fresh));
  const staleVisible = isStale && dismissedHash !== fresh?.inputHash;

  /** Übernimmt den aktuellen Stand in den Navigator-Kontext. */
  const refresh = useCallback(() => {
    if (!fresh) return;
    patchedHashRef.current = fresh.inputHash;
    onPatchContext({ [LEGAL_CONTEXT_KEY]: fresh });
  }, [fresh, onPatchContext]);

  const dismissStale = useCallback(() => {
    if (fresh) setDismissedHash(fresh.inputHash);
  }, [fresh]);

  return {
    selectedCase,
    /** Anzuzeigender Stand: gespeicherter Eintrag hat Vorrang vor dem Ladezustand. */
    result: entry ?? fresh,
    storedEntry: entry,
    loading: caseId !== null && query.isLoading && !entry,
    error:
      stored.error ??
      (query.error instanceof Error
        ? query.error.message
        : query.error
          ? "Der Rechtskontext konnte nicht geladen werden."
          : null),
    isStale: staleVisible,
    refresh,
    dismissStale,
    hasCase: caseId !== null,
  };
}

export type LegalContextController = ReturnType<typeof useLegalContext>;
