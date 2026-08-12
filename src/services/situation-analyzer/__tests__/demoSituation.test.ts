/**
 * Sprint 4.6D – Tests der Demo-Situation.
 * Prüft Erzeugung über die bestehenden Services, Validität, Vollständigkeit,
 * Serialisierbarkeit, Navigator-Persistenz und die Anschlussfähigkeit an
 * Assessment Engine und Action Engine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDemoSituationCase,
  DEMO_SITUATION_TITLE,
  SituationAnalyzerService,
  SituationCaseMapper,
  SituationCompletenessCalculator,
  SituationValidator,
  buildStandardSituationSchema,
  SITUATION_CONTEXT_KEY,
  STANDARD_SITUATION_SCHEMA_ID,
} from "../index";
import {
  DecisionNavigatorEngine,
  InMemoryNavigatorSessionStore,
  NAVIGATOR_SESSION_IDS,
} from "../../decision-navigator/index";
import { isSituationComplete } from "../../../components/navigator/situation/SituationStepPanel";
import { AssessmentEngine } from "../../assessment-engine/index";
import { ActionEngine } from "../../action-engine/index";

const schema = buildStandardSituationSchema();

function demo() {
  return buildDemoSituationCase("nav-demo", "wf-demo");
}

test("Demo-Situation wird über den bestehenden Service und das Standardschema erzeugt", () => {
  const situationCase = demo();
  assert.equal(situationCase.schemaId, STANDARD_SITUATION_SCHEMA_ID);
  assert.equal(situationCase.navigatorId, "nav-demo");
  assert.equal(situationCase.workflowId, "wf-demo");
  assert.equal(situationCase.title, DEMO_SITUATION_TITLE);
  // Alle Antworten verweisen auf Fragen des Standardschemas.
  const known = new Set(schema.questions.map((q) => q.id));
  for (const id of Object.keys(situationCase.answers)) assert.equal(known.has(id), true, id);
});

test("Demo-Situation ist nach dem Validator valide", () => {
  const result = new SituationValidator(schema).validate(demo());
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);
});

test("Demo-Situation hat keine offenen sichtbaren Pflichtfragen", () => {
  const situationCase = demo();
  const completeness = new SituationCompletenessCalculator(schema).calculate(situationCase.answers);
  assert.deepEqual(completeness.missingRequiredQuestions, []);
  assert.equal(completeness.isComplete, true);
  assert.equal(completeness.completionPercentage, 100);
  assert.equal(situationCase.status, "complete");
});

test("Demo-Situation enthält die geforderten strukturierten Angaben", () => {
  const c = demo();
  assert.equal(c.incident.locationType, "classroom");
  assert.equal(c.incident.dateKnown, "unknown");
  assert.equal(c.incident.isOngoing, "notApplicable");
  assert.equal(c.incident.wasRepeated, "known");
  assert.equal(c.dangerInformation.acuteDangerReported, "notApplicable");
  assert.equal(c.participants.length >= 2, true);
  const roles = c.participants.map((p) => p.role);
  assert.equal(roles.includes("teacher"), true);
  assert.equal(roles.includes("student"), true);
  assert.equal(c.witnesses.length, 1);
  assert.equal(c.measuresTaken.length, 1);
  assert.equal(c.documentationStatus.notesAvailable, "known");
  assert.equal(c.documentationStatus.incidentReportAvailable, "notApplicable");
  assert.deepEqual(c.responsiblePersonsInformed, ["classTeacher"]);
  // Keine realen Namen: alle Anzeigenamen sind als Demo gekennzeichnet.
  for (const p of c.participants) assert.match(p.displayName, /Demo/);
});

test("Demo-Situation ist vollständig serialisierbar und wieder ladbar", () => {
  const situationCase = demo();
  const raw = SituationCaseMapper.serialize(situationCase);
  const restored = SituationCaseMapper.deserialize(raw);
  assert.equal(restored.caseId, situationCase.caseId);
  assert.deepEqual(restored.answers, situationCase.answers);
  const service = new SituationAnalyzerService({ navigatorId: "nav-demo", workflowId: "wf-demo" });
  const loaded = service.loadCase(raw);
  assert.equal(loaded.status, "complete");
  assert.equal(service.validate().valid, true);
});

test("Demo wird in context.situation gespeichert und nach Reload wiederhergestellt", () => {
  const store = new InMemoryNavigatorSessionStore();
  const engine = new DecisionNavigatorEngine({
    navigatorId: NAVIGATOR_SESSION_IDS.demo,
    store,
  });
  engine.start();
  const situationCase = buildDemoSituationCase(
    engine.getState().navigatorId,
    engine.getState().workflowId,
  );
  engine.patchContext({ [SITUATION_CONTEXT_KEY]: situationCase });

  const resumed = DecisionNavigatorEngine.resumeFromStore(NAVIGATOR_SESSION_IDS.demo, store);
  assert.ok(resumed);
  const restored = resumed.getState().context[SITUATION_CONTEXT_KEY] as typeof situationCase;
  assert.equal(restored.title, DEMO_SITUATION_TITLE);
  assert.equal(restored.completeness.isComplete, true);
});

test("Weiter-Navigation ist mit der Demo ohne weitere Eingaben möglich", () => {
  const store = new InMemoryNavigatorSessionStore();
  const engine = new DecisionNavigatorEngine({
    navigatorId: NAVIGATOR_SESSION_IDS.demo,
    store,
  });
  engine.start();
  engine.patchContext({
    [SITUATION_CONTEXT_KEY]: buildDemoSituationCase(
      engine.getState().navigatorId,
      engine.getState().workflowId,
    ),
  });
  assert.equal(isSituationComplete(engine.getState().context), true);
  engine.next();
  assert.equal(engine.getState().currentStep, "situation");
  engine.next();
  assert.notEqual(engine.getState().currentStep, "situation");
});

test("Demo erzeugt ein Assessment und daraus einen Maßnahmenplan", () => {
  const situation = demo();
  const assessmentEngine = new AssessmentEngine({
    navigatorId: "nav-demo",
    workflowId: "wf-demo",
  });
  const assessment = assessmentEngine.evaluate({
    navigatorId: "nav-demo",
    workflowId: "wf-demo",
    caseId: situation.caseId,
    situation,
    assessmentContext: {},
    schemaVersion: situation.schemaVersion,
    evaluatedAt: new Date("2026-06-01T10:00:00.000Z").toISOString(),
  });
  assert.ok(assessment.trafficLight);
  assert.equal(assessment.reasons.length > 0, true);

  const actionEngine = new ActionEngine({ navigatorId: "nav-demo", workflowId: "wf-demo" });
  const plan = actionEngine.generateActions({
    navigatorId: "nav-demo",
    workflowId: "wf-demo",
    caseId: situation.caseId,
    situation,
    assessment,
    actionContext: {},
    schemaVersion: situation.schemaVersion,
    generatedAt: new Date("2026-06-01T10:05:00.000Z").toISOString(),
  });

  assert.equal(plan.actions.length > 0, true);
});
