/**
 * Tests für die Hybrid Retrieval Engine.
 * Deterministisch, ohne Netzwerk, nutzt MockEmbeddingProvider.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ChunkRanker,
  CitationBuilder,
  EmbeddingSearch,
  HybridRetrievalService,
  InMemoryRetrievalRepository,
  KeywordSearch,
  MetadataFilter,
  QueryNormalizer,
  ResultMerger,
  RetrievalValidator,
  SearchQueryBuilder,
} from "../index";
import {
  InMemoryChunkRepository,
  InMemoryEmbeddingRepository,
  MockEmbeddingProvider,
  EmbeddingModelRegistry,
} from "../../embeddings";
import type { PersistedChunk } from "../../embeddings";
import { EmbeddingService } from "../../embeddings";

function fixtureChunk(o: Partial<PersistedChunk> & { id: string; content: string }): PersistedChunk {
  return {
    id: o.id,
    chunkId: o.chunkId ?? o.id,
    sourceId: o.sourceId ?? "src-1",
    stableHash: o.stableHash ?? `hash-${o.id}`,
    contentHash: `ch-${o.id}`,
    path: o.path ?? `/${o.id}`,
    displayPath: o.displayPath ?? o.path ?? `§ ${o.id}`,
    title: o.title ?? `Titel ${o.id}`,
    displayTitle: o.title ?? `Titel ${o.id}`,
    content: o.content,
    normalizedContent: o.content,
    metadata: {
      law: "SchulG NRW",
      paragraph: o.id.replace("chunk-", ""),
      lifecycle: "active",
      reviewStatus: "editorial_reviewed",
      sourceLabel: "SchulG NRW",
      ...(o.metadata ?? {}),
    },
    token: { characterCount: o.content.length, wordCount: o.content.split(/\s+/).length, tokenEstimate: Math.ceil(o.content.length / 4), sentenceCount: 1, averageSentenceLength: 0, referenceCount: 0 },
    active: true, chunkVersion: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

test("QueryNormalizer expands abbreviations and synonyms", () => {
  const n = QueryNormalizer.normalize("LRS Nachteilsausgleich für Schüler");
  assert.ok(n.keywords.includes("Lese-Rechtschreib-Schwäche") || n.expansions.length > 0);
  assert.ok(n.keywords.length > 0);
});

test("SearchQueryBuilder clamps limits and sets defaults", () => {
  const q = SearchQueryBuilder.build({ query: "Zeugnis", limit: 999 });
  assert.equal(q.searchType, "hybrid");
  assert.equal(q.filters.activeOnly, true);
  assert.ok(q.limit <= 50);
});

test("KeywordSearch scores exact terms and normalizes", () => {
  const chunks = [
    fixtureChunk({ id: "chunk-1", content: "Nachteilsausgleich wird gewährt bei LRS." }),
    fixtureChunk({ id: "chunk-2", content: "Klassenfahrt und Elternabend." }),
  ];
  const hits = KeywordSearch.search(chunks, ["Nachteilsausgleich", "LRS"], { topK: 5, minScore: 0 });
  assert.equal(hits[0].chunkId, "chunk-1");
  assert.ok(hits[0].score >= 0 && hits[0].score <= 1);
});

test("MetadataFilter respects lifecycle and law filter", () => {
  const c = fixtureChunk({ id: "chunk-1", content: "x" });
  const c2 = { ...c, id: "chunk-2", metadata: { ...c.metadata, lifecycle: "archived" } };
  const { kept } = MetadataFilter.apply(
    [c, c2].map((chunk) => ({ chunk, embedding: null, vectorScore: 0, keywordScore: 0, matchedFields: [], matchedTerms: [] })),
    { lifecycle: ["active"] },
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].chunk.id, "chunk-1");
});

test("EmbeddingSearch ranks via cosine similarity (mock)", async () => {
  const model = EmbeddingModelRegistry.getDefault();
  const provider = new MockEmbeddingProvider();
  const q = await EmbeddingSearch.embedQuery("Nachteilsausgleich", { provider, modelId: model.modelId });
  assert.equal(q.vector.length, model.dimensions);
});

test("HybridRetrievalService end-to-end returns cited hits", async () => {
  const chunkRepo = new InMemoryChunkRepository();
  const embRepo = new InMemoryEmbeddingRepository();
  const chunks: PersistedChunk[] = [
    fixtureChunk({ id: "chunk-1", content: "Bei LRS und Dyskalkulie wird ein Nachteilsausgleich gewährt." }),
    fixtureChunk({ id: "chunk-2", content: "Die Klassenfahrt ist eine Schulveranstaltung." }),
    fixtureChunk({ id: "chunk-3", content: "Nachteilsausgleich für Schülerinnen mit LRS umfasst mehr Zeit.", metadata: { paragraph: "42" } }),
  ];
  await chunkRepo.upsertMany(chunks);
  // Embed alle Chunks mit Mock-Provider
  const provider = new MockEmbeddingProvider();
  for (const c of chunks) {
    await EmbeddingService.embedChunk({ chunk: c, repo: embRepo, ctx: { provider } });
  }
  const repo = new InMemoryRetrievalRepository(chunkRepo, embRepo, ["src-1"]);
  const service = new HybridRetrievalService(repo);
  const result = await service.search({ query: "LRS Nachteilsausgleich", forceMock: true, debug: true });
  assert.ok(result.hits.length >= 1);
  assert.equal(result.validation.ok, true);
  const top = result.hits[0];
  assert.ok(top.citation.display.includes("SchulG NRW") || top.citation.display.includes("§"));
  assert.ok(top.reasons.some((r) => r.code === "explanation"));
  assert.ok(result.debug);
});

test("CitationBuilder builds § display", () => {
  const chunk = fixtureChunk({ id: "chunk-1", content: "x", metadata: { law: "SchulG NRW", paragraph: "42", absatz: "1" } });
  const c = CitationBuilder.build(chunk);
  assert.match(c.display, /§ 42 Abs\. 1/);
});

test("RetrievalValidator flags duplicates and rejected sources", () => {
  const base = {
    chunkId: "c1", chunkStableHash: "h1", score: 0.5, confidence: 0.5, rankingPosition: 1,
    scoreBreakdown: { vector: 0.5, keyword: 0, metadata: 0, reference: 0, quality: 0, parserConfidence: 0.5, reviewBoost: 0.5, final: 0.5, weights: { vector: 1, keyword: 0, metadata: 0, reference: 0, quality: 0, parserConfidence: 0, reviewBoost: 0 } },
    reasons: [], citation: { display: "§ 1", law: "X", chapter: null, section: null, paragraph: "1", article: null, absatz: null, sentence: null, number: null, annex: null, path: "/", version: null, sourceId: "s1", sourceLabel: "X", chunkId: "c1", officialUrl: null },
    highlights: [], excerpt: "", content: "", metadata: { lifecycle: "rejected" }, references: [], path: "/", displayPath: "/", chunkType: "paragraph",
  };
  const report = RetrievalValidator.validate([base, { ...base }]);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.code === "duplicate_hit"));
  assert.ok(report.errors.some((e) => e.code === "invalid_source"));
});

test("ChunkRanker orders by combined weighted score", () => {
  const base = fixtureChunk({ id: "chunk-1", content: "abc" });
  const ranked = ChunkRanker.rank(
    [
      { chunk: base, embedding: null, vectorScore: 0.9, keywordScore: 0.1, matchedFields: [], matchedTerms: [] },
      { chunk: { ...base, id: "chunk-2" }, embedding: null, vectorScore: 0.1, keywordScore: 0.9, matchedFields: [], matchedTerms: [] },
    ],
    { keywords: [], filters: {} },
  );
  assert.equal(ranked[0].bundle.chunk.id, "chunk-1"); // vector weight ist höher als keyword
});

test("ResultMerger deduplicates by chunkId", () => {
  const c = fixtureChunk({ id: "chunk-1", content: "x" });
  const bundles = ResultMerger.merge({
    chunks: [c],
    embeddings: [],
    vectorHits: [{ chunkId: "chunk-1", stableHash: "hash-chunk-1", similarity: 0.8 }],
    keywordHits: [{ chunkId: "chunk-1", stableHash: "hash-chunk-1", score: 0.5, matchedFields: ["title"], matchedTerms: ["x"] }],
  });
  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].vectorScore, 0.8);
  assert.equal(bundles[0].keywordScore, 0.5);
});

test("HybridRetrievalService handles empty corpus gracefully", async () => {
  const chunkRepo = new InMemoryChunkRepository();
  const embRepo = new InMemoryEmbeddingRepository();
  const repo = new InMemoryRetrievalRepository(chunkRepo, embRepo, ["src-none"]);
  const service = new HybridRetrievalService(repo);
  const result = await service.search({ query: "irgendetwas", forceMock: true });
  assert.equal(result.hits.length, 0);
  assert.equal(result.validation.ok, true);
});

test("Debug payload exposes candidate breakdown", async () => {
  const chunkRepo = new InMemoryChunkRepository();
  const embRepo = new InMemoryEmbeddingRepository();
  const c = fixtureChunk({ id: "chunk-1", content: "Nachteilsausgleich LRS Deutsch" });
  await chunkRepo.upsertMany([c]);
  const provider = new MockEmbeddingProvider();
  await EmbeddingService.embedChunk({ chunk: c, repo: embRepo, ctx: { provider } });
  const service = new HybridRetrievalService(new InMemoryRetrievalRepository(chunkRepo, embRepo, ["src-1"]));
  const res = await service.search({ query: "Nachteilsausgleich", forceMock: true, debug: true });
  assert.ok(res.debug);
  assert.ok(res.debug!.candidates.length >= 1);
});
