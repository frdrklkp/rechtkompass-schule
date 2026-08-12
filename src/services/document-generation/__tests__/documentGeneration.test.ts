/**
 * Sprint 4.5A – Document Generation Core: Kerntests.
 * Rein deterministisch, ohne Supabase.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DocumentGenerationService,
  InMemoryDocumentTemplateRepository,
  InMemoryWorkflowSessionDocumentRepository,
  PlaceholderResolver,
  buildDocumentContext,
  type AiFieldResolver,
  type DocumentTemplateInput,
} from "../index";
import {
  buildPilotWorkflow,
  InMemoryTemplateRepository,
  InMemoryWorkflowRepository,
  WorkflowContextBuilder,
  WorkflowEngine,
} from "@/services/legal-workflows";

async function pilotRuntime() {
  const templates = new InMemoryTemplateRepository();
  const tpl = buildPilotWorkflow();
  templates.seed([tpl]);
  const sessions = new InMemoryWorkflowRepository();
  const engine = new WorkflowEngine({ templates, sessions });
  const { session } = await engine.startSession({
    templateSlug: tpl.slug,
    userId: "u1",
    context: { participants: [{ name: "Fr. Muster", role: "Klassenlehrkraft" }] },
  });
  const runtime = WorkflowContextBuilder.build(tpl, session);
  return { tpl, session, runtime };
}

test("Platzhalter: einfache Variablen werden aufgelöst", () => {
  const r = PlaceholderResolver.resolve({
    template: "Titel: {{workflow.title}} — Datum: {{date}}",
    context: { workflow: { title: "LRS-Verfahren" }, date: "01.08.2026" },
  });
  assert.equal(r.markdown, "Titel: LRS-Verfahren — Datum: 01.08.2026");
  assert.equal(r.missing.length, 0);
});

test("Platzhalter: fehlende Werte werden markiert und gemeldet", () => {
  const r = PlaceholderResolver.resolve({
    template: "Schule: {{school}} — User: {{user.name}}",
    context: { user: { name: "" } },
  });
  assert.ok(r.markdown.includes("⟨fehlend⟩"));
  assert.equal(r.missing.length, 2);
  const keys = r.missing.map((m) => m.key).sort();
  assert.deepEqual(keys, ["school", "user.name"]);
});

test("Platzhalter: each-Schleife über Beteiligte", () => {
  const r = PlaceholderResolver.resolve({
    template: "{{#each participants}}- {{name}} ({{role}})\n{{/each}}",
    context: {
      participants: [
        { name: "Fr. A", role: "SL" },
        { name: "Hr. B", role: "KL" },
      ],
    },
  });
  assert.ok(r.markdown.includes("- Fr. A (SL)"));
  assert.ok(r.markdown.includes("- Hr. B (KL)"));
});

test("Platzhalter: leere Liste ergibt fehlend-Marker", () => {
  const r = PlaceholderResolver.resolve({
    template: "{{#each participants}}- {{name}}{{/each}}",
    context: { participants: [] },
  });
  assert.ok(r.markdown.includes("⟨fehlend⟩"));
  assert.ok(r.missing.some((m) => m.key === "participants"));
});

test("KI-Slots ohne Werte bleiben als fehlend markiert (keine erfundenen Fakten)", () => {
  const r = PlaceholderResolver.resolve({
    template: "Begründung: {{ai:begruendung}}",
    context: {},
    aiValues: {},
  });
  assert.ok(r.markdown.includes("⟨fehlend⟩"));
  assert.ok(r.missing.some((m) => m.reason === "ai_disabled"));
});

test("KI-Slots mit gelieferten Werten werden eingesetzt", () => {
  const r = PlaceholderResolver.resolve({
    template: "Begründung: {{ai:begruendung}}",
    context: {},
    aiValues: { begruendung: "Auf Grundlage der Ermittlungen …" },
  });
  assert.equal(r.markdown, "Begründung: Auf Grundlage der Ermittlungen …");
  assert.equal(r.missing.length, 0);
});

test("ContextBuilder liefert Workflow, Phase, Schritt, Rechtsgrundlagen und Rollen", async () => {
  const { session, runtime } = await pilotRuntime();
  const ctx = buildDocumentContext({
    session,
    runtime,
    actor: "u1",
    actorDisplayName: "Test User",
    school: "GS Musterberg",
  });
  const wf = ctx.workflow as { title: string };
  assert.ok(wf.title.length > 0);
  const sources = ctx.sources as Array<{ citation: string }>;
  assert.ok(Array.isArray(sources));
  const roles = ctx.roles as Array<{ role: string }>;
  assert.ok(Array.isArray(roles));
  assert.equal((ctx.user as { name: string }).name, "Test User");
  assert.equal(ctx.school, "GS Musterberg");
});

test("DocumentGenerationService erzeugt Markdown und persistiert versioniert", async () => {
  const { session, runtime } = await pilotRuntime();
  const template: DocumentTemplateInput = {
    id: "t1",
    slug: "elternbrief",
    title: "Elternbrief",
    description: null,
    documentType: "letter",
    sortOrder: 0,
    aiFields: [],
    markdownBody:
      "# Elternbrief\n\n**Workflow:** {{workflow.title}}\n**Datum:** {{date}}\n**Schule:** {{school}}\n\n{{#each participants}}- {{name}} ({{role}})\n{{/each}}\n",
  };
  const docs = new InMemoryWorkflowSessionDocumentRepository();
  const svc = new DocumentGenerationService({ documents: docs });
  const doc = await svc.generate({
    session,
    runtime,
    template,
    actor: "u1",
    school: "GS Musterberg",
    now: new Date("2026-08-01T10:00:00Z"),
  });
  assert.ok(doc.markdown.includes("**Schule:** GS Musterberg"));
  assert.ok(doc.markdown.includes("Fr. Muster"));
  assert.equal(doc.status, "generated");
  assert.equal(doc.workflowVersionId, session.templateVersionId ?? runtime.template.currentVersionId ?? null);
  // Versionierung: gespeichert und auffindbar.
  const list = await docs.listBySession(session.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, doc.id);
});

test("DocumentGenerationService: mehrere Vorlagen erzeugen mehrere Dokumente", async () => {
  const { session, runtime } = await pilotRuntime();
  const tplA: DocumentTemplateInput = {
    id: "a", slug: "a", title: "A", description: null, documentType: null,
    markdownBody: "A: {{workflow.title}}", sortOrder: 0, aiFields: [],
  };
  const tplB: DocumentTemplateInput = {
    id: "b", slug: "b", title: "B", description: null, documentType: null,
    markdownBody: "B: {{workflow.title}}", sortOrder: 1, aiFields: [],
  };
  const docs = new InMemoryWorkflowSessionDocumentRepository();
  const svc = new DocumentGenerationService({ documents: docs });
  await svc.generate({ session, runtime, template: tplA, actor: "u1" });
  await svc.generate({ session, runtime, template: tplB, actor: "u1" });
  const list = await docs.listBySession(session.id);
  assert.equal(list.length, 2);
});

test("DocumentGenerationService: KI-Feld wird gefüllt (Grounding: nur gelieferter Text)", async () => {
  const { session, runtime } = await pilotRuntime();
  const ai: AiFieldResolver = {
    async resolve({ placeholder }) {
      return { text: `KI-Text für ${placeholder}` };
    },
  };
  const docs = new InMemoryWorkflowSessionDocumentRepository();
  const svc = new DocumentGenerationService({ documents: docs, ai });
  const template: DocumentTemplateInput = {
    id: "t", slug: "s", title: "Mit KI", description: null, documentType: null, sortOrder: 0,
    markdownBody: "Begründung: {{ai:begruendung}}",
    aiFields: [{ placeholder: "begruendung", prompt: "Bitte fasse zusammen." }],
  };
  const doc = await svc.generate({ session, runtime, template, actor: "u1" });
  assert.ok(doc.markdown.includes("KI-Text für begruendung"));
  assert.equal(doc.missingPlaceholders.length, 0);
});

test("DocumentGenerationService: fehlender AI-Provider markiert Slot als fehlend, erfindet nichts", async () => {
  const { session, runtime } = await pilotRuntime();
  const docs = new InMemoryWorkflowSessionDocumentRepository();
  const svc = new DocumentGenerationService({ documents: docs });
  const template: DocumentTemplateInput = {
    id: "t", slug: "s", title: "Ohne KI", description: null, documentType: null, sortOrder: 0,
    markdownBody: "Text: {{ai:foo}}",
    aiFields: [{ placeholder: "foo", prompt: "…" }],
  };
  const doc = await svc.generate({ session, runtime, template, actor: "u1" });
  assert.ok(doc.markdown.includes("⟨fehlend⟩"));
  assert.equal(doc.status, "partial");
  assert.ok(doc.missingPlaceholders.some((m) => m.reason === "ai_disabled"));
});

test("Version-Pinning: gespeichertes Dokument bleibt an Session-Version gebunden", async () => {
  const { session, runtime } = await pilotRuntime();
  const template: DocumentTemplateInput = {
    id: "t", slug: "s", title: "V", description: null, documentType: null, sortOrder: 0,
    markdownBody: "V: {{workflow_version}}", aiFields: [],
  };
  const docs = new InMemoryWorkflowSessionDocumentRepository();
  const svc = new DocumentGenerationService({ documents: docs });
  const doc = await svc.generate({ session, runtime, template, actor: "u1" });
  const pinned = session.templateVersionId ?? runtime.template.currentVersionId ?? null;
  assert.equal(doc.workflowVersionId, pinned);
});

test("Regenerierung überschreibt Markdown und erhöht Zähler", async () => {
  const { session, runtime } = await pilotRuntime();
  const template: DocumentTemplateInput = {
    id: "t", slug: "s", title: "R", description: null, documentType: null, sortOrder: 0,
    markdownBody: "V1: {{workflow.title}}", aiFields: [],
  };
  const docs = new InMemoryWorkflowSessionDocumentRepository();
  const svc = new DocumentGenerationService({ documents: docs });
  const doc = await svc.generate({ session, runtime, template, actor: "u1" });
  const reg = await svc.regenerate({ session, runtime, template, actor: "u1", existingDocumentId: doc.id });
  assert.equal(reg.status, "regenerated");
  assert.equal(reg.generationMetadata.regenerationCount, 1);
});

test("Template-Repo: nur im Workflow verlinkte Vorlagen werden zurückgegeben", async () => {
  const { runtime } = await pilotRuntime();
  const templates: DocumentTemplateInput[] = [
    { id: "1", slug: "unbekannt", title: "X", description: null, documentType: null, markdownBody: "", sortOrder: 0, aiFields: [] },
  ];
  const repo = new InMemoryDocumentTemplateRepository(templates);
  const list = await repo.listForRuntime(runtime);
  assert.equal(list.length, 0);
});

test("Golden Reference: Pilot-Workflow + Beispielvorlage ergibt vollständiges Markdown", async () => {
  const { session, runtime } = await pilotRuntime();
  const template: DocumentTemplateInput = {
    id: "gr", slug: "gr", title: "Aktenvermerk", description: null, documentType: "note",
    sortOrder: 0, aiFields: [],
    markdownBody: [
      "# Aktenvermerk – {{workflow.title}}",
      "",
      "**Datum:** {{date}}",
      "**Sachbearbeitung:** {{user.name}}",
      "",
      "## Aktuelle Phase",
      "{{phase.title}} – {{phase.description}}",
      "",
      "## Rechtsgrundlagen",
      "{{#each sources}}- {{citation}}\n{{/each}}",
    ].join("\n"),
  };
  const docs = new InMemoryWorkflowSessionDocumentRepository();
  const svc = new DocumentGenerationService({ documents: docs });
  const doc = await svc.generate({
    session, runtime, template,
    actor: "u1", actorDisplayName: "Testperson",
    school: "GS Musterberg", now: new Date("2026-08-01T10:00:00Z"),
  });
  assert.ok(doc.markdown.startsWith("# Aktenvermerk"));
  assert.ok(doc.markdown.includes("**Sachbearbeitung:** Testperson"));
  // Pilot hat mindestens eine Quelle
  assert.ok(doc.markdown.includes("- "));
});
