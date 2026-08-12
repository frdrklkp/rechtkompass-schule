/**
 * Sprint 4.6A – React-Anbindung der Decision Navigator Engine.
 * Sprint 4.6B.1 – Erweitert um sichtbare Session-Steuerung (Start, Demo, Fortsetzen, Zurücksetzen).
 * Hält eine Engine-Instanz und spiegelt deren Zustand in React.
 * Die Engine bleibt allein für Schrittwechsel und Persistenz verantwortlich.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DecisionNavigatorEngine,
  LocalStorageNavigatorSessionStore,
  NavigatorError,
  isNavigatorStorageAvailable,
  isResumable,
  NAVIGATOR_SESSION_IDS,
  readNavigatorSession,
  type NavigatorSessionMode,
  type NavigatorSessionSummary,
  type NavigatorState,
  type NavigatorStep,
} from "@/services/decision-navigator";

export interface UseDecisionNavigatorOptions {
  /** Feste Kennung; alternativ über den Modus. */
  navigatorId?: string;
  mode?: NavigatorSessionMode;
  /** Nur für Tests / Sonderfälle: Bearbeitung sofort starten. */
  autoStart?: boolean;
}

export function useDecisionNavigator(options: UseDecisionNavigatorOptions = {}) {
  const mode: NavigatorSessionMode = options.mode ?? "work";
  const navigatorId = options.navigatorId ?? NAVIGATOR_SESSION_IDS[mode];
  const autoStart = options.autoStart ?? false;

  const store = useMemo(() => new LocalStorageNavigatorSessionStore(), []);
  const engineRef = useRef<DecisionNavigatorEngine | null>(null);
  const [state, setState] = useState<NavigatorState | null>(null);
  const [steps, setSteps] = useState<NavigatorStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [summary, setSummary] = useState<NavigatorSessionSummary | null>(null);

  const sync = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) {
      setState(null);
      setSteps([]);
      return;
    }
    setState(engine.getState());
    setSteps(engine.getSteps());
  }, []);

  const refreshSummary = useCallback(() => {
    setSummary(readNavigatorSession(mode, store));
  }, [mode, store]);

  const createEngine = useCallback(
    (context?: Record<string, unknown>) => {
      const engine = new DecisionNavigatorEngine({ navigatorId, store });
      engine.start();
      if (context) engine.patchContext(context);
      engineRef.current = engine;
      setRestored(false);
      setError(null);
      sync();
      refreshSummary();
      return engine;
    },
    [navigatorId, store, sync, refreshSummary],
  );

  const resumeStored = useCallback(() => {
    try {
      const existing = DecisionNavigatorEngine.resumeFromStore(navigatorId, store);
      if (!existing) {
        setError("Es wurde keine fortsetzbare Bearbeitung gefunden.");
        return false;
      }
      engineRef.current = existing;
      setRestored(true);
      if (existing.getState().status === "paused") {
        try {
          existing.resume();
        } catch {
          /* pausierter Zustand bleibt bestehen */
        }
      }
      setError(null);
      sync();
      refreshSummary();
      return true;
    } catch {
      setError("Die gespeicherte Bearbeitung konnte nicht geladen werden.");
      return false;
    }
  }, [navigatorId, store, sync, refreshSummary]);

  /** Löscht die gespeicherte Session kontrolliert und beendet die Ansicht. */
  const resetSession = useCallback(() => {
    try {
      store.remove(navigatorId);
    } catch {
      /* Speicher nicht verfügbar */
    }
    engineRef.current = null;
    setRestored(false);
    setError(null);
    sync();
    refreshSummary();
  }, [navigatorId, store, sync, refreshSummary]);

  /** Verlässt die Bearbeitung, ohne Daten zu löschen (Session bleibt pausiert). */
  const leave = useCallback(() => {
    const engine = engineRef.current;
    try {
      if (engine && engine.getState().status === "running") engine.pause();
    } catch {
      /* ignoriert */
    }
    engineRef.current = null;
    sync();
    refreshSummary();
  }, [sync, refreshSummary]);

  // Erst nach Hydration: gespeicherten Zustand prüfen (ohne automatischen Start).
  useEffect(() => {
    setStorageAvailable(isNavigatorStorageAvailable());
    const found = readNavigatorSession(mode, store);
    setSummary(found);
    setHydrated(true);
    if (autoStart) {
      if (isResumable(found)) resumeStored();
      else createEngine();
    }
    // Nur beim Mount / Wechsel der Kennung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigatorId]);

  const run = useCallback(
    (fn: (engine: DecisionNavigatorEngine) => void) => {
      const engine = engineRef.current;
      if (!engine) return;
      try {
        fn(engine);
        setError(null);
      } catch (e) {
        setError(e instanceof NavigatorError ? e.message : "Unerwarteter Navigationsfehler.");
      }
      sync();
      refreshSummary();
    },
    [sync, refreshSummary],
  );

  const engine = engineRef.current;

  return {
    hydrated,
    storageAvailable,
    sessionSummary: summary,
    canResume: summary ? isResumable(summary) : false,
    active: Boolean(state),
    ready: Boolean(state),
    restored,
    mode,
    navigatorId,
    state,
    steps,
    error,
    flow: engine?.getFlow() ?? null,
    currentStep: engine?.getCurrentStep() ?? null,
    context: state?.context ?? {},
    canGoNext: engine?.canGoNext() ?? false,
    canGoBack: engine?.canGoBack() ?? false,
    canSkip: engine?.canSkip() ?? false,
    startNew: (context?: Record<string, unknown>) => createEngine(context),
    resumeStored,
    resetSession,
    leave,
    refreshSummary,
    next: () => run((e) => e.next()),
    back: () => run((e) => e.back()),
    skip: () => run((e) => e.skip()),
    pause: () => run((e) => e.pause()),
    resume: () => run((e) => e.resume()),
    cancel: () => run((e) => e.cancel()),
    restart: () => run((e) => e.restart()),
    patchContext: (patch: Record<string, unknown>) => run((e) => e.patchContext(patch)),
  };
}

export type DecisionNavigatorController = ReturnType<typeof useDecisionNavigator>;
