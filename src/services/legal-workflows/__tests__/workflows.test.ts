/**
 * Sprint 4.3 – Workflow Platform: Kerntests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPilotWorkflow,
  InMemoryTemplateRepository,
  InMemoryWorkflowRepository,
  WorkflowBuilder,
  WorkflowContextBuilder,
  WorkflowEngine,
  WorkflowError,
  WorkflowMapper,
  WorkflowNavigator,
  WorkflowProgressCalculator,
  WorkflowRecommendationService,
  WorkflowRuleEngine,
  WorkflowStateMachine,
  WorkflowStatistics,
  WorkflowTemplateService,
  WorkflowValidator,
  workflowTelemetry,
} from "../index";

async function setup() {
  const templates = new InMemoryTemplateRepository();
  const tpl = buildPilotWorkflow();
  templates.seed([tpl]);
  const sessions = new InMemoryWorkflowRepository();
  const engine = new WorkflowEngine({ templates, sessions });
  return { templates, sessions, engine, tpl };
}

test("state machine erlaubt nur definierte Übergänge", () => {
  assert.equal(WorkflowStateMachine.canSession("draft", "ready"), true);
  assert.equal(WorkflowStateMachine.canSession("completed", "running"), false);
  assert.equal(WorkflowStateMachine.canStep("open", "active"), true);
  assert.equal(WorkflowStateMachine.canStep("completed", "active"), false);
  assert.throws(() => WorkflowStateMachine.assertSession("completed", "running"));
});

test("validator meldet Zyklen und unerreichbare Schritte", () => {
  const b = new WorkflowBuilder({ title: "T" });
  const p = b.addPhase({ title: "P" });
  const a = p.addStep({ title: "A" });
  const c = p.addStep({ title: "C", dependsOn: [a.stepId] });
  // Zyklus: modifiziere direkt
  const tpl = b.build();
  tpl.phases[0].steps[0].dependsOn = [c.stepId];
  const report = WorkflowValidator.validate(tpl);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.code === "dep.cycle"));
});

test("validator akzeptiert Pilot-Workflow", () => {
  const report = WorkflowValidator.validate(buildPilotWorkflow());
  assert.equal(report.valid, true, JSON.stringify(report.issues));
});

test("navigator liefert nur Steps ohne offene Abhängigkeiten", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const ready = WorkflowNavigator.readySteps(tpl, session);
  const titles = ready.map((s) => s.title);
  assert.ok(titles.includes("Auffälligkeiten dokumentieren"));
  assert.ok(!titles.includes("Elterngespräch führen"));
});

test("engine startet Session und erzeugt open-Steps für alle Steps", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const allSteps = tpl.phases.flatMap((p) => p.steps);
  assert.equal(session.steps.length, allSteps.length);
  assert.ok(session.steps.every((s) => s.status === "open"));
});

test("engine blockiert Step ohne erfüllte Abhängigkeiten", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const elternStep = tpl.phases[1].steps.find((s) => s.title === "Elterngespräch führen")!;
  await assert.rejects(
    () => engine.transitionStep({ sessionId: session.id, stepId: elternStep.id, to: "active" }),
    (e) => e instanceof WorkflowError && e.code === "step_blocked",
  );
});

test("engine schließt Workflow ab, wenn alle Pflichtsteps done sind", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  for (const phase of tpl.phases) for (const step of phase.steps) {
    await engine.transitionStep({ sessionId: session.id, stepId: step.id, to: "active" });
    await engine.transitionStep({ sessionId: session.id, stepId: step.id, to: "completed" });
  }
  const s = await engine.loadSession(session.id);
  assert.equal(s.status, "completed");
});

test("progress-berechnung ist deterministisch", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const p0 = WorkflowProgressCalculator.compute(tpl, session);
  assert.equal(p0.workflowPercent, 0);
  const first = tpl.phases[0].steps[0];
  await engine.transitionStep({ sessionId: session.id, stepId: first.id, to: "active" });
  await engine.transitionStep({ sessionId: session.id, stepId: first.id, to: "completed" });
  const s2 = await engine.loadSession(session.id);
  const p1 = WorkflowProgressCalculator.compute(tpl, s2);
  assert.ok(p1.workflowPercent > 0 && p1.workflowPercent <= 100);
});

test("regel-engine erzeugt block_workflow bei fehlender Pflicht-Checkliste", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const actions = WorkflowRuleEngine.evaluate(tpl, session);
  assert.ok(actions.some((a) => a.kind === "block_workflow"));
});

test("recommendations bevorzugen hohe Priorität und liefern höchstens 5", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const recs = WorkflowRecommendationService.recommend(tpl, session);
  assert.ok(recs.length <= 5);
  assert.ok(recs.length > 0);
});

test("context-builder aggregiert Runtime-Kontext", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const ctx = WorkflowContextBuilder.build(tpl, session);
  assert.ok(ctx.readySteps.length > 0);
  assert.equal(ctx.progress.workflowPercent, 0);
  assert.equal(typeof ctx.isBlocked, "boolean");
});

test("template-service publish schreibt Version und setzt current_version_id", async () => {
  const repo = new InMemoryTemplateRepository();
  const tpl = buildPilotWorkflow();
  tpl.workflowStatus = "approved";
  tpl.currentVersionId = null;
  repo.seed([tpl]);
  const svc = new WorkflowTemplateService(repo);
  const { template, version } = await svc.publish(tpl.id);
  assert.equal(template.workflowStatus, "published");
  assert.equal(template.currentVersionId, version.id);
  const versions = await repo.listVersions(tpl.id);
  assert.equal(versions.length, 1);
});

test("template-service verweigert publish bei invalidem Template", async () => {
  const repo = new InMemoryTemplateRepository();
  const bad = new WorkflowBuilder({ title: "" }).build();
  repo.seed([bad]);
  const svc = new WorkflowTemplateService(repo);
  await assert.rejects(() => svc.publish(bad.id),
    (e) => e instanceof WorkflowError && e.code === "validation_failed");
});

test("engine schreibt Telemetrie- und Event-Log", async () => {
  workflowTelemetry.reset();
  const { engine, sessions, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  const events = await sessions.listEvents(session.id);
  assert.ok(events.some((e) => e.eventType === "workflow_started"));
  assert.ok(workflowTelemetry.snapshot().some((t) => t.event === "workflow_started"));
});

test("workflow-mapper faltet flache Zeilen zu verschachteltem Template", () => {
  const rows = {
    template: { id: "t", category_id: null, slug: "s", title: "T", subtitle: null, description: null,
                workflow_status: "published" as const, publication_tier: "internal" as const, current_version_id: null },
    phases: [{ id: "p1", template_id: "t", sort_order: 10, title: "P1", description: null, is_required: true, completion_condition: null }],
    steps: [{ id: "s1", template_id: "t", phase_id: "p1", sort_order: 10, title: "S1",
              description: null, goal: null, step_type: "action" as const, priority: "normal" as const,
              is_required: true, estimated_minutes: null, primary_role: null, risk_level: "low" as const }],
    dependencies: [], checklists: [], documents: [], roles: [], sources: [], rules: [],
  };
  const tpl = WorkflowMapper.fromFlat(rows);
  assert.equal(tpl.phases.length, 1);
  assert.equal(tpl.phases[0].steps[0].title, "S1");
});

test("statistiken aggregieren Sessions korrekt", () => {
  const stats = WorkflowStatistics.sessions([
    { id: "1", templateId: "t", userId: "u", status: "running", context: {}, steps: [] },
    { id: "2", templateId: "t", userId: "u", status: "completed", context: {}, steps: [],
      startedAt: new Date(Date.now() - 60000).toISOString(), completedAt: new Date().toISOString() },
    { id: "3", templateId: "t", userId: "u", status: "cancelled", context: {}, steps: [] },
  ]);
  assert.equal(stats.total, 3);
  assert.equal(stats.running, 1);
  assert.equal(stats.completed, 1);
  assert.equal(stats.cancelled, 1);
});

test("leere Workflows werden erkannt", () => {
  const empty = new WorkflowBuilder({ title: "Leer" }).build();
  const report = WorkflowValidator.validate(empty);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.code === "template.no_phases"));
});

test("große Workflows: 50 Steps performant validierbar", () => {
  const b = new WorkflowBuilder({ title: "Big" });
  const p = b.addPhase({ title: "P" });
  const ids: string[] = [];
  for (let i = 0; i < 50; i++) {
    const s = p.addStep({ title: `S${i}`, dependsOn: ids.slice(-1) });
    ids.push(s.stepId);
  }
  const t0 = Date.now();
  const rep = WorkflowValidator.validate(b.build());
  assert.equal(rep.valid, true);
  assert.ok(Date.now() - t0 < 200);
});

test("cancel setzt Session in Endstatus und blockiert weitere Übergänge", async () => {
  const { engine, tpl } = await setup();
  const { session } = await engine.startSession({ templateSlug: tpl.slug, userId: "u1" });
  await engine.cancel(session.id, "u1", "abgebrochen");
  await assert.rejects(
    () => engine.pause(session.id),
    (e) => e instanceof WorkflowError && e.code === "invalid_transition",
  );
});
