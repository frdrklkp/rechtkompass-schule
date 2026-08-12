/**
 * Sprint 4.2 – Grounded Legal Copilot – deterministische Kerntests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AnswerFormatter,
  AnswerValidator,
  CitationInjector,
  ConfidenceCalculator,
  ConversationMemory,
  DisclaimerBuilder,
  ExplanationModeSpec,
  FollowUpGenerator,
  GroundingEngine,
  HallucinationGuard,
  LegalCopilotService,
  PromptBuilder,
  PROMPT_TEMPLATES_VERSION,
  ContextAssembler,
  SafetyGuard,
  type GroundedChunk,
} from "../index";
import {
  InMemoryRetrievalRepository,
} from "../../legal-knowledge/retrieval";
import {
  InMemoryChunkRepository,
  InMemoryEmbeddingRepository,
  MockEmbeddingProvider,
  EmbeddingService,
  type PersistedChunk,
} from "../../legal-knowledge/embeddings";
import type { RetrievalResult, RetrievalHit } from "../../legal-knowledge/retrieval/types";

function chunk(id: string, content: string, extra: Partial<PersistedChunk> = {}): PersistedChunk {
  return {
    id,
    chunkId: id,
    sourceId: "src-1",
    stableHash: `h-${id}`,
    contentHash: `c-${id}`,
    path: `/${id}`,
    displayPath: `§ ${id}`,
    title: `Titel ${id}`,
    displayTitle: `Titel ${id}`,
    content,
    normalizedContent: content,
    metadata: {
      law: "SchulG NRW",
      paragraph: id.replace("chunk-", ""),
      lifecycle: "active",
      reviewStatus: "verified",
      sourceLabel: "SchulG NRW",
      ...(extra.metadata ?? {}),
    },
    token: {
      characterCount: content.length,
      wordCount: content.split(/\s+/).length,
      tokenEstimate: Math.ceil(content.length / 4),
      sentenceCount: 1,
      averageSentenceLength: 0,
      referenceCount: 0,
    },
    references: [],
    active: true,
    chunkVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  } as PersistedChunk;
}

async function buildRepo(): Promise<InMemoryRetrievalRepository> {
  const chunkRepo = new InMemoryChunkRepository();
  const embRepo = new InMemoryEmbeddingRepository();
  const provider = new MockEmbeddingProvider();
  const items: PersistedChunk[] = [
    chunk("chunk-42", "Aufsichtspflicht der Lehrkräfte während Schulfahrten und Klassenfahrten in NRW.", {
      metadata: { law: "SchulG NRW", paragraph: "42", lifecycle: "active", reviewStatus: "verified", sourceLabel: "SchulG NRW" },
    }),
    chunk("chunk-99", "Datenschutz und Verarbeitung personenbezogener Daten von Schülerinnen und Schülern.", {
      metadata: { law: "DSGVO", paragraph: "6", lifecycle: "active", reviewStatus: "verified", sourceLabel: "DSGVO" },
    }),
  ];
  await chunkRepo.upsertMany(items);
  for (const c of items) {
    await EmbeddingService.embedChunk({ chunk: c, repo: embRepo, ctx: { provider } });
  }
  return new InMemoryRetrievalRepository(chunkRepo, embRepo, ["src-1"]);
}

function fakeGrounded(): GroundedChunk[] {
  const hit: RetrievalHit = {
    chunkId: "chunk-42",
    chunkStableHash: "h-chunk-42",
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
      display: "§ 42 SchulG NRW", law: "SchulG NRW", chapter: null, section: null,
      paragraph: "42", article: null, absatz: null, sentence: null, number: null, annex: null,
      path: "/chunk-42", version: null, sourceId: "src-1", sourceLabel: "SchulG NRW",
      chunkId: "chunk-42", officialUrl: null,
    },
    highlights: [], excerpt: "Aufsichtspflicht", content: "Aufsichtspflicht der Lehrkräfte.",
    metadata: { reviewStatus: "verified", law: "SchulG NRW" }, references: [],
    path: "/chunk-42", displayPath: "§ 42", chunkType: "paragraph",
  };
  return [{ refId: "R1", hit }];
}

test("PromptBuilder erzeugt versionierten Prompt mit deterministischer Struktur", () => {
  const grounded = fakeGrounded();
  const ctx = ContextAssembler.assemble({ sessionId: "s1", createdAt: new Date().toISOString(), turns: [] }, grounded);
  const p = PromptBuilder.build({ mode: "standard", question: "Aufsichtspflicht?", context: ctx });
  assert.equal(p.version, PROMPT_TEMPLATES_VERSION);
  assert.match(p.system, /Grounded Legal Copilot/);
  assert.match(p.user, /\[R1\] § 42 SchulG NRW/);
  assert.match(p.user, /RECHTSGRUNDLAGEN:/);
  assert.match(p.user, /Antworte jetzt ausschließlich als JSON/);
});

test("GroundingEngine begrenzt Treffer und liefert Reasonings", () => {
  const retrieval = { hits: fakeGrounded().map((g) => g.hit) } as unknown as RetrievalResult;
  const rep = GroundingEngine.ground(retrieval, { maxHits: 1, minScore: 0.1 });
  assert.equal(rep.grounded.length, 1);
  assert.equal(rep.grounded[0].refId, "R1");
  assert.ok(rep.reasonings[0].includes("Aufgenommen R1"));
});

test("CitationInjector fügt Zitate ein und meldet unbekannte Refs", () => {
  const grounded = fakeGrounded();
  const r = CitationInjector.inject("Siehe [R1] und [R9].", grounded);
  assert.match(r.text, /§ 42 SchulG NRW \[R1\]/);
  assert.deepEqual(r.usedRefIds, ["R1"]);
  assert.deepEqual(r.unknownRefIds, ["R9"]);
});

test("HallucinationGuard erkennt Freitext-Zitat ohne [R#]", () => {
  const grounded = fakeGrounded();
  const bad = HallucinationGuard.check("Nach § 88 SchulG greift die Aufsichtspflicht.", grounded);
  assert.equal(bad.ok, false);
  const good = HallucinationGuard.check("Nach [R1] greift die Aufsichtspflicht.", grounded);
  assert.equal(good.ok, true);
});

test("HallucinationGuard blockt unbekannte Gesetzeskürzel", () => {
  const grounded = fakeGrounded();
  const rep = HallucinationGuard.check("Laut StGB [R1] gilt Folgendes.", grounded);
  assert.equal(rep.ok, false);
  assert.ok(rep.violations.some((v) => v.includes("STGB")));
});

test("ConfidenceCalculator liefert Level und Werte im 0..1-Bereich", () => {
  const grounded = fakeGrounded();
  const retrieval = { hits: grounded.map((g) => g.hit) } as unknown as RetrievalResult;
  const c = ConfidenceCalculator.compute({ retrieval, grounded, llmSelfConfidence: 0.8, answered: true });
  assert.ok(c.overall > 0.5);
  assert.equal(c.level, "high");
});

test("AnswerValidator erkennt fehlende Kurzantwort", () => {
  const grounded = fakeGrounded();
  const dummy = AnswerFormatter.format({
    raw: {
      answered: true,
      sections: { kurzantwort: "", einordnung: "e", empfohleneHandlung: ["a"], begruendung: "b [R1]", hinweise: [], unsicherheiten: [], typischeFehler: [], naechsteSchritte: [] },
      citationRefs: ["R1"],
    },
    grounded,
    confidence: ConfidenceCalculator.compute({ retrieval: { hits: [] } as unknown as RetrievalResult, grounded, answered: true }),
    mode: "standard",
  });
  const rep = AnswerValidator.validate(dummy, grounded);
  assert.equal(rep.ok, false);
});

test("AnswerFormatter baut Unanswered-Antwort korrekt", () => {
  const a = AnswerFormatter.buildUnanswered("standard");
  assert.equal(a.answered, false);
  assert.match(a.sections.kurzantwort, /keine ausreichende Rechtsgrundlage/i);
  assert.ok(a.sections.disclaimer.length > 10);
});

test("AnswerFormatter Markdown-Protokoll enthält Kernblöcke", () => {
  const grounded = fakeGrounded();
  const conf = ConfidenceCalculator.compute({ retrieval: { hits: grounded.map((g) => g.hit) } as unknown as RetrievalResult, grounded, answered: true });
  const a = AnswerFormatter.format({
    raw: {
      answered: true,
      sections: { kurzantwort: "Kurz.", einordnung: "Einordnung.", empfohleneHandlung: ["A"], begruendung: "B [R1]", hinweise: [], unsicherheiten: [], typischeFehler: [], naechsteSchritte: [] },
      citationRefs: ["R1"],
    },
    grounded, confidence: conf, mode: "standard",
  });
  const md = AnswerFormatter.toMarkdown({ question: "Frage?", answer: a, createdAt: "now", sessionId: "s1" });
  assert.match(md, /## Kurzantwort/);
  assert.match(md, /## Rechtsgrundlagen/);
  assert.match(md, /## Disclaimer/);
});

test("FollowUpGenerator ergänzt fehlende Kontextfragen deterministisch", () => {
  const f = FollowUpGenerator.suggest({ question: "x" }, []);
  const codes = f.map((x) => x.code);
  assert.ok(codes.includes("bundesland"));
  assert.ok(codes.includes("schulform"));
});

test("ConversationMemory verwaltet Sitzungen und Turns", () => {
  ConversationMemory.clearAll();
  const s = ConversationMemory.ensure(null);
  ConversationMemory.append(s.sessionId, { role: "user", at: "t", question: "q1" });
  ConversationMemory.append(s.sessionId, { role: "assistant", at: "t", answerSummary: "a1" });
  const again = ConversationMemory.ensure(s.sessionId);
  assert.equal(again.turns.length, 2);
});

test("SafetyGuard sperrt Antwort bei fehlenden Quellen oder Halluzination", () => {
  const a = AnswerFormatter.buildUnanswered("standard");
  const noSrc = SafetyGuard.evaluate({ grounded: [], confidence: a.confidence, hallucinationOk: true, answer: a });
  assert.equal(noSrc.suppressAnswer, true);
  const grounded = fakeGrounded();
  const hallu = SafetyGuard.evaluate({ grounded, confidence: a.confidence, hallucinationOk: false, answer: a });
  assert.equal(hallu.suppressAnswer, true);
});

test("DisclaimerBuilder verändert Text nach Konfidenz-Level", () => {
  const hi = DisclaimerBuilder.build({ retrieval: 1, llm: 1, sourceCoverage: 1, reviewStatus: 1, overall: 0.9, level: "high" });
  const lo = DisclaimerBuilder.build({ retrieval: 0, llm: 0, sourceCoverage: 0, reviewStatus: 0, overall: 0.1, level: "low" });
  assert.notEqual(hi, lo);
  assert.match(lo, /gering/);
});

test("ExplanationModeSpec normalisiert unbekannte Werte auf 'standard'", () => {
  assert.equal(ExplanationModeSpec.normalize("kurz"), "kurz");
  assert.equal(ExplanationModeSpec.normalize("gibtsnicht"), "standard");
});

test("LegalCopilotService end-to-end mit Mock-Provider liefert grounded Antwort", async () => {
  const repo = await buildRepo();
  const svc = new LegalCopilotService({ retrievalRepo: repo });
  const res = await svc.ask({
    question: "Wie ist die Aufsichtspflicht bei Schulfahrten geregelt?",
    forceMock: true,
    debug: true,
    filters: { bundesland: "NRW", schulform: "Gymnasium", klassenstufe: "8" },
  });
  assert.equal(res.answer.answered, true);
  assert.ok(res.answer.citations.length > 0);
  assert.ok(res.retrieval.totalHits > 0);
  assert.ok(res.statistics.usedHits > 0);
  assert.equal(res.answer.promptVersion, PROMPT_TEMPLATES_VERSION);
  assert.ok(res.debug);
});

test("LegalCopilotService gibt 'keine Rechtsgrundlage' zurück, wenn Retrieval leer ist", async () => {
  const chunks = new InMemoryChunkRepository();
  const emb = new InMemoryEmbeddingRepository();
  const repo = new InMemoryRetrievalRepository(chunks, emb, []);
  const svc = new LegalCopilotService({ retrievalRepo: repo });
  const res = await svc.ask({ question: "Irgendwas ohne Grundlage?", forceMock: true });
  assert.equal(res.answer.answered, false);
  assert.equal(res.answer.citations.length, 0);
  assert.match(res.answer.sections.kurzantwort, /keine ausreichende Rechtsgrundlage/i);
});
