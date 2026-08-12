/**
 * Tests für die Embedding-Plattform. Deterministisch, ohne Netzwerk.
 * Nutzt den Mock-Provider und InMemory-Repositories.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EmbeddingBatchProcessor,
  EmbeddingCostEstimator,
  EmbeddingDeduplicator,
  EmbeddingInputBuilder,
  EmbeddingJobService,
  EmbeddingModelRegistry,
  EmbeddingService,
  EmbeddingStatistics,
  EmbeddingStatusResolver,
  EmbeddingValidator,
  InMemoryChunkRepository,
  InMemoryEmbeddingJobRepository,
  InMemoryEmbeddingRepository,
  MockEmbeddingProvider,
} from "../index";
import type { PersistedChunk } from "../index";
import { INPUT_FORMAT_VERSION } from "../types";

function fixtureChunk(overrides: Partial<PersistedChunk> = {}): PersistedChunk {
  const base: PersistedChunk = {
    id: overrides.id ?? "chunk-1",
    chunkId: overrides.chunkId ?? "cid-1",
    sourceId: overrides.sourceId ?? "src-1",
    stableHash: overrides.stableHash ?? "hash-1",
    contentHash: overrides.contentHash ?? "content-hash-1",
    path: "/§ 1/Abs. 1",
    displayPath: "§ 1 Abs. 1",
    title: "Testparagraph",
    displayTitle: "Testparagraph",
    content: "Dies ist ein Testinhalt.",
    normalizedContent: "Dies ist ein Testinhalt.",
    metadata: { law: "TestG", sourceLabel: "TestG" },
    token: { characterCount: 30, wordCount: 5, tokenEstimate: 8, sentenceCount: 1, averageSentenceLength: 5, referenceCount: 0 },
    active: true,
    chunkVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

test("MockProvider ist deterministisch", async () => {
  const provider = new MockEmbeddingProvider();
  const a = await provider.embedOne("hello world", { modelId: "mock/embedding-1536" });
  const b = await provider.embedOne("hello world", { modelId: "mock/embedding-1536" });
  assert.deepEqual(a.vector, b.vector);
  assert.equal(a.dimensions, 1536);
});

test("Single Embedding: schreibt Record", async () => {
  const chunk = fixtureChunk();
  const repo = new InMemoryEmbeddingRepository();
  const r = await EmbeddingService.embedChunk({ chunk, repo, ctx: { modelId: "mock/embedding-1536" } });
  assert.equal(r.action, "embedded");
  assert.ok(r.record);
  assert.equal(r.record!.dimensions, 1536);
});

test("Dedup: identischer Hash + Modell → skip", async () => {
  const chunk = fixtureChunk();
  const repo = new InMemoryEmbeddingRepository();
  const first = await EmbeddingService.embedChunk({ chunk, repo, ctx: { modelId: "mock/embedding-1536" } });
  assert.equal(first.action, "embedded");
  const second = await EmbeddingService.embedChunk({ chunk, repo, ctx: { modelId: "mock/embedding-1536" } });
  assert.equal(second.action, "skipped");
});

test("Re-Embedding bei Hash-Änderung", async () => {
  const chunk = fixtureChunk();
  const repo = new InMemoryEmbeddingRepository();
  await EmbeddingService.embedChunk({ chunk, repo, ctx: { modelId: "mock/embedding-1536" } });
  const changed = fixtureChunk({ stableHash: "hash-2", normalizedContent: "Neuer Inhalt." });
  const r = await EmbeddingService.embedChunk({ chunk: changed, repo, ctx: { modelId: "mock/embedding-1536" } });
  assert.equal(r.action, "embedded");
});

test("Deduplicator: input_format_version-Wechsel erzwingt Neuberechnung", () => {
  const model = EmbeddingModelRegistry.get("mock/embedding-1536");
  const existing = {
    id: "e", sourceId: "s", chunkId: "c", chunkStableHash: "h", chunkPath: "p",
    providerId: "mock" as const, modelId: model.modelId, modelVersion: model.version,
    dimensions: model.dimensions, vector: [], status: "embedded" as const, contentHash: "same",
    inputFormatVersion: INPUT_FORMAT_VERSION - 1,
    tokenCount: 0, inputCharacterCount: 0, usage: null, cost: null,
    errorCode: null, errorMessage: null, attemptCount: 1,
    embeddedAt: new Date().toISOString(), invalidatedAt: null,
    createdAt: "", updatedAt: "",
  };
  const decision = EmbeddingDeduplicator.decide({
    chunkStableHash: "h", contentHash: "same", existing, model,
  });
  assert.equal(decision.action, "embed");
  if (decision.action === "embed") assert.equal(decision.reason, "input_format_changed");
});

test("Batch: partieller Fehler wird isoliert", async () => {
  const provider = new MockEmbeddingProvider({ simulate: { failEveryNth: 3 } });
  const r = await provider.embedMany(["a", "b", "c", "d"], { modelId: "mock/embedding-1536" });
  assert.equal(r.failedItems.length, 1);
  assert.equal(r.results.filter((x) => x !== null).length, 3);
});

test("Retry-Klassifikation: RateLimit ist retryable, Auth nicht", async () => {
  const rate = new MockEmbeddingProvider({ simulate: { rateLimitOnFirstCall: true } });
  await assert.rejects(rate.embedOne("x", { modelId: "mock/embedding-1536" }), (e: Error & { retryable?: boolean }) => e.retryable === true);
  const auth = new MockEmbeddingProvider({ simulate: { authenticationError: true } });
  await assert.rejects(auth.embedOne("x", { modelId: "mock/embedding-1536" }), (e: Error & { retryable?: boolean }) => e.retryable === false);
});

test("Kostenprognose ist konsistent", () => {
  const model = EmbeddingModelRegistry.get("openai/text-embedding-3-small");
  const usd = EmbeddingCostEstimator.estimate(model, 1_000_000);
  assert.equal(usd, model.pricing.inputPer1M);
});

test("Validator erkennt Dimensionsabweichung", () => {
  const model = EmbeddingModelRegistry.get("mock/embedding-1536");
  const chunk = fixtureChunk();
  const report = EmbeddingValidator.validate({
    chunks: [chunk],
    embeddings: [{
      id: "e1", sourceId: "src-1", chunkId: chunk.id, chunkStableHash: chunk.stableHash, chunkPath: chunk.path,
      providerId: "mock", modelId: model.modelId, modelVersion: model.version,
      dimensions: 128, vector: new Array(128).fill(0.1), status: "embedded", contentHash: "x",
      inputFormatVersion: INPUT_FORMAT_VERSION, tokenCount: 0, inputCharacterCount: 0,
      usage: null, cost: null, errorCode: null, errorMessage: null, attemptCount: 1,
      embeddedAt: new Date().toISOString(), invalidatedAt: null, createdAt: "", updatedAt: "",
    }],
    model,
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.code === "dimension_mismatch"));
});

test("Job-Lifecycle: preview → create → process → completed", async () => {
  const chunkRepo = new InMemoryChunkRepository();
  const embeddingRepo = new InMemoryEmbeddingRepository();
  const jobRepo = new InMemoryEmbeddingJobRepository();
  const chunks = [fixtureChunk({ id: "c1", chunkId: "c1", stableHash: "h1" }), fixtureChunk({ id: "c2", chunkId: "c2", stableHash: "h2" })];
  await chunkRepo.upsertMany(chunks);

  const preview = await EmbeddingJobService.preview({
    sourceId: "src-1", modelId: "mock/embedding-1536",
    chunkRepo, embeddingRepo,
  });
  assert.equal(preview.totals.chunks, 2);
  assert.equal(preview.totals.toEmbed, 2);

  const { job } = await EmbeddingJobService.createJob({
    sourceId: "src-1", modelId: "mock/embedding-1536",
    chunkRepo, embeddingRepo, jobRepo,
  });
  assert.equal(job.status, "preparing");
  let result = await EmbeddingBatchProcessor.processBatch({
    jobId: job.id, jobRepo, chunkRepo, embeddingRepo, ctx: { modelId: "mock/embedding-1536" },
  });
  while (!result.done) {
    result = await EmbeddingBatchProcessor.processBatch({
      jobId: job.id, jobRepo, chunkRepo, embeddingRepo, ctx: { modelId: "mock/embedding-1536" },
    });
  }
  assert.equal(result.job.status, "completed");
  assert.equal(result.job.totals.successful, 2);
});

test("Job-Abbruch verhindert Weiterverarbeitung", async () => {
  const chunkRepo = new InMemoryChunkRepository();
  const embeddingRepo = new InMemoryEmbeddingRepository();
  const jobRepo = new InMemoryEmbeddingJobRepository();
  await chunkRepo.upsertMany([fixtureChunk()]);
  const { job } = await EmbeddingJobService.createJob({
    sourceId: "src-1", modelId: "mock/embedding-1536", chunkRepo, embeddingRepo, jobRepo,
  });
  await EmbeddingJobService.cancelJob({ jobId: job.id, jobRepo });
  await assert.rejects(
    EmbeddingBatchProcessor.processBatch({ jobId: job.id, jobRepo, chunkRepo, embeddingRepo, ctx: { modelId: "mock/embedding-1536" } }),
    /cancelled/,
  );
});

test("StatusResolver: model_mismatch wenn Embedding zu anderem Modell", () => {
  const model = EmbeddingModelRegistry.get("mock/embedding-1536");
  const chunk = fixtureChunk();
  const status = EmbeddingStatusResolver.resolve(chunk, {
    id: "e", sourceId: chunk.sourceId ?? "", chunkId: chunk.id, chunkStableHash: chunk.stableHash, chunkPath: chunk.path,
    providerId: "mock", modelId: "other/model", modelVersion: "1", dimensions: model.dimensions,
    vector: [], status: "embedded", contentHash: "x", inputFormatVersion: INPUT_FORMAT_VERSION,
    tokenCount: null, inputCharacterCount: null, usage: null, cost: null,
    errorCode: null, errorMessage: null, attemptCount: 1,
    embeddedAt: new Date().toISOString(), invalidatedAt: null, createdAt: "", updatedAt: "",
  }, model);
  assert.equal(status, "model_mismatch");
});

test("Overview-Ampel: alles eingebettet → grün", async () => {
  const chunkRepo = new InMemoryChunkRepository();
  const embeddingRepo = new InMemoryEmbeddingRepository();
  const chunk = fixtureChunk();
  await chunkRepo.upsertMany([chunk]);
  await EmbeddingService.embedChunk({ chunk, repo: embeddingRepo, ctx: { modelId: "mock/embedding-1536" } });
  const model = EmbeddingModelRegistry.get("mock/embedding-1536");
  const overview = EmbeddingStatistics.buildOverview({
    sourceId: "src-1", sourceLabel: "Test", model,
    chunks: await chunkRepo.listBySource("src-1"),
    embeddings: await embeddingRepo.listBySource("src-1"),
  });
  assert.equal(overview.ampel, "green");
  assert.equal(overview.totals.embedded, 1);
});

test("InputBuilder: gleiche Eingabe → gleicher contentHash", () => {
  const c = fixtureChunk();
  const a = EmbeddingInputBuilder.build(c);
  const b = EmbeddingInputBuilder.build(c);
  assert.equal(a.contentHash, b.contentHash);
  assert.equal(a.inputFormatVersion, INPUT_FORMAT_VERSION);
});

test("Skalierung: 200 Mock-Chunks laufen sauber durch", async () => {
  const chunkRepo = new InMemoryChunkRepository();
  const embeddingRepo = new InMemoryEmbeddingRepository();
  const jobRepo = new InMemoryEmbeddingJobRepository();
  const chunks: PersistedChunk[] = [];
  for (let i = 0; i < 200; i++) {
    chunks.push(fixtureChunk({ id: `c${i}`, chunkId: `c${i}`, stableHash: `h${i}`, sourceId: "src-big" }));
  }
  await chunkRepo.upsertMany(chunks);
  const { job } = await EmbeddingJobService.createJob({
    sourceId: "src-big", modelId: "mock/embedding-1536", chunkRepo, embeddingRepo, jobRepo,
  });
  let result = await EmbeddingBatchProcessor.processBatch({ jobId: job.id, jobRepo, chunkRepo, embeddingRepo, ctx: { modelId: "mock/embedding-1536" }, options: { batchSize: 32 } });
  while (!result.done) {
    result = await EmbeddingBatchProcessor.processBatch({ jobId: job.id, jobRepo, chunkRepo, embeddingRepo, ctx: { modelId: "mock/embedding-1536" }, options: { batchSize: 32 } });
  }
  assert.equal(result.job.status, "completed");
  assert.equal(result.job.totals.successful, 200);
});
