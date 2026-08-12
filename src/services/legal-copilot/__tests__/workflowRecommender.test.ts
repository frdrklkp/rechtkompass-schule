/**
 * Sprint 4.4 – Workflow Recommender Tests.
 * Rein deterministisch, keine Retrieval-Engine, keine LLM-Aufrufe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { WorkflowRecommender } from "../WorkflowRecommender";
import type { CopilotAnswer, GroundedChunk } from "../types";
import type { WorkflowTemplate } from "../../legal-workflows/types";
import type { RetrievalHit } from "../../legal-knowledge/retrieval/types";

function hit(law: string, para: string, refId: string): GroundedChunk {
  const h: RetrievalHit = {
    chunkId: `c-${refId}`,
    chunkStableHash: `h-${refId}`,
    score: 0.9,
    confidence: 0.9,
    rankingPosition: 1,
    scoreBreakdown: {
      vector: 0.9, keyword: 0.5, metadata: 0.5, reference: 0, quality: 1,
      parserConfidence: 0.5, reviewBoost: 1, final: 0.9,
      weights: { vector: 0.45, keyword: 0.3, metadata: 0.08, reference: 0.05, quality: 0.05, parserConfidence: 0.04, reviewBoost: 0.03 },
    },
    reasons: [],
    citation: {
      display: `§ ${para} ${law}`, law, chapter: null, section: null,
      paragraph: para, article: null, absatz: null, sentence: null, number: null, annex: null,
      path: `/${law}`, version: null, sourceId: "src", sourceLabel: law,
      chunkId: `c-${refId}`, officialUrl: null,
    },
    highlights: [], excerpt: "", content: "",
    metadata: {}, references: [],
    path: `/${law}`, displayPath: `§ ${para}`, chunkType: "paragraph",
  };
  return { refId, hit: h };
}

function answer(text: string): CopilotAnswer {
  return {
    answered: true,
    sections: {
      kurzantwort: text, einordnung: text, empfohleneHandlung: [], begruendung: text,
      hinweise: [], unsicherheiten: [], typischeFehler: [], naechsteSchritte: [], disclaimer: "",
    },
    citations: [], checklist: [], followUps: [],
    confidence: { retrieval: 1, llm: 1, sourceCoverage: 1, reviewStatus: 1, overall: 1, level: "high" },
    mode: "standard", promptVersion: "1", domainVersion: "1",
  };
}

function tpl(overrides: Partial<WorkflowTemplate> & { id: string; slug: string; title: string }): WorkflowTemplate {
  return {
    id: overrides.id,
    slug: overrides.slug,
    title: overrides.title,
    subtitle: overrides.subtitle ?? null,
    description: overrides.description ?? null,
    workflowStatus: overrides.workflowStatus ?? "published",
    publicationTier: overrides.publicationTier ?? "internal",
    categoryId: overrides.categoryId ?? null,
    currentVersionId: null,
    phases: overrides.phases ?? [],
    rules: overrides.rules ?? [],
  };
}

const ordnungsmassnahme = tpl({
  id: "t1", slug: "ordnungsmassnahme", title: "Ordnungsmaßnahme durchführen",
  subtitle: "Anhörung und Bescheid", description: "Beleidigung, Beleidigungen und wiederholte Störungen dokumentieren.",
  phases: [{
    id: "p1", templateId: "t1", sortOrder: 1, title: "Anhörung", isRequired: true, steps: [{
      id: "s1", templateId: "t1", phaseId: "p1", sortOrder: 1,
      title: "Anhörung durchführen", description: "Beleidigung protokollieren",
      stepType: "action", priority: "high", isRequired: true, estimatedMinutes: 30,
      riskLevel: "medium", dependsOn: [], checklists: [], documents: [], roles: [],
      sources: [{ id: "src1", citationHint: "SchulG NRW § 53" }],
    }],
  }],
});
const lrs = tpl({
  id: "t2", slug: "lrs", title: "Verdacht auf LRS", description: "Lese-Rechtschreib-Schwäche dokumentieren und feststellen.",
  phases: [{
    id: "p2", templateId: "t2", sortOrder: 1, title: "Beobachtung", isRequired: true, steps: [{
      id: "s2", templateId: "t2", phaseId: "p2", sortOrder: 1,
      title: "Auffälligkeiten dokumentieren", description: "Fehlermuster festhalten.",
      stepType: "information", priority: "normal", isRequired: true, estimatedMinutes: 45,
      riskLevel: "low", dependsOn: [], checklists: [], documents: [], roles: [], sources: [],
    }],
  }],
});
const draft = tpl({
  id: "t3", slug: "draft-only", title: "Draft Beleidigung Anhörung",
  workflowStatus: "draft",
});

test("recommend – Ranking priorisiert passenden Workflow anhand von Rechtsbezug", () => {
  const recs = WorkflowRecommender.recommend({
    question: "Eine Schülerin hat mich beleidigt – wie gehe ich vor?",
    answer: answer("Beleidigung im Unterricht"),
    grounded: [hit("SchulG NRW", "53", "R1")],
    templates: [ordnungsmassnahme, lrs],
  });
  assert.equal(recs.length >= 1, true);
  assert.equal(recs[0].templateId, "t1");
  assert.ok(recs[0].matchedRefIds.includes("R1"));
  assert.equal(recs[0].relevance, 1);
});

test("recommend – gibt leeres Ergebnis bei fehlendem Bezug", () => {
  const recs = WorkflowRecommender.recommend({
    question: "Wie funktioniert die Sonnenfinsternis?",
    answer: null,
    grounded: [],
    templates: [ordnungsmassnahme, lrs],
  });
  assert.deepEqual(recs, []);
});

test("recommend – mehrere Empfehlungen mit stabiler Reihenfolge nach Relevanz", () => {
  const recs = WorkflowRecommender.recommend({
    question: "Beleidigung im Unterricht Anhörung durchführen",
    answer: answer("Beleidigung und Anhörung"),
    grounded: [hit("SchulG NRW", "53", "R1")],
    templates: [lrs, ordnungsmassnahme],
    limit: 5,
  });
  assert.ok(recs.length >= 1);
  // Ordnungsmaßnahme mit Bezug zu SchulG § 53 muss auf Platz 1 stehen.
  assert.equal(recs[0].templateId, "t1");
  for (let i = 1; i < recs.length; i++) {
    assert.ok(recs[i - 1].relevance >= recs[i].relevance);
  }
});

test("recommend – berücksichtigt ausschließlich veröffentlichte Templates", () => {
  const recs = WorkflowRecommender.recommend({
    question: "Beleidigung Anhörung",
    answer: answer("Beleidigung"),
    grounded: [],
    templates: [draft],
  });
  assert.deepEqual(recs, []);
});

test("recommend – gibt keine Empfehlung ohne beantwortbare Antwort im Service (leere Antwort)", () => {
  // Selbst wenn answered=false, arbeitet der reine Recommender weiter (Antwort optional);
  // die Suppression übernimmt der Service. Hier: null-Antwort ist zulässig.
  const recs = WorkflowRecommender.recommend({
    question: "Beleidigung Anhörung",
    answer: null,
    grounded: [],
    templates: [ordnungsmassnahme],
  });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].templateId, "t1");
});

test("openUrl / startUrl bauen die korrekten Runtime-Ziele", () => {
  assert.equal(WorkflowRecommender.openUrl("abc"), "/workflows/abc");
  assert.equal(WorkflowRecommender.startUrl("abc"), "/workflows/abc?action=start");
});

test("Golden Reference: konsistente Ergebnisstruktur", () => {
  const [rec] = WorkflowRecommender.recommend({
    question: "Beleidigung Anhörung",
    answer: answer("Beleidigung"),
    grounded: [hit("SchulG NRW", "53", "R1")],
    templates: [ordnungsmassnahme],
  });
  assert.deepEqual(Object.keys(rec).sort(), [
    "categoryId", "description", "estimatedMinutes", "matchedKeywords", "matchedRefIds",
    "phaseCount", "publicationTier", "reason", "relevance", "slug",
    "stepCount", "subtitle", "templateId", "title",
  ]);
});
