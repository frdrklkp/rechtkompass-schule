/**
 * Sprint 4.6F – Übergabe des Assistenten an den Decision Navigator.
 *
 * Die Übergabe erfolgt ausschließlich über die bestehenden Navigator-
 * Schnittstellen (`DecisionNavigatorEngine`, `NavigatorSessionStore`). Es
 * entsteht keine zweite Navigatorlogik und keine zweite Persistenzschicht.
 * Der Sachverhalt wird unverändert übernommen; die Phase „Situation“ wird als
 * abgeschlossen markiert, damit keine Angabe erneut erfasst werden muss.
 */
import {
  DecisionNavigatorEngine,
  LocalStorageNavigatorSessionStore,
  NAVIGATOR_SESSION_IDS,
  type NavigatorSessionStorePort,
  type NavigatorState,
} from "@/services/decision-navigator";
import { ASSISTANT_HANDOFF_STEP_ID } from "./types";

export interface AssistantHandoffOptions {
  store?: NavigatorSessionStorePort;
  navigatorId?: string;
  /** Zielphase; Standard ist die Analyse direkt nach der Situation. */
  targetStepId?: string;
  /** Höchstzahl der Schrittwechsel (Schutz gegen Endlosschleifen). */
  maxSteps?: number;
}

export interface AssistantHandoffResult {
  engine: DecisionNavigatorEngine;
  state: NavigatorState;
  navigatorId: string;
}

/**
 * Erzeugt eine gültige Navigator-Session mit vollständig gefülltem Kontext und
 * öffnet sie an einer sinnvollen Phase.
 */
export function startNavigatorFromAssistant(
  context: Record<string, unknown>,
  options: AssistantHandoffOptions = {},
): AssistantHandoffResult {
  const navigatorId = options.navigatorId ?? NAVIGATOR_SESSION_IDS.work;
  const store = options.store ?? new LocalStorageNavigatorSessionStore();
  const target = options.targetStepId ?? ASSISTANT_HANDOFF_STEP_ID;
  const maxSteps = options.maxSteps ?? 12;

  const engine = new DecisionNavigatorEngine({ navigatorId, store });
  engine.start();
  engine.patchContext(context);

  /*
   * Vorwärts über die regulären Schrittwechsel: dadurch gelten Start und
   * Situation als abgeschlossen und werden nicht erneut abgefragt.
   */
  for (let i = 0; i < maxSteps; i += 1) {
    const current = engine.getState().currentStep;
    if (current === target) break;
    if (engine.getState().status !== "running") break;
    if (!engine.canGoNext()) break;
    engine.next();
  }

  return { engine, state: engine.getState(), navigatorId };
}
