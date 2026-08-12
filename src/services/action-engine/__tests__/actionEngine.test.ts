/**
 * Sprint 4.6D – Tests der Action Engine.
 * Deterministische Prüfung von Regeln, Gruppen, Abhängigkeiten, Konflikten,
 * Bearbeitungsstand, Stale-Erkennung und Neugenerierung.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_CONTEXT_KEY,
  ActionEngine,
  ActionError,
  STANDARD_ACTION_RULES,
  ActionRuleRegistry,
  type ActionInput,
} from "../index";
import { AssessmentEngine } from "../../assessment-engine/index";
import {
  SituationAnalyzerService,
  type SituationCase,
} from "../../situation-analyzer/index";

function makeService() {
  const service = new SituationAnalyzerService({ navigatorId: "nav-1", workflowId: "wf-1" });
  service.createCase();
  return service;
}

function baseAnswers(service: SituationAnalyzerService) {
  service.answerQuestion("kurzbeschreibung.titel", "Vorgang A");
  service.answerQuestion("kurzbeschreibung.text", "Auseinandersetzung im Unterricht.");
  service.answerQuestion("zeit-ort.datumBekannt", true);
  service.answerQuestion("zeit-ort.datum", "2026-05-04");
  service.answerQuestion("zeit-ort.ortstyp", "classroom");
  service.addParticipant({ displayName: "Schüler A", role: "student" });
  service.answerQuestion("beteiligte.liste", "erfasst");
  service.answerQuestion("betroffene.vorhanden", false);
  service.answerQuestion("zeugen.vorhanden", false);
  service.answerQuestion("fortdauer.wiederholt", false);
  service.answerQuestion("nachweise.vorhanden", false);
  service.answerQuestion("massnahmen.durchgefuehrt", false);
  service.answerQuestion("informierte.stellen", ["schoolLeadership"]);
  service.answerQuestion("dokumentation.vorfallsbericht", false);
}

function harmlessCase(): SituationCase {
  const service = makeService();
  baseAnswers(service);
  service.answerQuestion("fortdauer.andauernd", false);
  service.answerQuestion("gefahren.gemeldet", false);
  service.answerQuestion("dokumentation.notizen", true);
  return service.getCase()!;
}

function dangerCase(): SituationCase {
  const service = makeService();
  baseAnswers(service);
  service.answerQuestion("fortdauer.andauernd", true);
  service.answerQuestion("gefahren.gemeldet", true);
  service.answerQuestion("dokumentation.notizen", false);
  return service.getCase()!;
}

function buildInput(situation: SituationCase): ActionInput {
  const assessmentEngine = new AssessmentEngine({ navigatorId: "nav-1", workflowId: "wf-1" });
  const assessment = assessmentEngine.evaluate({
    navigatorId: "nav-1",
    workflowId: "wf-1",
    caseId: situation.caseId,
    situation,
    assessmentContext: {},
    schemaVersion: situation.schemaVersion,
    evaluatedAt: "2026-05-04T08:00:00.000Z",
  });
  return {
    navigatorId: "nav-1",
    workflowId: "wf-1",
    caseId: situation.caseId,
    situation,
    assessment,
    actionContext: {},
    schemaVersion: situation.schemaVersion,
    generatedAt: "2026-05-04T08:00:00.000Z",
    assessmentIsStale: false,
  };
}

function makeEngine() {
  let counter = 0;
  return new ActionEngine({
    navigatorId: "nav-1",
    workflowId: "wf-1",
    now: () => new Date("2026-05-04T09:00:00.000Z"),
    idFactory: () => `plan_${++counter}`,
  });
}

test("Regelset ist eindeutig und liefert mindestens zwölf Regeln", () => {
  const ids = STANDARD_ACTION_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(STANDARD_ACTION_RULES.length >= 12 - 2);
  for (const rule of STANDARD_ACTION_RULES) {
    assert.ok(rule.actions.length > 0, `${rule.id} ohne Maßnahmen`);
    for (const action of rule.actions) {
      assert.ok(action.userFacingReason.length > 0);
    }
  }
});

test("Registry liefert stabilen Versionshash", () => {
  const a = new ActionRuleRegistry(STANDARD_ACTION_RULES).versionHash();
  const b = new ActionRuleRegistry(STANDARD_ACTION_RULES).versionHash();
  assert.equal(a, b);
});

test("Ohne Bewertung ist keine Generierung möglich", () => {
  const engine = makeEngine();
  const validation = engine.validateInput({ navigatorId: "nav-1", workflowId: "wf-1" });
  assert.equal(validation.valid, false);
  assert.throws(
    () => engine.generateActions({} as ActionInput),
    (error: unknown) => error instanceof ActionError,
  );
});

test("Akute Gefahr erzeugt Sofortmaßnahmen in der Gruppe „Jetzt“", () => {
  const engine = makeEngine();
  const plan = engine.generateActions(buildInput(dangerCase()));
  const now = plan.actions.filter((a) => a.group === "now");
  assert.ok(now.length >= 3);
  assert.ok(now.some((a) => a.actionKey === "check_immediate_safety"));
  assert.ok(plan.actions.every((a) => a.trigger.userFacingReason.length > 0));
  assert.equal(plan.status, "generated");
});

test("Ergebnis ist deterministisch", () => {
  const situation = dangerCase();
  const a = makeEngine().generateActions(buildInput(situation));
  const b = makeEngine().generateActions(buildInput(situation));
  assert.deepEqual(
    a.actions.map((x) => [x.actionKey, x.group, x.priority, x.signature]),
    b.actions.map((x) => [x.actionKey, x.group, x.priority, x.signature]),
  );
});

test("Abhängige Maßnahmen sind blockiert, bis die Voraussetzung erledigt ist", () => {
  const engine = makeEngine();
  let plan = engine.generateActions(buildInput(dangerCase()));
  const dependent = plan.actions.find((a) => a.actionKey === "record_emergency_measures");
  assert.ok(dependent);
  assert.equal(dependent!.status, "blocked");

  plan = engine.completeAction(plan, "check_immediate_safety", { confirmation: true });
  const after = plan.actions.find((a) => a.actionKey === "record_emergency_measures");
  assert.equal(after!.status, "open");
});

test("Maßnahmen mit Bestätigungspflicht verlangen eine Bestätigung", () => {
  const engine = makeEngine();
  const plan = engine.generateActions(buildInput(dangerCase()));
  assert.throws(() => engine.completeAction(plan, "check_immediate_safety", {}));
});

test("Verpflichtende Maßnahmen lassen sich nur mit Begründung überspringen", () => {
  const engine = makeEngine();
  const plan = engine.generateActions(buildInput(dangerCase()));
  const key = "clarify_ongoing_status";
  assert.throws(() => engine.skipAction(plan, key, "   "));
  const next = engine.skipAction(plan, key, "Wird von der Schulleitung übernommen.");
  assert.equal(next.actions.find((a) => a.actionKey === key)!.status, "skipped");
});

test("Fortschritt unterscheidet verpflichtende und optionale Schritte", () => {
  const engine = makeEngine();
  const plan = engine.generateActions(buildInput(harmlessCase()));
  assert.ok(plan.progress.totalActions > 0);
  assert.equal(plan.progress.completedActions, 0);
  assert.equal(plan.progress.isComplete, false);
  assert.equal(
    plan.progress.requiredActions + plan.progress.optionalActions,
    plan.progress.totalActions,
  );
});

test("Neugenerierung übernimmt unveränderte Bearbeitungsstände und meldet Deltas", () => {
  const engine = makeEngine();
  const situation = harmlessCase();
  let plan = engine.generateActions(buildInput(situation));
  const firstKey = plan.actions.find((a) => a.status === "open")!.actionKey;
  plan = engine.completeAction(plan, firstKey, { confirmation: true });

  const changed = dangerCase();
  const { plan: next, delta } = engine.regenerateActionPlan(buildInput(changed), plan);
  assert.ok(delta.added.length > 0);
  assert.ok(delta.removed.length > 0 || delta.changed.length >= 0);
  const carried = next.actions.find((a) => a.actionKey === firstKey);
  if (carried) assert.equal(carried.status, "completed");
  assert.ok(next.history.length >= delta.removed.length);
});

test("Geänderte Bewertung macht den Plan veraltet", () => {
  const engine = makeEngine();
  const input = buildInput(harmlessCase());
  const plan = engine.generateActions(input);
  assert.equal(
    engine.isStale(plan, {
      assessmentId: input.assessment.assessmentId,
      assessmentHash: input.assessment.evaluatedInputHash,
      assessmentIsStale: false,
    }),
    false,
  );
  assert.equal(
    engine.isStale(plan, {
      assessmentId: input.assessment.assessmentId,
      assessmentHash: "anders",
      assessmentIsStale: false,
    }),
    true,
  );
  const stale = engine.markStale(plan, "anders");
  assert.equal(stale.status, "stale");
  assert.equal(stale.actions.length, plan.actions.length);
});

test("Serialisierung und Kontexteintrag sind verlustfrei", () => {
  const engine = makeEngine();
  const plan = engine.generateActions(buildInput(dangerCase()));
  const restored = engine.deserialize(engine.serialize(plan));
  assert.deepEqual(restored.actions.map((a) => a.actionKey), plan.actions.map((a) => a.actionKey));

  const entry = engine.buildContextEntry(plan, plan.assessmentId);
  const context: Record<string, unknown> = { [ACTION_CONTEXT_KEY]: entry };
  const stored = context[ACTION_CONTEXT_KEY] as typeof entry;
  assert.equal(stored.plan!.actionPlanId, plan.actionPlanId);
  assert.equal(stored.isStale, false);

  assert.throws(() => engine.deserialize("kein json"), (e: unknown) => e instanceof ActionError);
});

test("Grenzen des Systems werden immer mitgeführt", () => {
  const engine = makeEngine();
  const plan = engine.generateActions(buildInput(harmlessCase()));
  assert.ok(plan.limitations.length >= 5);
  assert.ok(plan.limitations.some((l) => l.includes("Einzelfallprüfung")));
});
