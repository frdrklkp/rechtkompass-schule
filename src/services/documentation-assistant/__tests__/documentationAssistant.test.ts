/**
 * Sprint 4.6H – Tests des Dokumentationsassistenten.
 *
 * Deterministisch, ohne Netzwerk und ohne KI (injizierter Template-Fetcher).
 * Geprüft werden Kontextaufbau, Vorlagenauflösung (Praxisfall → Kategorie →
 * allgemein), Readiness, Missing-Field-Verhalten, Entwurfsbearbeitung,
 * Veraltungserkennung, Persistenz und die Wiederverwendung der bestehenden
 * Export-Pipeline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDocumentationContext,
  checkTemplateReadiness,
  computeDocumentationInputHash,
  DocumentationAssistantService,
  DocumentationError,
  DocumentationEventBus,
  DOCUMENTATION_CONTEXT_KEY,
  DOCUMENTATION_SCHEMA_VERSION,
  isDocumentationStale,
  overallReadiness,
  resolveDocumentationTemplates,
  staleDrafts,
  toGeneratedDocument,
  type DocumentationContextEntry,
  type DocumentationContextParts,
  type DocumentationHashParts,
  type DocumentationTemplateData,
  type DocumentationTemplateRef,
} from "../index";
import { ActionEngine, type ActionPlan } from "../../action-engine/index";
import { AssessmentEngine, type AssessmentResult } from "../../assessment-engine/index";
import { MISSING_MARK } from "../../document-generation/types";
import { PlaceholderResolver } from "../../document-generation/PlaceholderResolver";
import { getExportAdapter } from "../../document-generation/export";
import type {
  LegalContextResult,
  LegalReference,
} from "../../legal-context/index";
import {
  SituationAnalyzerService,
  type SituationCase,
} from "../../situation-analyzer/index";

/* ------------------------------- Fixtures -------------------------------- */

const NOW = new Date("2026-08-01T10:00:00.000Z");
const now = () => new Date(NOW.getTime());

function makeSituationService() {
  const service = new SituationAnalyzerService({ navigatorId: "nav-1", workflowId: "wf-1" });
  service.createCase();
  return service;
}

function fullSituation(): SituationCase {
  const service = makeSituationService();
  service.answerQuestion("kurzbeschreibung.titel", "Beleidigung im Unterricht");
  service.answerQuestion(
    "kurzbeschreibung.text",
    "Eine Schülerin wurde im Unterricht beleidigt.",
  );
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

function sparseSituation(): SituationCase {
  const service = makeSituationService();
  service.answerQuestion("kurzbeschreibung.titel", "Unklarer Vorgang");
  return service.getCase()!;
}

function assessmentFor(situation: SituationCase): AssessmentResult {
  return new AssessmentEngine({ navigatorId: "nav-1", workflowId: "wf-1" }).evaluate({
    navigatorId: "nav-1",
    workflowId: "wf-1",
    caseId: situation.caseId,
    situation,
    assessmentContext: {},
    schemaVersion: situation.schemaVersion,
    evaluatedAt: "2026-05-04T08:00:00.000Z",
  });
}

function actionPlanFor(situation: SituationCase, assessment: AssessmentResult): ActionPlan {
  let counter = 0;
  const engine = new ActionEngine({
    navigatorId: "nav-1",
    workflowId: "wf-1",
    now,
    idFactory: () => `plan_${++counter}`,
  });
  return engine.generateActions({
    navigatorId: "nav-1",
    workflowId: "wf-1",
    caseId: situation.caseId,
    situation,
    assessment,
    actionContext: {},
    schemaVersion: situation.schemaVersion,
    generatedAt: "2026-05-04T08:30:00.000Z",
    assessmentIsStale: false,
  });
}

function legalReference(overrides: Partial<LegalReference> = {}): LegalReference {
  return {
    linkId: "link-1",
    sectionId: "sec-53",
    reference: "§ 53",
    title: "Ordnungsmaßnahmen",
    summary: null,
    practiceRelevance: null,
    recommendation: null,
    officialUrl: null,
    sectionStatus: "approved",
    sectionValidFrom: null,
    sectionValidTo: null,
    sectionVersionLabel: null,
    sectionLastReviewedAt: null,
    sectionUpdatedAt: "2026-07-01T08:00:00.000Z",
    originalText: null,
    source: {
      id: "src-schulg",
      name: "Schulgesetz NRW",
      shortName: "SchulG NRW",
      sourceType: "law",
      jurisdiction: "Nordrhein-Westfalen",
      officialUrl: null,
      versionLabel: null,
      lifecycleStatus: "active",
      verificationStatus: "editorial_reviewed",
      validFrom: null,
      validTo: null,
      lastVerifiedAt: null,
      lastReviewedAt: null,
      replacedBySourceId: null,
      updatedAt: "2026-07-01T08:00:00.000Z",
    },
    relevance: "high",
    linkExplanation: "Tragende Norm.",
    linkCreatedAt: "2026-07-10T09:00:00.000Z",
    freshness: "current",
    freshnessReasons: [],
    explanation: "Verknüpft über den bestätigten Praxisfall.",
    ...overrides,
  };
}

function legalContextResult(refs: LegalReference[] = [legalReference()]): LegalContextResult {
  return {
    schemaVersion: 1,
    source: {
      kind: "practice_case",
      caseId: "case-1",
      caseTitle: "Beleidigung im Unterricht",
      caseVersion: "2026-07-15T10:00:00.000Z",
    },
    references: refs,
    issues: [],
    resolvedAt: "2026-07-20T12:00:00.000Z",
    inputHash: `hash-${refs.length}`,
  };
}

const PRACTICE_CASE = { id: "case-1", title: "Beleidigung im Unterricht", version: "v1" };

/* ------------------------------- Vorlagen -------------------------------- */

const CASE_TEMPLATE = {
  id: "tpl-case",
  slug: "vorfallsdokumentation",
  title: "Vorfallsdokumentation",
  markdown_body: [
    "# {{situation.title}}",
    "Kategorie: {{situation.category}}",
    "Ort: {{incident.location}}",
    "Bewertung: {{assessment.trafficLightLabel}}",
    "{{#each actions}}- {{title}} ({{statusLabel}})\n{{/each}}",
    "{{#each legal.references}}- {{citation}}\n{{/each}}",
    "Praxisfall: {{practiceCase.title}}",
  ].join("\n"),
  document_type: "gewalt",
};

const CATEGORY_TEMPLATE = {
  id: "tpl-category",
  slug: "gespraechsnotiz",
  title: "Gesprächsnotiz",
  markdown_body: "# Gesprächsnotiz\n{{situation.title}}",
  document_type: "gewalt",
};

const GENERIC_TEMPLATE = {
  id: "tpl-generic",
  slug: "aktenvermerk",
  title: "Aktenvermerk",
  markdown_body: "# Aktenvermerk\n{{situation.title}}",
  document_type: "generic",
};

const OTHER_CATEGORY_TEMPLATE = {
  id: "tpl-other",
  slug: "andere",
  title: "Andere Kategorie",
  markdown_body: "# Andere\n{{situation.title}}",
  document_type: "datenschutz",
};

function fetcherFor(data: DocumentationTemplateData) {
  return async () => data;
}

function makeService(data: DocumentationTemplateData, events = new DocumentationEventBus()) {
  let counter = 0;
  return new DocumentationAssistantService({
    fetcher: fetcherFor(data),
    events,
    now,
    createId: () => `draft-${++counter}`,
  });
}

function partsFor(overrides: Partial<DocumentationContextParts> = {}): DocumentationContextParts {
  const situation = overrides.situation !== undefined ? overrides.situation : fullSituation();
  const assessment = situation ? assessmentFor(situation) : null;
  const actionPlan = situation && assessment ? actionPlanFor(situation, assessment) : null;
  return {
    navigatorId: "nav-1",
    workflowId: "wf-1",
    situation,
    assessment,
    actionPlan,
    legalContext: legalContextResult(),
    practiceCase: PRACTICE_CASE,
    ...overrides,
  };
}

function hashParts(
  parts: DocumentationContextParts,
  templates: Array<{ id: string; markdownBody: string }>,
): DocumentationHashParts {
  return { ...parts, templates };
}

/* ------------------------- 1. Kontextaufbau ------------------------------ */

test("DocumentationContext wird korrekt aus dem SituationCase gebaut", () => {
  const situation = fullSituation();
  const ctx = buildDocumentationContext({
    navigatorId: "nav-1",
    workflowId: "wf-1",
    situation,
    assessment: null,
    actionPlan: null,
    legalContext: null,
    practiceCase: null,
    now: now(),
  });
  const s = ctx.situation as Record<string, unknown>;
  assert.equal(s.title, "Beleidigung im Unterricht");
  assert.equal(s.description, situation.rawDescription);
  const incident = ctx.incident as Record<string, unknown>;
  assert.equal(incident.locationTypeLabel, "Klassenraum");
  assert.equal((ctx.participants as unknown[]).length, 1);
});

test("Assessment wird korrekt in den Kontext übernommen", () => {
  const parts = partsFor();
  const ctx = buildDocumentationContext({ ...parts, now: now() });
  const a = ctx.assessment as Record<string, unknown>;
  assert.equal(a.trafficLight, parts.assessment!.trafficLight);
  assert.equal(a.summary, parts.assessment!.summary);
  assert.ok(typeof a.trafficLightLabel === "string" && (a.trafficLightLabel as string).length > 0);
});

test("ActionPlan wird korrekt in den Kontext übernommen", () => {
  const parts = partsFor();
  const ctx = buildDocumentationContext({ ...parts, now: now() });
  const actions = ctx.actions as Array<Record<string, unknown>>;
  const expected = parts.actionPlan!.actions.filter((a) => a.visible && !a.noLongerCurrent);
  assert.equal(actions.length, expected.length);
  assert.deepEqual(
    actions.map((a) => a.title),
    expected.map((a) => a.title),
  );
});

test("Maßnahmen stammen ausschließlich aus dem ActionPlan", () => {
  const parts = partsFor({ actionPlan: null });
  const ctx = buildDocumentationContext({ ...parts, now: now() });
  assert.deepEqual(ctx.actions, []);
});

test("LegalContext wird korrekt übernommen", () => {
  const ctx = buildDocumentationContext({ ...partsFor(), now: now() });
  const legal = ctx.legal as { count: number; references: Array<Record<string, unknown>> };
  assert.equal(legal.count, 1);
  assert.equal(legal.references[0].citation, "SchulG NRW § 53");
});

test("LegalReferences stammen ausschließlich aus dem LegalContext", () => {
  const ctx = buildDocumentationContext({ ...partsFor({ legalContext: null }), now: now() });
  const legal = ctx.legal as { count: number; references: unknown[] };
  assert.equal(legal.count, 0);
  assert.deepEqual(legal.references, []);
});

test("Praxisfall-Metadaten werden korrekt übernommen", () => {
  const ctx = buildDocumentationContext({ ...partsFor(), now: now() });
  assert.deepEqual(ctx.practiceCase, { id: "case-1", title: "Beleidigung im Unterricht", version: "v1" });
});

test("Fehlende Daten werden nicht erfunden", () => {
  const ctx = buildDocumentationContext({
    navigatorId: "nav-1",
    workflowId: "wf-1",
    situation: null,
    assessment: null,
    actionPlan: null,
    legalContext: null,
    practiceCase: null,
    now: now(),
  });
  assert.equal(ctx.situation, null);
  assert.equal(ctx.incident, null);
  assert.equal(ctx.assessment, null);
  assert.equal(ctx.practiceCase, null);
  assert.deepEqual(ctx.participants, []);
  assert.deepEqual(ctx.evidence, []);
});

/* ------------------------ 2. Vorlagenauflösung --------------------------- */

test("Praxisfall-Vorlage hat Vorrang", () => {
  const { templates } = resolveDocumentationTemplates(
    { caseTemplates: [CASE_TEMPLATE], allTemplates: [CATEGORY_TEMPLATE, GENERIC_TEMPLATE] },
    "gewalt",
  );
  assert.equal(templates[0].id, "tpl-case");
  assert.equal(templates[0].source, "practice_case");
});

test("Kategorie-Vorlage als Fallback", () => {
  const { templates } = resolveDocumentationTemplates(
    { caseTemplates: [], allTemplates: [CATEGORY_TEMPLATE, GENERIC_TEMPLATE, OTHER_CATEGORY_TEMPLATE] },
    "gewalt",
  );
  assert.equal(templates[0].source, "category");
  assert.equal(templates[0].id, "tpl-category");
  assert.ok(!templates.some((t) => t.id === "tpl-other"), "andere Kategorie wird nicht angeboten");
});

test("Allgemeine Vorlage als letzter Fallback", () => {
  const { templates } = resolveDocumentationTemplates(
    { caseTemplates: [], allTemplates: [GENERIC_TEMPLATE, OTHER_CATEGORY_TEMPLATE] },
    null,
  );
  assert.equal(templates.length, 1);
  assert.equal(templates[0].source, "generic");
});

test("Kein Template → transparenter Leerstand", () => {
  const res = resolveDocumentationTemplates({ caseTemplates: [], allTemplates: [] }, "gewalt");
  assert.deepEqual(res.templates, []);
  assert.deepEqual(res.skipped, []);
  assert.equal(overallReadiness(true, []), "unknown");
});

test("Vorlage ohne Inhalt wird begründet übersprungen", () => {
  const res = resolveDocumentationTemplates(
    { caseTemplates: [], allTemplates: [{ id: "tpl-empty", title: "Leer", document_type: "generic" }] },
    null,
  );
  assert.deepEqual(res.templates, []);
  assert.equal(res.skipped.length, 1);
  assert.equal(res.skipped[0].id, "tpl-empty");
});

/* ---------------------------- 3. Readiness ------------------------------- */

function templateRef(body: string): DocumentationTemplateRef {
  return {
    id: "t",
    slug: "t",
    title: "T",
    description: null,
    documentType: null,
    markdownBody: body,
    source: "generic",
    sortOrder: 0,
  };
}

test("Readiness ready, wenn alle Angaben vorliegen", () => {
  const ctx = buildDocumentationContext({ ...partsFor(), now: now() });
  const r = checkTemplateReadiness(templateRef("{{situation.title}}"), ctx, true);
  assert.equal(r.readiness, "ready");
  assert.deepEqual(r.missingFields, []);
});

test("Readiness incomplete, wenn Angaben fehlen", () => {
  const ctx = buildDocumentationContext({ ...partsFor(), now: now() });
  const r = checkTemplateReadiness(templateRef("{{gibt.es.nicht}}"), ctx, true);
  assert.equal(r.readiness, "incomplete");
  assert.equal(r.missingFields[0].key, "gibt.es.nicht");
});

test("Readiness blocked ohne erfassten Sachverhalt", () => {
  const r = checkTemplateReadiness(templateRef("{{situation.title}}"), {}, false);
  assert.equal(r.readiness, "blocked");
  assert.equal(overallReadiness(false, [r]), "blocked");
});

test("KI-Slots werden als manuelle Lücken behandelt", () => {
  const ctx = buildDocumentationContext({ ...partsFor(), now: now() });
  const r = checkTemplateReadiness(templateRef("{{ai:einschaetzung}}"), ctx, true);
  assert.equal(r.readiness, "incomplete");
  assert.deepEqual(r.missingFields, [{ key: "ai:einschaetzung", reason: "ai_disabled" }]);
});

test("Gesamtstatus ist ready, sobald eine Vorlage vollständig ist", () => {
  assert.equal(
    overallReadiness(true, [
      { templateId: "a", readiness: "incomplete", missingFields: [{ key: "x", reason: "unknown" }] },
      { templateId: "b", readiness: "ready", missingFields: [] },
    ]),
    "ready",
  );
});

/* -------------------- 4. Erzeugung & PlaceholderResolver ----------------- */

const FULL_DATA: DocumentationTemplateData = {
  caseTemplates: [CASE_TEMPLATE],
  allTemplates: [CATEGORY_TEMPLATE, GENERIC_TEMPLATE],
};

test("prepare legt Vorlagen, Readiness und Hash im Kontext-Eintrag ab", async () => {
  const service = makeService(FULL_DATA);
  const parts = partsFor();
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  assert.equal(entry.schemaVersion, DOCUMENTATION_SCHEMA_VERSION);
  assert.equal(entry.caseId, "case-1");
  assert.equal(entry.templates.length, 3);
  assert.equal(entry.readiness.length, 3);
  assert.equal(typeof entry.inputHash, "string");
  assert.deepEqual(entry.drafts, []);
});

test("Entwurf verwendet den bestehenden PlaceholderResolver", async () => {
  const service = makeService(FULL_DATA);
  const parts = partsFor();
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  const { draft } = service.generateDraft(entry, "tpl-case", parts);
  const expected = PlaceholderResolver.resolve({
    template: CASE_TEMPLATE.markdown_body,
    context: service.buildContext(parts),
  });
  assert.equal(draft.markdown, expected.markdown);
  assert.deepEqual(draft.missingPlaceholders, expected.missing);
  assert.match(draft.markdown, /Beleidigung im Unterricht/);
  assert.match(draft.markdown, /SchulG NRW § 53/);
});

test("Fehlende Werte erscheinen als ⟨fehlend⟩ und werden nicht ergänzt", async () => {
  const service = makeService({
    caseTemplates: [],
    allTemplates: [
      { id: "tpl-x", slug: "x", title: "X", markdown_body: "Ort: {{incident.location}}", document_type: "generic" },
    ],
  });
  const situation = sparseSituation();
  const parts = partsFor({ situation, legalContext: null, practiceCase: null });
  const { entry } = await service.prepare({ ...parts, category: null });
  const { draft } = service.generateDraft(entry, "tpl-x", parts);
  assert.equal(MISSING_MARK, "⟨fehlend⟩");
  assert.ok(draft.markdown.includes(MISSING_MARK));
  assert.ok(draft.missingPlaceholders.some((m) => m.key === "incident.location"));
});

test("Ohne Sachverhalt wird kein Dokument erzeugt", async () => {
  const service = makeService(FULL_DATA);
  const parts = partsFor({ situation: null, assessment: null, actionPlan: null });
  const { entry } = await service.prepare({ ...parts, category: null });
  assert.throws(
    () => service.generateDraft(entry, entry.templates[0].id, parts),
    DocumentationError,
  );
});

test("Unbekannte Vorlage wird abgewiesen", async () => {
  const service = makeService(FULL_DATA);
  const parts = partsFor();
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  assert.throws(() => service.generateDraft(entry, "nicht-vorhanden", parts), DocumentationError);
});

test("Keine KI wird aufgerufen: KI-Slots bleiben markierte Lücken", async () => {
  const service = makeService({
    caseTemplates: [],
    allTemplates: [
      { id: "tpl-ai", slug: "ai", title: "AI", markdown_body: "Einschätzung: {{ai:bewertung}}", document_type: "generic" },
    ],
  });
  const parts = partsFor();
  const { entry } = await service.prepare({ ...parts, category: null });
  const { draft } = service.generateDraft(entry, "tpl-ai", parts);
  assert.equal(draft.markdown, `Einschätzung: ${MISSING_MARK}`);
  assert.deepEqual(draft.missingPlaceholders, [{ key: "ai:bewertung", reason: "ai_disabled" }]);
});

/* -------------------------- 5. Entwurfspflege ---------------------------- */

test("Dokumententwurf kann bearbeitet werden und Bearbeitung verändert SituationCase nicht", async () => {
  const service = makeService(FULL_DATA);
  const situation = fullSituation();
  const parts = partsFor({ situation });
  const before = JSON.stringify(situation);
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  const generated = service.generateDraft(entry, "tpl-case", parts);
  const updated = service.updateDraft(generated.entry, generated.draft.id, "Handschriftlich ergänzt");
  const draft = updated.drafts.find((d) => d.id === generated.draft.id)!;
  assert.equal(draft.markdown, "Handschriftlich ergänzt");
  assert.equal(draft.status, "edited");
  assert.equal(JSON.stringify(situation), before, "SituationCase bleibt unverändert");
  assert.equal(JSON.stringify(parts.situation), before);
});

test("Ältere Entwürfe bleiben bei Neugenerierung erhalten", async () => {
  const service = makeService(FULL_DATA);
  const parts = partsFor();
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  const first = service.generateDraft(entry, "tpl-case", parts);
  const second = service.generateDraft(first.entry, "tpl-case", parts);
  assert.equal(second.entry.drafts.length, 2);
  assert.notEqual(second.draft.id, first.draft.id);
});

test("Entwurf kann entfernt werden", async () => {
  const service = makeService(FULL_DATA);
  const parts = partsFor();
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const next = service.removeDraft(gen.entry, gen.draft.id);
  assert.deepEqual(next.drafts, []);
});

test("prepare erhält bestehende Entwürfe", async () => {
  const service = makeService(FULL_DATA);
  const parts = partsFor();
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const again = await service.prepare({ ...parts, category: "gewalt", existing: gen.entry });
  assert.equal(again.entry.drafts.length, 1);
  assert.equal(again.entry.preparedAt, gen.entry.preparedAt);
});

/* ------------------------------ 6. Export -------------------------------- */

async function draftFor(): Promise<{ doc: ReturnType<typeof toGeneratedDocument> }> {
  const service = makeService(FULL_DATA);
  const parts = partsFor();
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  const { draft } = service.generateDraft(entry, "tpl-case", parts);
  return {
    doc: toGeneratedDocument(draft, {
      navigatorId: "nav-1",
      legalContext: parts.legalContext,
    }),
  };
}

test("Markdown-Export verwendet die bestehende Export-Pipeline", async () => {
  const { doc } = await draftFor();
  const res = await getExportAdapter("md").export(doc);
  assert.equal(res.format, "md");
  assert.ok(res.bytes.byteLength > 0);
  assert.match(new TextDecoder().decode(res.bytes), /Beleidigung im Unterricht/);
  assert.match(res.filename, /\.md$/);
});

test("DOCX-Export verwendet die bestehende Export-Pipeline", async () => {
  const { doc } = await draftFor();
  const res = await getExportAdapter("docx").export(doc);
  assert.equal(res.format, "docx");
  assert.ok(res.bytes.byteLength > 0);
  assert.equal(res.bytes[0], 0x50); // ZIP-Signatur "PK"
  assert.match(res.filename, /\.docx$/);
});

test("PDF-Export verwendet die bestehende Export-Pipeline", async () => {
  const { doc } = await draftFor();
  const res = await getExportAdapter("pdf").export(doc);
  assert.equal(res.format, "pdf");
  assert.equal(new TextDecoder().decode(res.bytes.slice(0, 4)), "%PDF");
  assert.match(res.filename, /\.pdf$/);
});

test("GeneratedDocument übernimmt Rechtsgrundlagen nur aus dem LegalContext", async () => {
  const { doc } = await draftFor();
  const sources = (doc.usedContext as { sources: Array<{ citation: string }> }).sources;
  assert.deepEqual(
    sources.map((s) => s.citation),
    ["SchulG NRW § 53"],
  );
  assert.equal(doc.stepId, "dokumentation");
});

/* --------------------------- 7. Stale-Erkennung -------------------------- */

async function preparedFor(parts: DocumentationContextParts) {
  const service = makeService(FULL_DATA);
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  return { service, entry };
}

test("Situationsänderung markiert Draft stale", async () => {
  const parts = partsFor();
  const { service, entry } = await preparedFor(parts);
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const changedSituation = { ...parts.situation!, updatedAt: "2026-08-02T10:00:00.000Z" };
  const nextHash = service.computeHash(
    hashParts({ ...parts, situation: changedSituation }, entry.templates),
  );
  assert.equal(isDocumentationStale(gen.entry, nextHash), true);
  assert.equal(service.staleDrafts(gen.entry, nextHash).length, 1);
});

test("Assessmentänderung markiert Draft stale", async () => {
  const parts = partsFor();
  const { service, entry } = await preparedFor(parts);
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const changed = { ...parts.assessment!, trafficLight: "red" as const };
  const nextHash = service.computeHash(hashParts({ ...parts, assessment: changed }, entry.templates));
  assert.equal(isDocumentationStale(gen.entry, nextHash), true);
});

test("ActionPlanänderung markiert Draft stale", async () => {
  const parts = partsFor();
  const { service, entry } = await preparedFor(parts);
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const changed: ActionPlan = {
    ...parts.actionPlan!,
    updatedAt: "2026-08-03T09:00:00.000Z",
  };
  const nextHash = service.computeHash(hashParts({ ...parts, actionPlan: changed }, entry.templates));
  assert.equal(isDocumentationStale(gen.entry, nextHash), true);
});

test("LegalContextänderung markiert Draft stale", async () => {
  const parts = partsFor();
  const { service, entry } = await preparedFor(parts);
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const changed = legalContextResult([legalReference(), legalReference({ sectionId: "sec-54" })]);
  const nextHash = service.computeHash(hashParts({ ...parts, legalContext: changed }, entry.templates));
  assert.equal(isDocumentationStale(gen.entry, nextHash), true);
});

test("Praxisfalländerung markiert Draft stale", async () => {
  const parts = partsFor();
  const { service, entry } = await preparedFor(parts);
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const nextHash = service.computeHash(
    hashParts({ ...parts, practiceCase: { ...PRACTICE_CASE, version: "v2" } }, entry.templates),
  );
  assert.equal(isDocumentationStale(gen.entry, nextHash), true);
});

test("Templateänderung markiert Draft stale", async () => {
  const parts = partsFor();
  const { service, entry } = await preparedFor(parts);
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const changedTemplates = entry.templates.map((t) =>
    t.id === "tpl-case" ? { ...t, markdownBody: `${t.markdownBody}\nNeuer Absatz` } : t,
  );
  const nextHash = service.computeHash(hashParts(parts, changedTemplates));
  assert.equal(isDocumentationStale(gen.entry, nextHash), true);
  assert.equal(staleDrafts(gen.entry, nextHash).length, 1);
});

test("Unveränderte Eingabe bleibt aktuell", async () => {
  const parts = partsFor();
  const { service, entry } = await preparedFor(parts);
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const sameHash = service.computeHash(hashParts(parts, entry.templates));
  assert.equal(isDocumentationStale(gen.entry, sameHash), false);
  assert.deepEqual(service.staleDrafts(gen.entry, sameHash), []);
});

test("Hash ist reproduzierbar und unabhängig von der Vorlagenreihenfolge", () => {
  const parts = partsFor();
  const a = computeDocumentationInputHash(
    hashParts(parts, [
      { id: "t1", markdownBody: "a" },
      { id: "t2", markdownBody: "b" },
    ]),
  );
  const b = computeDocumentationInputHash(
    hashParts(parts, [
      { id: "t2", markdownBody: "b" },
      { id: "t1", markdownBody: "a" },
    ]),
  );
  assert.equal(a, b);
});

/* ------------------------ 8. Persistenz / Reload ------------------------- */

test("context.documentation ist serialisierbar", async () => {
  const parts = partsFor();
  const { service, entry } = await preparedFor(parts);
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const context = { [DOCUMENTATION_CONTEXT_KEY]: gen.entry };
  const roundTrip = JSON.parse(JSON.stringify(context));
  assert.deepEqual(roundTrip[DOCUMENTATION_CONTEXT_KEY], gen.entry);
});

test("Reload stellt den Dokumentationszustand wieder her", async () => {
  const parts = partsFor();
  const { service, entry } = await preparedFor(parts);
  const gen = service.generateDraft(entry, "tpl-case", parts);
  const edited = service.updateDraft(gen.entry, gen.draft.id, "Bearbeiteter Text");
  const stored = JSON.parse(JSON.stringify({ [DOCUMENTATION_CONTEXT_KEY]: edited }));
  const restored = service.restore(stored[DOCUMENTATION_CONTEXT_KEY]);
  assert.equal(restored.error, null);
  assert.equal(restored.entry!.drafts.length, 1);
  assert.equal(restored.entry!.drafts[0].markdown, "Bearbeiteter Text");
  assert.equal(restored.entry!.drafts[0].status, "edited");
  assert.equal(restored.entry!.templates.length, edited.templates.length);
});

test("Leerer Kontext liefert keinen Fehler", () => {
  const service = makeService(FULL_DATA);
  assert.deepEqual(service.restore(undefined), { entry: null, error: null });
  assert.deepEqual(service.restore(null), { entry: null, error: null });
});

test("Ungültiger gespeicherter Stand wird transparent abgewiesen", () => {
  const service = makeService(FULL_DATA);
  assert.ok(service.restore("kaputt").error);
  const wrongVersion: Partial<DocumentationContextEntry> = {
    schemaVersion: 99,
    inputHash: "x",
    templates: [],
    readiness: [],
    drafts: [],
    preparedAt: "2026-08-01T10:00:00.000Z",
  };
  const res = service.restore(wrongVersion);
  assert.equal(res.entry, null);
  assert.ok(res.error);
});

/* ------------------------- 9. Assistenten-Bezug -------------------------- */

test("Assistent kann die Vorlagenanzahl aus der Auflösung anzeigen", () => {
  const withCase = resolveDocumentationTemplates(FULL_DATA, "gewalt").templates.length;
  const withoutCase = resolveDocumentationTemplates(
    { caseTemplates: [], allTemplates: [GENERIC_TEMPLATE] },
    null,
  ).templates.length;
  assert.equal(withCase, 3);
  assert.equal(withoutCase, 1);
});

test("Vorbereitung der Dokumentation liefert genau die angezeigten Vorlagen", async () => {
  const parts = partsFor();
  const { entry } = await preparedFor(parts);
  assert.deepEqual(
    entry.templates.map((t) => t.id),
    resolveDocumentationTemplates(FULL_DATA, "gewalt").templates.map((t) => t.id),
  );
});

test("Events melden Vorbereitung, Erzeugung, Bearbeitung und Export", async () => {
  const events = new DocumentationEventBus();
  const seen: string[] = [];
  events.on((e) => seen.push(e.name));
  let counter = 0;
  const service = new DocumentationAssistantService({
    fetcher: fetcherFor(FULL_DATA),
    events,
    now,
    createId: () => `draft-${++counter}`,
  });
  const parts = partsFor();
  const { entry } = await service.prepare({ ...parts, category: "gewalt" });
  const gen = service.generateDraft(entry, "tpl-case", parts);
  service.updateDraft(gen.entry, gen.draft.id, "x");
  service.markExported(gen.draft.id, "pdf");
  assert.deepEqual(seen, [
    "DocumentationPrepared",
    "DocumentationDraftGenerated",
    "DocumentationDraftUpdated",
    "DocumentationExported",
  ]);
});
