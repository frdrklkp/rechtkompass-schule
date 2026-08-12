/**
 * Sprint 4.6B.1 – Sichtbare Session-Verwaltung des Decision Navigators.
 * Reine Lese- und Prüflogik über dem bestehenden NavigatorSessionStore.
 * Keine zweite Persistenzschicht, keine zweite Engine.
 */
import type { NavigatorSessionStorePort } from "./NavigatorSessionStore";
import { buildStandardFlow } from "./standardFlow";
import type { NavigatorState, NavigatorStatus } from "./types";

/** Getrennte Kennungen für Echtbearbeitung und Demo. */
export const NAVIGATOR_SESSION_IDS = {
  work: "aktueller-vorgang",
  demo: "navigator-demo",
} as const;

export type NavigatorSessionMode = keyof typeof NAVIGATOR_SESSION_IDS;

export const NAVIGATOR_DEMO_TITLE = "Allgemeine schulische Situation – Demo";

/** Kontext-Schlüssel, unter dem die Demo-Kennzeichnung abgelegt wird. */
export const NAVIGATOR_DEMO_CONTEXT_KEY = "navigatorDemo";

export type NavigatorSessionProblem =
  | "none"
  | "storage_unavailable"
  | "unreadable"
  | "incompatible"
  | "invalid_state";

export interface NavigatorSessionSummary {
  navigatorId: string;
  mode: NavigatorSessionMode;
  exists: boolean;
  problem: NavigatorSessionProblem;
  /** Verständliche Meldung; niemals ein technischer Stacktrace. */
  message: string | null;
  status: NavigatorStatus | null;
  currentStepId: string | null;
  currentStepTitle: string | null;
  percent: number;
  updatedAt: string | null;
  isDemo: boolean;
}

/** Prüft, ob der Browser-Speicher überhaupt nutzbar ist. */
export function isNavigatorStorageAvailable(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const probe = "rk:navigator:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function emptySummary(
  mode: NavigatorSessionMode,
  problem: NavigatorSessionProblem,
  message: string | null,
): NavigatorSessionSummary {
  return {
    navigatorId: NAVIGATOR_SESSION_IDS[mode],
    mode,
    exists: false,
    problem,
    message,
    status: null,
    currentStepId: null,
    currentStepTitle: null,
    percent: 0,
    updatedAt: null,
    isDemo: mode === "demo",
  };
}

const VALID_STATUS: NavigatorStatus[] = ["idle", "running", "paused", "cancelled", "finished"];

/** Strukturprüfung eines geladenen Zustands – ohne Fachlogik. */
export function isPlausibleNavigatorState(value: unknown): value is NavigatorState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<NavigatorState>;
  return (
    typeof s.navigatorId === "string" &&
    typeof s.flowId === "string" &&
    Array.isArray(s.visitedSteps) &&
    Array.isArray(s.completedSteps) &&
    Array.isArray(s.skippedSteps) &&
    typeof s.status === "string" &&
    VALID_STATUS.includes(s.status as NavigatorStatus) &&
    typeof s.context === "object" &&
    s.context !== null
  );
}

/**
 * Liest eine gespeicherte Session und beschreibt sie für die Oberfläche.
 * Defekte Einträge werden gemeldet, aber niemals stillschweigend gelöscht.
 */
export function readNavigatorSession(
  mode: NavigatorSessionMode,
  store: NavigatorSessionStorePort,
): NavigatorSessionSummary {
  const navigatorId = NAVIGATOR_SESSION_IDS[mode];
  let raw: unknown = null;
  try {
    raw = store.load(navigatorId);
  } catch {
    return emptySummary(
      mode,
      "unreadable",
      "Die gespeicherte Bearbeitung konnte nicht gelesen werden. Sie können die Bearbeitung zurücksetzen und neu beginnen.",
    );
  }

  if (raw === null || raw === undefined) return emptySummary(mode, "none", null);

  if (!isPlausibleNavigatorState(raw)) {
    return {
      ...emptySummary(
        mode,
        "invalid_state",
        "Der gespeicherte Navigatorzustand ist unvollständig oder beschädigt. Ihre Angaben bleiben gespeichert, bis Sie die Bearbeitung ausdrücklich zurücksetzen.",
      ),
      exists: true,
    };
  }

  const flow = buildStandardFlow();
  if (raw.flowId !== flow.id) {
    return {
      ...emptySummary(
        mode,
        "incompatible",
        "Die gespeicherte Bearbeitung stammt aus einer früheren Ablaufversion und kann nicht fortgesetzt werden. Sie können eine neue Bearbeitung starten.",
      ),
      exists: true,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    };
  }

  const step = flow.steps.find((s) => s.id === raw.currentStep) ?? null;
  return {
    navigatorId,
    mode,
    exists: true,
    problem: "none",
    message: null,
    status: raw.status,
    currentStepId: raw.currentStep,
    currentStepTitle: step?.title ?? null,
    percent: raw.progress?.percent ?? 0,
    updatedAt: raw.updatedAt ?? null,
    isDemo: raw.context?.[NAVIGATOR_DEMO_CONTEXT_KEY] === true || mode === "demo",
  };
}

/** Fortsetzbar sind laufende und pausierte Bearbeitungen ohne Ladeproblem. */
export function isResumable(summary: NavigatorSessionSummary): boolean {
  return (
    summary.exists &&
    summary.problem === "none" &&
    (summary.status === "running" || summary.status === "paused")
  );
}
