/**
 * Sprint 4.3B – Integrations-/Golden-Reference-Test.
 * End-to-End über die Engine mit In-Memory-Adapters; verifiziert die
 * Persistenz-Semantik, die auch die Supabase-Adapter erfüllen müssen
 * (Session-Insert + Steps atomar, Step-Upsert idempotent, Event-Append-only).
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildPilotWorkflow,
  InMemoryTemplateRepository,
  InMemoryWorkflowRepository,
  WorkflowEngine,
  WorkflowError,
  workflowTelemetry,
} from "../index";

async function setup() {
  workflowTelemetry.reset();
  const templates = new InMemoryTemplateRepository();
  const tpl = buildPilotWorkflow();
  templates.seed([tpl]);
  const sessions = new InMemoryWorkflowRepository();
  const engine = new WorkflowEngine({ templates, sessions });
  return { templates, sessions, engine, tpl };
}

test("api: startSession persistiert Session + alle Steps", async () => {
  const { engine, sessions, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const persisted = await sessions.getSession(session.id);
  assert.ok(persisted);
  const totalSteps = tpl.phases.flatMap((p) => p.steps).length;
  assert.equal(persisted!.steps.length, totalSteps);
});

test("api: Step-Transition ist idempotent (Upsert auf session_id,step_id)", async () => {
  const { engine, sessions, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const first = tpl.phases[0].steps[0];
  await engine.transitionStep({ sessionId: session.id, stepId: first.id, to: "active" });
  // Erneute Transition-Kette darf keine Duplikate erzeugen
  await engine.transitionStep({ sessionId: session.id, stepId: first.id, to: "completed" });
  const steps = await sessions.listSteps(session.id);
  const forFirst = steps.filter((s) => s.stepId === first.id);
  assert.equal(forFirst.length, 1);
  assert.equal(forFirst[0].status, "completed");
});

test("api: Events sind append-only-ähnlich (List enthält alle Übergänge in Reihenfolge)", async () => {
  const { engine, sessions, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const first = tpl.phases[0].steps[0];
  await engine.transitionStep({ sessionId: session.id, stepId: first.id, to: "active" });
  await engine.transitionStep({ sessionId: session.id, stepId: first.id, to: "completed" });
  const events = await sessions.listEvents(session.id);
  const types = events.map((e) => e.eventType);
  assert.ok(types[0] === "workflow_started");
  assert.ok(types.includes("workflow_step_started"));
  assert.ok(types.includes("workflow_step_completed"));
});

test("api: Ownership – fremder Nutzer erhält Session nicht (Simulation)", async () => {
  const { engine, sessions, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const otherView = await sessions.listSessionsForUser("u2");
  assert.equal(otherView.length, 0);
  const own = await sessions.listSessionsForUser("u1");
  assert.equal(own.length, 1);
  assert.equal(own[0].id, session.id);
});

test("api: Cancel blockiert weitere Transitions", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  await engine.cancel(session.id, "u1");
  const first = tpl.phases[0].steps[0];
  await assert.rejects(
    () => engine.transitionStep({ sessionId: session.id, stepId: first.id, to: "active" }),
    (e) => e instanceof WorkflowError,
  );
});

test("api: Golden Reference – Pilot-Workflow endet in status=completed", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  for (const phase of tpl.phases) {
    for (const step of phase.steps) {
      // Pflicht-Checklisten erfüllen, damit block_workflow-Regeln nicht greifen
      for (const c of step.checklists.filter((c) => c.isRequired)) {
        await engine.toggleChecklistItem({
          sessionId: session.id, stepId: step.id, itemId: c.id, done: true, actor: "u1",
        });
      }
      await engine.transitionStep({ sessionId: session.id, stepId: step.id, to: "active" });
      await engine.transitionStep({ sessionId: session.id, stepId: step.id, to: "completed" });
    }
  }
  const final = await engine.loadSession(session.id);
  assert.equal(final.status, "completed");
});

test("api: Telemetrie schreibt workflow_started und step_completed", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const first = tpl.phases[0].steps[0];
  await engine.transitionStep({ sessionId: session.id, stepId: first.id, to: "active" });
  await engine.transitionStep({ sessionId: session.id, stepId: first.id, to: "completed" });
  const snap = workflowTelemetry.snapshot();
  assert.ok(snap.some((e) => e.event === "workflow_started"));
  assert.ok(snap.some((e) => e.event === "workflow_step_completed"));
});
