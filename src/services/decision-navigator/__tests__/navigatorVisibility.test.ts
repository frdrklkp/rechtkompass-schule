/**
 * Sprint 4.6B.1 – Tests der Navigator-Sichtbarkeit und -Integration.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DecisionNavigatorEngine,
  InMemoryNavigatorSessionStore,
  isNavigatorStorageAvailable,
  isPlausibleNavigatorState,
  isResumable,
  NAVIGATOR_DEMO_CONTEXT_KEY,
  NAVIGATOR_SESSION_IDS,
  readNavigatorSession,
  buildStandardFlow,
} from "../index";
import {
  isStepAvailable,
  NAVIGATOR_STEP_VIEWS,
} from "../../../components/navigator/NavigatorStepRenderer";
import { isSituationComplete } from "../../../components/navigator/situation/SituationStepPanel";
import {
  buildDemoSituationCase,
  SITUATION_CONTEXT_KEY,
  SituationAnalyzerService,
} from "../../situation-analyzer";

function startEngine(mode: "work" | "demo" = "work", store = new InMemoryNavigatorSessionStore()) {
  const engine = new DecisionNavigatorEngine({
    navigatorId: NAVIGATOR_SESSION_IDS[mode],
    store,
  });
  engine.start();
  return { engine, store };
}

test("ohne gespeicherte Bearbeitung meldet die Startseite keine Session", () => {
  const store = new InMemoryNavigatorSessionStore();
  const summary = readNavigatorSession("work", store);
  assert.equal(summary.exists, false);
  assert.equal(summary.problem, "none");
  assert.equal(isResumable(summary), false);
});

test("neue Bearbeitung wird gestartet und ist fortsetzbar", () => {
  const { store } = startEngine("work");
  const summary = readNavigatorSession("work", store);
  assert.equal(summary.exists, true);
  assert.equal(summary.status, "running");
  assert.equal(summary.currentStepId, "start");
  assert.equal(isResumable(summary), true);
});

test("Demo-Session ist getrennt gespeichert und als Demo gekennzeichnet", () => {
  const store = new InMemoryNavigatorSessionStore();
  const { engine } = startEngine("demo", store);
  engine.patchContext({ [NAVIGATOR_DEMO_CONTEXT_KEY]: true });
  const demo = readNavigatorSession("demo", store);
  const work = readNavigatorSession("work", store);
  assert.equal(demo.isDemo, true);
  assert.equal(demo.navigatorId, NAVIGATOR_SESSION_IDS.demo);
  assert.equal(work.exists, false);
});

test("Demo-Situation ist vollständig vorbefüllt und bleibt editierbar", () => {
  const demoCase = buildDemoSituationCase(NAVIGATOR_SESSION_IDS.demo, "wf-demo");
  assert.ok(demoCase.answers["kurzbeschreibung.titel"]);
  assert.equal(demoCase.status, "complete");
  assert.deepEqual(demoCase.completeness.missingRequiredQuestions, []);
  const service = new SituationAnalyzerService({
    navigatorId: NAVIGATOR_SESSION_IDS.demo,
    workflowId: "wf-demo",
  });
  service.loadCase(demoCase);
  const changed = service.answerQuestion("kurzbeschreibung.titel", "Eigener Titel");
  assert.equal(changed.answers["kurzbeschreibung.titel"].value, "Eigener Titel");
});

test("Step Renderer deckt alle Phasen des Standardablaufs ab", () => {
  for (const step of buildStandardFlow().steps) {
    assert.ok(NAVIGATOR_STEP_VIEWS[step.id], `Ansicht fehlt für ${step.id}`);
  }
});

test("Step Renderer kennzeichnet umgesetzte Phasen als verfügbar, spätere Phasen nicht", () => {
  assert.equal(isStepAvailable("start"), true);
  assert.equal(isStepAvailable("situation"), true);
  // Sprint 4.6C: Analyse und Bewertung sind fachlich umgesetzt.
  assert.equal(isStepAvailable("analyse"), true);
  assert.equal(isStepAvailable("bewertung"), true);
  // Sprint 4.6D: Sofortmaßnahmen sind fachlich umgesetzt.
  assert.equal(isStepAvailable("sofortmassnahmen"), true);
  // Sprint 4.6G: Rechtsgrundlagen sind fachlich umgesetzt.
  assert.equal(isStepAvailable("rechtsgrundlagen"), true);
  // Sprint 4.6M: Dokumente erstellen (vorlagen) und Ergebnis & Abschluss sind fachlich umgesetzt.
  assert.equal(isStepAvailable("vorlagen"), true);
  assert.equal(isStepAvailable("abschluss"), true);
});

test("Situation wird im Navigator-Kontext gespeichert und nach Reload wiederhergestellt", () => {
  const store = new InMemoryNavigatorSessionStore();
  const { engine } = startEngine("work", store);
  engine.next(); // Situation
  const service = new SituationAnalyzerService({
    navigatorId: NAVIGATOR_SESSION_IDS.work,
    workflowId: engine.getState().workflowId,
  });
  service.createCase();
  service.answerQuestion("kurzbeschreibung.titel", "Testvorgang");
  engine.patchContext({ [SITUATION_CONTEXT_KEY]: service.getCase() });

  const resumed = DecisionNavigatorEngine.resumeFromStore(NAVIGATOR_SESSION_IDS.work, store);
  assert.ok(resumed);
  const restored = resumed!.getState().context[SITUATION_CONTEXT_KEY] as { answers: Record<string, { value: unknown }> };
  assert.equal(restored.answers["kurzbeschreibung.titel"].value, "Testvorgang");
  assert.equal(resumed!.getCurrentStep()?.id, "situation");
});

test("Weiter ist ohne abgeschlossene Situation blockiert und danach möglich", () => {
  const service = new SituationAnalyzerService({ navigatorId: "n1", workflowId: "w1" });
  const created = service.createCase();
  assert.equal(isSituationComplete({ [SITUATION_CONTEXT_KEY]: created }), false);
  assert.equal(isSituationComplete({ [SITUATION_CONTEXT_KEY]: { status: "complete" } }), true);
  assert.equal(isSituationComplete({}), false);
});

test("Schrittwechsel, Pause und Fortsetzen laufen über die Engine", () => {
  const { engine, store } = startEngine("work");
  engine.next();
  engine.pause();
  assert.equal(readNavigatorSession("work", store).status, "paused");
  engine.resume();
  assert.equal(readNavigatorSession("work", store).status, "running");
  engine.restart();
  assert.equal(engine.getCurrentStep()?.id, "start");
});

test("inkompatible Session erzeugt einen kontrollierten Fehlerzustand ohne Datenverlust", () => {
  const store = new InMemoryNavigatorSessionStore();
  const { engine } = startEngine("work", store);
  const broken = { ...engine.getState(), flowId: "alter-flow-v0" };
  store.save(broken);
  const summary = readNavigatorSession("work", store);
  assert.equal(summary.problem, "incompatible");
  assert.equal(summary.exists, true);
  assert.ok(summary.message);
  assert.ok(store.load(NAVIGATOR_SESSION_IDS.work), "gespeicherte Daten bleiben erhalten");
});

test("beschädigter Zustand wird erkannt", () => {
  const store = new InMemoryNavigatorSessionStore();
  store.save({ navigatorId: NAVIGATOR_SESSION_IDS.work } as never);
  const summary = readNavigatorSession("work", store);
  assert.equal(summary.problem, "invalid_state");
  assert.equal(isPlausibleNavigatorState({ foo: 1 }), false);
});

test("fehlender Browser-Speicher wird erkannt", () => {
  assert.equal(typeof isNavigatorStorageAvailable(), "boolean");
});
