import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDocumentTree } from "../../document";
import {
  ChunkEngine,
  ChunkNavigator,
  ChunkExporter,
  validateChunks,
  computeChunkStatistics,
  buildStableHash,
  estimateTokens,
  splitSentences,
  toRecord,
  fromRecord,
} from "../index";

const SAMPLE = `Kapitel 5

§ 53 Ordnungsmaßnahmen
(1) Der Lehrer trifft Maßnahmen nach § 42.
(2) Weitere Regelungen finden sich in Art. 6 Abs. 1 und Anlage 2.

§ 42 Grundsatz
(1) Erziehung ist Aufgabe der Schule.

Anlage 2
Muster für den Bescheid.
`;

function makeTree() {
  return buildDocumentTree({
    text: SAMPLE,
    sourceId: "src-1",
    sourceLabel: "SchulG NRW",
  });
}

test("ChunkEngine produziert Chunks aus einem Dokumentbaum", () => {
  const tree = makeTree();
  const collection = ChunkEngine.run({ tree });
  assert.ok(collection.chunks.length > 0, "chunks should be produced");
  assert.equal(collection.sourceId, "src-1");
  assert.ok(collection.statistics.chunkCount === collection.chunks.length);
});

test("Chunks tragen Verweise aus den Sections", () => {
  const tree = makeTree();
  const collection = ChunkEngine.run({ tree });
  const total = collection.chunks.reduce((n, c) => n + c.references.length, 0);
  assert.ok(total > 0, "at least one reference should be transferred");
});

test("Stable Hash bleibt bei identischem Input konstant", () => {
  const treeA = makeTree();
  const treeB = makeTree();
  const a = ChunkEngine.run({ tree: treeA });
  const b = ChunkEngine.run({ tree: treeB });
  assert.equal(a.chunks.length, b.chunks.length);
  for (let i = 0; i < a.chunks.length; i++) {
    assert.equal(a.chunks[i].stableHash, b.chunks[i].stableHash);
    assert.equal(a.chunks[i].path, b.chunks[i].path);
  }
});

test("Validator meldet inkonsistenten Hash", () => {
  const tree = makeTree();
  const collection = ChunkEngine.run({ tree });
  collection.chunks[0].normalizedContent = "manipuliert";
  const report = validateChunks({
    sourceId: collection.sourceId,
    chunks: collection.chunks,
    opts: {
      splitThresholdTokens: 800,
      mergeThresholdTokens: 40,
      enableMerging: true,
      enableSplitting: true,
      includeMetaChunks: true,
    },
  });
  assert.ok(report.errors.some((e) => e.code === "hash_mismatch"));
});

test("Statistik summiert Tokens", () => {
  const tree = makeTree();
  const collection = ChunkEngine.run({ tree });
  const stats = computeChunkStatistics(collection.chunks, tree.flat.length - 1);
  assert.equal(stats.chunkCount, collection.chunks.length);
  assert.ok(stats.totalTokens >= 0);
  assert.ok(stats.maxTokens >= stats.minTokens);
});

test("ChunkNavigator liefert Nachbarschaft und Suche", () => {
  const tree = makeTree();
  const collection = ChunkEngine.run({ tree });
  const nav = new ChunkNavigator(collection);
  const first = collection.chunks[0];
  assert.equal(nav.previous(first), null);
  const found = nav.search("Ordnungsmaßnahmen");
  assert.ok(found.length > 0, "search should hit § 53");
});

test("Splitter respektiert Satzgrenzen", () => {
  const sentences = splitSentences("Erster Satz. Zweiter Satz! Dritter Satz?");
  assert.equal(sentences.length, 3);
});

test("Token estimate ist deterministisch", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcdefgh"), 2);
});

test("Mapper ist symmetrisch", () => {
  const tree = makeTree();
  const collection = ChunkEngine.run({ tree });
  const record = toRecord(collection.chunks[0]);
  const round = fromRecord(record);
  assert.deepEqual(round, collection.chunks[0]);
});

test("Exporter erzeugt gültiges JSON", () => {
  const tree = makeTree();
  const collection = ChunkEngine.run({ tree });
  const json = ChunkExporter.json(collection);
  const parsed = JSON.parse(json);
  assert.equal(parsed.chunks.length, collection.chunks.length);
  const seed = JSON.parse(ChunkExporter.embeddingSeed(collection));
  assert.equal(seed.length, collection.chunks.length);
});

test("buildStableHash bleibt stabil", () => {
  const a = buildStableHash({ sourceId: "s", path: "p", normalizedContent: "x", version: "v" });
  const b = buildStableHash({ sourceId: "s", path: "p", normalizedContent: "x", version: "v" });
  assert.equal(a, b);
});

test("Große Paragraphen werden an Absätzen gesplittet", () => {
  const bigAbsatz1 = "Text ".repeat(400); // ~2000 chars → ~500 tokens each
  const bigAbsatz2 = "Regel ".repeat(400);
  const big = `§ 99 Groß\n(1) ${bigAbsatz1}\n(2) ${bigAbsatz2}\n`;
  const tree = buildDocumentTree({ text: big, sourceId: "big", sourceLabel: "Big" });
  const collection = ChunkEngine.run({
    tree,
    options: { splitThresholdTokens: 200, enableSplitting: true },
  });
  const splits = collection.chunks.filter((c) => c.chunkType === "split_paragraph_absatz" || c.chunkType === "split_paragraph_sentence");
  assert.ok(splits.length >= 2, "should split into absatz-level or sentence-level chunks");
});
