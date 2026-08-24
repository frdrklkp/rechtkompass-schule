/**
 * Sprint 4.6A – Tests der Decision Navigator Engine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildStandardFlow,
  DecisionNavigatorEngine,
  InMemoryNavigatorSessionStore,
  NavigatorError,
  NavigatorProgressCalculator,
  type NavigatorEvent,
} from "../index";

function makeEngine(store = new InMemoryNavigatorSessionStore()) {
  const engine = new DecisionNavigatorEngine({ navigatorId: "nav-test", store });
  engine.start();
  return { engine, store };
}

test("Standardablauf enthält alle Phasen in fester Reihenfolge", () => {
  const ids = buildStandardFlow().steps.map((s) => s.id);
  assert.deepEqual(ids, [
    "start",
    "situation",
    "analyse",
    "bewertung",
    "sofortmassnahmen",
    "rechtsgrundlagen",
    "vorlagen",
    "abschluss",
  ]);
});

test("Navigation vor und zurück wechselt den aktuellen Schritt", () => {
  const { engine } = makeEngine();
  assert.equal(engine.getState().currentStep, "start");
  engine.next();
  assert.equal(engine.getState().currentStep, "situation");
  engine.next();
  assert.equal(engine.getState().currentStep, "analyse");
  engine.back();
  assert.equal(engine.getState().currentStep, "situation");
  assert.ok(engine.getState().visitedSteps.includes("analyse"));
});

test("Zurück am ersten Schritt ist nicht möglich", () => {
  const { engine } = makeEngine();
  assert.equal(engine.canGoBack(), false);
  assert.throws(() => engine.back(), NavigatorError);
});

test("Fortschritt wird korrekt berechnet", () => {
  const { engine } = makeEngine();
  const p0 = engine.getProgress();
  assert.equal(p0.totalSteps, 8);
  assert.equal(p0.processedSteps, 0);
  assert.equal(p0.openSteps, 8);
  assert.equal(p0.percent, 0);
  assert.equal(p0.currentStep, "start");
  assert.equal(p0.lastStep, "abschluss");

  engine.next();
  engine.next();
  const p2 = engine.getProgress();
  assert.equal(p2.processedSteps, 2);
  assert.equal(p2.openSteps, 6);
  assert.equal(p2.percent, 25);
});

test("ProgressCalculator ignoriert unsichtbare Schritte", () => {
  const p = NavigatorProgressCalculator.calculate(
    [
      { id: "a", title: "A", description: "", type: "information" },
      { id: "b", title: "B", description: "", type: "information", visible: false },
    ],
    new Set(["a"]),
    "a",
  );
  assert.equal(p.totalSteps, 1);
  assert.equal(p.percent, 100);
});

test("Optionale Schritte können übersprungen werden, Pflichtschritte nicht", () => {
  const { engine } = makeEngine();
  assert.throws(() => engine.skip(), NavigatorError);
  engine.goTo("vorlagen");
  assert.equal(engine.canSkip(), true);
  engine.skip();
  assert.equal(engine.getState().currentStep, "abschluss");
  assert.deepEqual(engine.getState().skippedSteps, ["vorlagen"]);
  assert.equal(engine.getSteps().find((s) => s.id === "vorlagen")?.status, "skipped");
});

test("Status wird im Store gespeichert und ist serialisierbar", () => {
  const { engine, store } = makeEngine();
  engine.next();
  const saved = store.load("nav-test");
  assert.ok(saved);
  assert.equal(saved!.currentStep, "situation");
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(saved)));
});

test("Session-Wiederherstellung setzt am letzten Schritt fort", () => {
  const { engine, store } = makeEngine();
  engine.next();
  engine.next();
  engine.pause();

  const resumed = DecisionNavigatorEngine.resumeFromStore("nav-test", store);
  assert.ok(resumed);
  assert.equal(resumed!.getState().status, "paused");
  resumed!.resume();
  assert.equal(resumed!.getState().currentStep, "analyse");
  assert.equal(resumed!.getProgress().processedSteps, 2);
  resumed!.next();
  assert.equal(resumed!.getState().currentStep, "bewertung");
});

test("Unbekannte Session liefert null", () => {
  const store = new InMemoryNavigatorSessionStore();
  assert.equal(DecisionNavigatorEngine.resumeFromStore("gibt-es-nicht", store), null);
});

test("Events werden bei allen Kernübergängen ausgelöst", () => {
  const seen: NavigatorEvent[] = [];
  const engine = new DecisionNavigatorEngine({ navigatorId: "nav-events" });
  engine.on((e) => seen.push(e));
  engine.start();
  engine.next();
  engine.pause();
  engine.resume();
  const names = seen.map((e) => e.name);
  assert.deepEqual(names, [
    "NavigatorStarted",
    "StepEntered",
    "StepCompleted",
    "StepEntered",
    "NavigatorPaused",
    "NavigatorResumed",
  ]);
  assert.ok(seen.every((e) => e.navigatorId === "nav-events" && typeof e.at === "string"));
});

test("Abschluss beendet den Vorgang und blockiert weitere Navigation", () => {
  const { engine } = makeEngine();
  for (let i = 0; i < 8; i++) engine.next();
  const state = engine.getState();
  assert.equal(state.status, "finished");
  assert.equal(state.progress.percent, 100);
  assert.ok(engine.getEvents().some((e) => e.name === "NavigatorFinished"));
  assert.throws(() => engine.next(), NavigatorError);
});

test("Abbrechen setzt den Status und verhindert weitere Schritte", () => {
  const { engine } = makeEngine();
  engine.next();
  engine.cancel("Testabbruch");
  assert.equal(engine.getState().status, "cancelled");
  assert.throws(() => engine.next(), NavigatorError);
});

test("Neustart setzt Fortschritt und Kontext zurück", () => {
  const { engine } = makeEngine();
  engine.patchContext({ foo: "bar" });
  engine.next();
  engine.next();
  engine.restart();
  const state = engine.getState();
  assert.equal(state.status, "running");
  assert.equal(state.currentStep, "start");
  assert.deepEqual(state.completedSteps, []);
  assert.deepEqual(state.context, {});
  assert.equal(state.progress.percent, 0);
});

test("Direkter Sprung auf unbekannten Schritt schlägt fehl", () => {
  const { engine } = makeEngine();
  assert.throws(() => engine.goTo("unbekannt"), NavigatorError);
});

test("Schrittmodell liefert Verkettung und Metadaten", () => {
  const { engine } = makeEngine();
  const steps = engine.getSteps();
  assert.equal(steps[0].previousStep, null);
  assert.equal(steps[0].nextStep, "situation");
  assert.equal(steps[steps.length - 1].nextStep, null);
  assert.equal(steps[0].status, "current");
  assert.equal(typeof steps[0].metadata, "object");
});
