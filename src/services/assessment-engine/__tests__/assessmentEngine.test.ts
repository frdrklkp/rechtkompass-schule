/**
 * Sprint 4.6C – Tests der Assessment Engine.
 * Deterministische Prüfung von Regeln, Aggregation, Konflikten, Konfidenz,
 * Stale-Erkennung und Navigator-Persistenz.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_CONTEXT_KEY,
  AssessmentEngine,
  AssessmentError,
  evaluateCondition,
  readField,
  AssessmentRuleRegistry,
  STANDARD_ASSESSMENT_RULES,
  buildSituationOverview,
  computeInputHash,
  labelForField,
  type AssessmentEvent,
} from "../index";
import {
  SITUATION_CONTEXT_KEY,
  SituationAnalyzerService,
  type SituationCase,
} from "../../situation-analyzer/index";
import {
  DecisionNavigatorEngine,
  InMemoryNavigatorSessionStore,
} from "../../decision-navigator/index";

function makeService() {
  const service = new SituationAnalyzerService({ navigatorId: "nav-1", workflowId: "wf-1" });
  service.createCase();
  return service;
}

/** Vollständig erfasster, unkritischer Sachverhalt. */
function completeHarmlessCase(): SituationCase {
  const service = makeService();
  service.answerQuestion("kurzbeschreibung.titel", "Vorgang A");
  service.answerQuestion("kurzbeschreibung.text", "Auseinandersetzung im Unterricht.");
  service.answerQuestion("zeit-ort.datumBekannt", true);
  service.answerQuestion("zeit-ort.datum", "2026-05-04");
  service.answerQuestion("zeit-ort.ortstyp", "classroom");
  service.addParticipant({ displayName: "Schüler A", role: "student" });
  service.answerQuestion("beteiligte.liste", "erfasst");
  service.answerQuestion("betroffene.vorhanden", false);
  service.answerQuestion("zeugen.vorhanden", false);
  service.answerQuestion("fortdauer.andauernd", false);
  service.answerQuestion("fortdauer.wiederholt", false);
  service.answerQuestion("gefahren.gemeldet", false);
  service.answerQuestion("nachweise.vorhanden", false);
  service.answerQuestion("massnahmen.durchgefuehrt", false);
  service.answerQuestion("informierte.stellen", ["schoolLeadership"]);
  service.answerQuestion("dokumentation.notizen", true);
  service.answerQuestion("dokumentation.vorfallsbericht", false);
  return service.getCase()!;
}

function makeEngine() {
  return new AssessmentEngine({ navigatorId: "nav-1", workflowId: "wf-1" });
}

function evaluate(situation: SituationCase, engine = makeEngine()) {
  return engine.evaluate({
    navigatorId: "nav-1",
    workflowId: "wf-1",
    caseId: situation.caseId,
    situation,
    assessmentContext: {},
    schemaVersion: situation.schemaVersion,
    evaluatedAt: new Date().toISOString(),
  });
}

/* ------------------------------ Validierung ------------------------------- */

test("A1 – fehlendes SituationCase wird als ungültig erkannt", () => {
  const result = makeEngine().validateInput(null);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].code, "situation_missing");
});

test("A2 – ungültige Struktur wird erkannt", () => {
  const result = makeEngine().validateInput({ caseId: 42 });
  assert.equal(result.valid, false);
  assert.ok(result.issues.length > 0);
});

test("A3 – vollständiges SituationCase ist gültig", () => {
  assert.equal(makeEngine().validateInput(completeHarmlessCase()).valid, true);
});

test("A4 – evaluate wirft AssessmentError bei ungültiger Eingabe", () => {
  const engine = makeEngine();
  assert.throws(
    () =>
      engine.evaluate({
        navigatorId: "nav-1",
        workflowId: "wf-1",
        caseId: "x",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        situation: null as any,
        assessmentContext: {},
        schemaVersion: 1,
        evaluatedAt: new Date().toISOString(),
      }),
    AssessmentError,
  );
});

/* ------------------------------ Regelwerk --------------------------------- */

test("B1 – Standardregeln sind eindeutig und strukturell gültig", () => {
  const registry = new AssessmentRuleRegistry(STANDARD_ASSESSMENT_RULES);
  const ids = registry.list().map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 10);
  for (const rule of registry.list()) {
    assert.ok(rule.title.length > 0);
    assert.ok(rule.conditions.length >= 0);
    assert.ok(rule.version >= 1);
  }
});

test("B2 – Registry sortiert nach Priorität (kritisch zuerst)", () => {
  const sorted = new AssessmentRuleRegistry(STANDARD_ASSESSMENT_RULES).list();
  const order = ["critical", "high", "normal", "low"];
  let last = -1;
  for (const rule of sorted) {
    const idx = order.indexOf(rule.priority);
    assert.ok(idx >= last, `Reihenfolge verletzt bei ${rule.id}`);
    last = idx;
  }
});

test("B3 – Operatoren werden typisiert ausgewertet", () => {
  const situation = completeHarmlessCase();
  assert.equal(
    evaluateCondition(situation, {
      field: "incident.isOngoing",
      operator: "isFalse",
      valueType: "knowledgeState",
      operatorGroup: "knowledge",
    }),
    true,
  );
  assert.equal(
    evaluateCondition(situation, {
      field: "participants",
      operator: "countGreaterThan",
      value: 0,
      valueType: "number",
      operatorGroup: "collection",
    }),
    true,
  );
  assert.equal((readField(situation, "participants") as unknown[]).length, 1);
});

/* ------------------------------ Ampellogik -------------------------------- */

test("C1 – akute Gefahr führt zu Rot und kritischem Schweregrad", () => {
  const service = makeService();
  const base = completeHarmlessCase();
  void base;
  const s = makeService();
  s.answerQuestion("kurzbeschreibung.titel", "Gefahrenlage");
  s.answerQuestion("kurzbeschreibung.text", "Akute Gefahr im Schulgebäude.");
  s.answerQuestion("zeit-ort.datumBekannt", true);
  s.answerQuestion("zeit-ort.datum", "2026-05-04");
  s.answerQuestion("zeit-ort.ortstyp", "classroom");
  s.addParticipant({ displayName: "Schüler B", role: "student" });
  s.answerQuestion("beteiligte.liste", "erfasst");
  s.answerQuestion("betroffene.vorhanden", false);
  s.answerQuestion("zeugen.vorhanden", false);
  s.answerQuestion("fortdauer.andauernd", false);
  s.answerQuestion("fortdauer.wiederholt", false);
  s.answerQuestion("gefahren.gemeldet", true);
  s.answerQuestion("gefahren.art", "Körperliche Gefährdung");
  s.answerQuestion("gefahren.andauernd", false);
  s.answerQuestion("gefahren.rettungsdienste", false);
  s.answerQuestion("nachweise.vorhanden", false);
  s.answerQuestion("massnahmen.durchgefuehrt", false);
  s.answerQuestion("informierte.stellen", ["schoolLeadership"]);
  s.answerQuestion("dokumentation.notizen", true);
  s.answerQuestion("dokumentation.vorfallsbericht", false);
  const result = evaluate(s.getCase()!);
  assert.equal(result.trafficLight, "red");
  assert.equal(result.severity, "critical");
  assert.ok(result.reasons.some((r) => r.impact === "critical"));
  void service;
});

test("C2 – wiederholtes Geschehen führt mindestens zu Gelb", () => {
  const s = makeService();
  s.answerQuestion("kurzbeschreibung.titel", "Wiederholung");
  s.answerQuestion("kurzbeschreibung.text", "Wiederholtes Verhalten.");
  s.answerQuestion("zeit-ort.datumBekannt", true);
  s.answerQuestion("zeit-ort.datum", "2026-05-04");
  s.answerQuestion("zeit-ort.ortstyp", "classroom");
  s.addParticipant({ displayName: "Schüler C", role: "student" });
  s.answerQuestion("beteiligte.liste", "erfasst");
  s.answerQuestion("betroffene.vorhanden", false);
  s.answerQuestion("zeugen.vorhanden", false);
  s.answerQuestion("fortdauer.andauernd", false);
  s.answerQuestion("fortdauer.wiederholt", true);
  s.answerQuestion("gefahren.gemeldet", false);
  s.answerQuestion("nachweise.vorhanden", false);
  s.answerQuestion("massnahmen.durchgefuehrt", false);
  s.answerQuestion("informierte.stellen", ["schoolLeadership"]);
  s.answerQuestion("dokumentation.notizen", true);
  s.answerQuestion("dokumentation.vorfallsbericht", false);
  const result = evaluate(s.getCase()!);
  assert.equal(result.trafficLight, "yellow");
});

test("C3 – unkritischer, vollständiger Sachverhalt ergibt Grün", () => {
  const result = evaluate(completeHarmlessCase());
  assert.equal(result.trafficLight, "green");
  assert.equal(result.status, "completed");
});

test("C4 – unvollständige Erfassung ergibt Unklar", () => {
  const s = makeService();
  s.answerQuestion("kurzbeschreibung.titel", "Nur Titel");
  const result = evaluate(s.getCase()!);
  assert.equal(result.trafficLight, "unknown");
  assert.ok(["incomplete", "conflicted"].includes(result.status));
  assert.ok(result.missingInformation.length > 0);
});

test("C5 – Dokumentation hebt eine rote Einstufung nicht auf", () => {
  const s = makeService();
  s.answerQuestion("kurzbeschreibung.titel", "Gefahr trotz Doku");
  s.answerQuestion("kurzbeschreibung.text", "Akute Gefahr, Dokumentation vorhanden.");
  s.answerQuestion("zeit-ort.datumBekannt", true);
  s.answerQuestion("zeit-ort.datum", "2026-05-04");
  s.answerQuestion("zeit-ort.ortstyp", "classroom");
  s.addParticipant({ displayName: "Schüler D", role: "student" });
  s.answerQuestion("beteiligte.liste", "erfasst");
  s.answerQuestion("betroffene.vorhanden", false);
  s.answerQuestion("zeugen.vorhanden", false);
  s.answerQuestion("fortdauer.andauernd", false);
  s.answerQuestion("fortdauer.wiederholt", false);
  s.answerQuestion("gefahren.gemeldet", true);
  s.answerQuestion("gefahren.art", "Gefährdung");
  s.answerQuestion("gefahren.andauernd", false);
  s.answerQuestion("gefahren.rettungsdienste", true);
  s.answerQuestion("nachweise.vorhanden", false);
  s.answerQuestion("massnahmen.durchgefuehrt", false);
  s.answerQuestion("informierte.stellen", ["schoolLeadership"]);
  s.answerQuestion("dokumentation.notizen", true);
  s.answerQuestion("dokumentation.vorfallsbericht", true);
  const result = evaluate(s.getCase()!);
  assert.equal(result.trafficLight, "red");
});

test("C6 – Bewertung ist deterministisch", () => {
  const situation = completeHarmlessCase();
  const a = evaluate(situation);
  const b = evaluate(situation);
  assert.equal(a.trafficLight, b.trafficLight);
  assert.equal(a.severity, b.severity);
  assert.deepEqual(
    a.reasons.map((r) => r.ruleId),
    b.reasons.map((r) => r.ruleId),
  );
  assert.equal(a.confidence.score, b.confidence.score);
});

/* ------------------------- Gründe, Grenzen, Konfidenz ---------------------- */

test("D1 – jeder Grund besitzt verständlichen Text und Herkunft", () => {
  const result = evaluate(completeHarmlessCase());
  for (const reason of result.reasons) {
    assert.ok(reason.userFacingText.length > 10);
    assert.ok(reason.ruleId.length > 0);
    assert.ok(Array.isArray(reason.sourceFields));
  }
});

test("D2 – Limitations sind immer vorhanden", () => {
  const result = evaluate(completeHarmlessCase());
  assert.ok(result.limitations.length >= 4);
  assert.ok(result.limitations.some((l) => l.toLowerCase().includes("keine rechtsberatung")));
});

test("D3 – Konfidenz liegt zwischen 0 und 100 und ist begründet", () => {
  const result = evaluate(completeHarmlessCase());
  assert.ok(result.confidence.score >= 0 && result.confidence.score <= 100);
  assert.ok(["low", "medium", "high", "unknown"].includes(result.confidence.level));
  assert.ok(result.confidence.reasons.length > 0);
});

test("D4 – unvollständige Daten senken die Konfidenz", () => {
  const partial = makeService();
  partial.answerQuestion("kurzbeschreibung.titel", "Teil");
  const low = evaluate(partial.getCase()!);
  const high = evaluate(completeHarmlessCase());
  assert.ok(low.confidence.score < high.confidence.score);
});

test("D5 – Feldlabels sind menschenlesbar", () => {
  assert.notEqual(labelForField("dangerInformation.acuteDangerReported"), "dangerInformation.acuteDangerReported");
});

/* -------------------------------- Konflikte -------------------------------- */

test("E1 – widersprüchliche Angaben erzeugen einen Konflikt", () => {
  const situation = completeHarmlessCase();
  const conflicting: SituationCase = {
    ...situation,
    dangerInformation: { ...situation.dangerInformation, ongoing: "known" },
    incident: { ...situation.incident, isOngoing: "notApplicable" },
  };
  const result = evaluate(conflicting);
  assert.ok(result.conflicts.length > 0);
});

/* ------------------------- Serialisierung und Stale ------------------------ */

test("F1 – Ergebnis ist JSON-serialisierbar und wiederherstellbar", () => {
  const engine = makeEngine();
  const result = evaluate(completeHarmlessCase(), engine);
  const restored = engine.deserialize(engine.serialize(result));
  assert.deepEqual(restored, result);
});

test("F2 – ungültige Serialisierung wirft AssessmentError", () => {
  assert.throws(() => makeEngine().deserialize("{kein json"), AssessmentError);
});

test("F3 – Änderungen der Situation ändern den Input-Hash", () => {
  const situation = completeHarmlessCase();
  const before = computeInputHash(situation);
  const changed: SituationCase = {
    ...situation,
    incident: { ...situation.incident, wasRepeated: "known" },
  };
  assert.notEqual(before, computeInputHash(changed));
});

test("F4 – Kontexteintrag markiert veraltete Ergebnisse", () => {
  const engine = makeEngine();
  const situation = completeHarmlessCase();
  const result = evaluate(situation, engine);
  const changed: SituationCase = {
    ...situation,
    incident: { ...situation.incident, wasRepeated: "known" },
  };
  assert.equal(engine.buildContextEntry(situation, result).isStale, false);
  assert.equal(engine.buildContextEntry(changed, result).isStale, true);
});

test("F5 – resetAssessment liefert ein leeres Ergebnis", () => {
  const engine = makeEngine();
  const empty = engine.resetAssessment("sit_x");
  assert.equal(empty.status, "notStarted");
  assert.equal(empty.trafficLight, "unknown");
  assert.equal(empty.reasons.length, 0);
});

/* --------------------------------- Events ---------------------------------- */

test("G1 – Events werden lokal ausgelöst", () => {
  const events: AssessmentEvent[] = [];
  const engine = makeEngine();
  engine.events.subscribe((e) => events.push(e));
  evaluate(completeHarmlessCase(), engine);
  const names = events.map((e) => e.name);
  assert.ok(names.includes("AssessmentStarted"));
  assert.ok(names.includes("AssessmentCompleted"));
  assert.ok(names.includes("AssessmentRuleMatched"));
});

/* ----------------------------- Analyseübersicht ---------------------------- */

test("H1 – SituationOverview zählt Beteiligte und Kernangaben", () => {
  const overview = buildSituationOverview(completeHarmlessCase());
  assert.equal(overview.participantCount, 1);
  assert.ok(overview.keyFacts.length > 0);
  assert.ok(overview.completionPercentage > 0);
});

/* ------------------------- Navigator-Persistenz ---------------------------- */

test("I1 – Ergebnis überlebt Speichern und Wiederherstellen der Session", () => {
  const store = new InMemoryNavigatorSessionStore();
  const engine = new DecisionNavigatorEngine({ store, workflowId: "wf-1" });
  const state = engine.start();
  const situation = completeHarmlessCase();
  const assessmentEngine = makeEngine();
  const result = evaluate(situation, assessmentEngine);
  engine.patchContext({
    [SITUATION_CONTEXT_KEY]: situation,
    [ASSESSMENT_CONTEXT_KEY]: assessmentEngine.buildContextEntry(situation, result),
  });

  const raw = store.load(state.navigatorId);
  assert.ok(raw);
  const entry = raw!.context[ASSESSMENT_CONTEXT_KEY] as {
    result: { trafficLight: string; reasons: unknown[] };
    isStale: boolean;
  };
  assert.equal(entry.result.trafficLight, result.trafficLight);
  assert.equal(entry.result.reasons.length, result.reasons.length);
  assert.equal(entry.isStale, false);
});
