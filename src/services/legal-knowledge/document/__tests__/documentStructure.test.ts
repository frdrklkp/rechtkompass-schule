import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocumentTree,
  detectLineType,
  extractReferences,
  DocumentNavigator,
  resolveInternalReferences,
} from "../index";

const SAMPLE = `Kapitel 5
Abschnitt 2

§ 53 Ordnungsmaßnahmen
(1) Der Lehrer trifft Maßnahmen nach § 42.
(2) Weitere Regelungen finden sich in Art. 6 Abs. 1 und Anlage 2.
1. Ermahnung
2. Klassenkonferenz

§ 42 Grundsatz
(1) Erziehung ist Aufgabe der Schule.

Anlage 2
Muster für den Bescheid.
`;

test("detectLineType erkennt Basisstrukturen", () => {
  assert.equal(detectLineType("Kapitel 5")?.type, "chapter");
  assert.equal(detectLineType("Abschnitt 2")?.type, "section");
  assert.equal(detectLineType("§ 53 Ordnungsmaßnahmen")?.type, "paragraph");
  assert.equal(detectLineType("Art. 6")?.type, "article");
  assert.equal(detectLineType("(1) etwas")?.type, "absatz");
  assert.equal(detectLineType("Anlage 2")?.type, "annex");
  assert.equal(detectLineType("Kein Marker hier"), null);
});

test("buildDocumentTree baut korrekte Hierarchie", () => {
  const tree = buildDocumentTree({
    text: SAMPLE,
    sourceId: "src-1",
    sourceLabel: "SchulG NRW",
  });

  assert.equal(tree.parserMethod, "deterministic-regex-statemachine");
  assert.equal(tree.root.type, "document");
  assert.ok(tree.flat.length > 5);

  const kap = tree.root.children[0];
  assert.equal(kap.type, "chapter");
  assert.equal(kap.number, "5");

  const p53 = tree.flat.find((n) => n.type === "paragraph" && n.number === "53");
  assert.ok(p53, "§ 53 muss existieren");
  assert.equal(p53!.metadata.chapter, "5");
  assert.equal(p53!.metadata.section, "2");

  const abs2 = p53!.children.find((c) => c.type === "absatz" && c.number === "2");
  assert.ok(abs2);
  assert.equal(abs2!.metadata.paragraph, "53");
});

test("stabile Pfade und Breadcrumbs", () => {
  const tree = buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" });
  const p53 = tree.flat.find((n) => n.type === "paragraph" && n.number === "53")!;
  assert.match(p53.path, /kap-5\/absch-2\/p-53$/);
  assert.deepEqual(p53.breadcrumb, ["SchulG NRW", "Kapitel 5", "Abschnitt 2", "§ 53"]);
  assert.equal(p53.displayPath, "SchulG NRW › Kapitel 5 › Abschnitt 2 › § 53");
});

test("stabile IDs bleiben bei erneutem Parse gleich", () => {
  const a = buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" });
  const b = buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" });
  const idsA = a.flat.map((n) => n.stableHash);
  const idsB = b.flat.map((n) => n.stableHash);
  assert.deepEqual(idsA, idsB);
});

test("Outline enthält Struktur", () => {
  const tree = buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" });
  assert.ok(tree.outline.length > 0);
  assert.equal(tree.outline[0].type, "chapter");
});

test("extractReferences erkennt §, Art., Anlage", () => {
  const refs = extractReferences("Vgl. § 53 Abs. 2 Satz 1 Nr. 3 sowie Art. 6 Abs. 1 und Anlage 2.");
  const types = refs.map((r) => r.refType).sort();
  assert.deepEqual(types, ["annex", "article", "paragraph"]);
  const p = refs.find((r) => r.refType === "paragraph")!;
  assert.equal(p.refValue.paragraph, "53");
  assert.equal(p.refValue.absatz, "2");
  assert.equal(p.refValue.satz, "1");
  assert.equal(p.refValue.nummer, "3");
});

test("resolveInternalReferences findet vorhandene Ziele", () => {
  const tree = buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" });
  const resolved = resolveInternalReferences(tree);
  const hitP42 = resolved.find((r) => r.refType === "paragraph" && r.refValue.paragraph === "42");
  assert.ok(hitP42);
  assert.notEqual(hitP42!.candidateLocalId, null);
});

test("Validator erkennt konsistente Struktur", () => {
  const tree = buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" });
  assert.equal(tree.validation.ok, true, JSON.stringify(tree.validation.errors));
});

test("Statistik zählt Bausteine", () => {
  const tree = buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" });
  assert.ok(tree.statistics.chapters >= 1);
  assert.ok(tree.statistics.paragraphs >= 2);
  assert.ok(tree.statistics.absaetze >= 2);
  assert.ok(tree.statistics.annexes >= 1);
  assert.ok(tree.statistics.references >= 2);
  assert.ok(tree.statistics.characters > 0);
  assert.ok(tree.statistics.sectionsTotal > 0);
});

test("DocumentNavigator sucht und liefert Nachbarn", () => {
  const tree = buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" });
  const nav = new DocumentNavigator(tree);
  const hits = nav.search("Ordnungsmaßnahmen");
  assert.ok(hits.length > 0);
  const p53 = tree.flat.find((n) => n.type === "paragraph" && n.number === "53")!;
  assert.ok(nav.findByPath(p53.path));
  assert.ok(nav.next(p53));
});

test("Großes Dokument bleibt performant und konsistent", () => {
  const chunk = `§ {n} Titel {n}\n(1) Absatz A mit § {p} Bezug.\n(2) Absatz B.\n`;
  const parts: string[] = ["Kapitel 1\n"];
  for (let i = 1; i <= 200; i++) {
    parts.push(chunk.replaceAll("{n}", String(i)).replaceAll("{p}", String(Math.max(1, i - 1))));
  }
  const t0 = Date.now();
  const tree = buildDocumentTree({ text: parts.join("\n"), sourceId: "big", sourceLabel: "Big" });
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 3000, `Parser zu langsam: ${elapsed}ms`);
  assert.ok(tree.statistics.paragraphs >= 200);
  assert.equal(tree.validation.ok, true);
});

test("Tree-Export ist deterministisch", () => {
  const tree = buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" });
  const json1 = JSON.stringify(tree.outline);
  const json2 = JSON.stringify(
    buildDocumentTree({ text: SAMPLE, sourceId: "src-1", sourceLabel: "SchulG NRW" }).outline,
  );
  assert.equal(json1, json2);
});
