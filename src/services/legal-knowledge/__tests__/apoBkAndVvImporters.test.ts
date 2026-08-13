/**
 * Sprint 4.5E – Tests für APO-BK und Verwaltungsvorschriften-Parser.
 * Nutzt ausschließlich das bestehende Legal Import Framework.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryLegalImportRepository,
  LegalImportService,
  apoBkNrwParser,
  buildSnapshot,
  bassNrwParser,
  normalizeDocument,
  preparedParsers,
  validateDocument,
  verwaltungsvorschriftNrwParser,
} from "../import";
import type { LegalImportInput, LegalNode } from "../import";

function inp(raw: string, hint?: LegalImportInput["hint"]): LegalImportInput {
  return { raw, hint };
}

function findByNumber(root: LegalNode, number: string): LegalNode | null {
  if (root.number === number) return root;
  for (const c of root.children) {
    const r = findByNumber(c, number);
    if (r) return r;
  }
  return null;
}

/* --------------------------- APO-BK --------------------------- */

const APO_TXT = [
  "13-33 Nr. 1.1",
  "",
  "Ausbildungs- und Prüfungsordnung Berufskolleg",
  "(APO-BK)",
  "",
  "Vom 26. Mai 1999",
  "zuletzt geändert durch VO vom 01.07.2023",
  "(GV. NRW. S. 240)",
  "",
  "Herausgeber: Ministerium für Schule und Bildung NRW",
  "",
  "Teil 1 Allgemeine Bestimmungen",
  "",
  "Kapitel 1 Geltungsbereich",
  "",
  "Abschnitt 1 Grundlagen",
  "",
  "§ 1 Zielsetzung",
  "(1) Diese Verordnung regelt Bildungsgänge am Berufskolleg.",
  "(2) Zu den Bildungsgängen zählen:",
  "1. Berufsschule,",
  "2. Berufsfachschule,",
  "a) einjährig,",
  "b) zweijährig.",
  "",
  "§ 2 Stundentafeln",
  "(1) Die Stundentafeln sind Anlage A zu entnehmen.",
  "| Fach | Std |",
  "| Deutsch | 3 |",
  "| Mathematik | 3 |",
  "",
  "Anlage A – Stundentafel Berufsschule",
  "",
  "§ 1 Umfang",
  "(1) Der wöchentliche Unterrichtsumfang beträgt 12 Stunden.",
  "",
  "Anlage B – Prüfungsordnung",
  "",
  "§ 1 Prüfungsteile",
  "(1) Die Prüfung umfasst schriftliche und praktische Teile nach § 42 SchulG.",
].join("\n");

test("APO-BK: canParse erkennt Kurzform und Titel", () => {
  assert.ok(apoBkNrwParser.canParse(inp("APO-BK\nText")));
  assert.ok(apoBkNrwParser.canParse(inp("Ausbildungs- und Prüfungsordnung Berufskolleg")));
  assert.ok(!apoBkNrwParser.canParse(inp("Beliebiger Text ohne Marker")));
});

test("APO-BK: Teil/Kapitel/Abschnitt/Paragraph/Absatz werden korrekt aufgebaut", () => {
  const doc = apoBkNrwParser.parse(inp(APO_TXT));
  const teil = doc.root.children.find((c) => c.kind === "part");
  assert.ok(teil, "Teil fehlt");
  const kap = teil!.children.find((c) => c.kind === "chapter");
  assert.ok(kap);
  const abs = kap!.children.find((c) => c.kind === "section");
  assert.ok(abs);
  const p1 = findByNumber(doc.root, "§ 1")!;
  assert.equal(p1.kind, "paragraph");
  assert.equal(p1.heading, "Zielsetzung");
  const a1 = p1.children.find((c) => c.number === "(1)")!;
  assert.match(a1.text ?? "", /Berufskolleg/);
});

test("APO-BK: gemischte Aufzählungen (1./2. und a)/b))", () => {
  const doc = apoBkNrwParser.parse(inp(APO_TXT));
  const p1 = findByNumber(doc.root, "§ 1")!;
  const a2 = p1.children.find((c) => c.number === "(2)")!;
  const items = a2.children.filter((c) => c.kind === "item");
  assert.ok(items.some((i) => i.number === "1."));
  assert.ok(items.some((i) => i.number === "2."));
  assert.ok(items.some((i) => i.number === "a)"));
  assert.ok(items.some((i) => i.number === "b)"));
});

test("APO-BK: Anlagen bilden eigene Container mit § innerhalb", () => {
  const doc = apoBkNrwParser.parse(inp(APO_TXT));
  const anlagen = doc.root.children.filter(
    (c) => (c.metadata as { role?: string } | undefined)?.role === "anlage",
  );
  assert.equal(anlagen.length, 2);
  assert.equal(anlagen[0].number, "Anlage A");
  assert.equal(anlagen[1].number, "Anlage B");
  const anlAP1 = findByNumber(anlagen[0], "§ 1");
  assert.ok(anlAP1, "§ 1 innerhalb Anlage A fehlt");
});

test("APO-BK: Tabellen werden strukturiert in metadata.rows abgelegt", () => {
  const doc = apoBkNrwParser.parse(inp(APO_TXT));
  const p2 = findByNumber(doc.root, "§ 2")!;
  const table = (function find(n: LegalNode): LegalNode | null {
    if ((n.metadata as { type?: string } | undefined)?.type === "table") return n;
    for (const c of n.children) { const r = find(c); if (r) return r; }
    return null;
  })(p2);
  assert.ok(table, "Tabellenknoten fehlt");
  const rows = (table!.metadata as { rows: string[][] }).rows;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["Fach", "Std"]);
});

test("APO-BK: Verweise landen in metadata.references", () => {
  const doc = apoBkNrwParser.parse(inp(APO_TXT));
  const anlB = doc.root.children.find((c) => c.number === "Anlage B")!;
  const p1 = findByNumber(anlB, "§ 1")!;
  const a1 = p1.children.find((c) => c.number === "(1)")!;
  const refs = (a1.metadata as { references?: string[] } | undefined)?.references ?? [];
  assert.ok(refs.some((r) => /§\s*42/.test(r)));
});

test("APO-BK: Kopfmetadaten (Datum, Herausgeber, Fundstelle, Änderung)", () => {
  const doc = apoBkNrwParser.parse(inp(APO_TXT));
  assert.equal(doc.source.key, "apo-bk-nrw");
  assert.equal(doc.source.shortName, "APO-BK");
  assert.equal(doc.version.publishedAt, "1999-05-26");
  assert.equal(doc.version.label, "Fassung 2023-07-01");
  assert.match(String(doc.source.authority), /Ministerium/);
  assert.match(String(doc.source.metadata && (doc.source.metadata as any).citation), /13-33 Nr\.\s*1\.1/);
});

test("APO-BK: Normalisierung + Validierung ohne Fehler", () => {
  const doc = normalizeDocument(apoBkNrwParser.parse(inp(APO_TXT)));
  const r = validateDocument(doc);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test("APO-BK: Delta – unveränderte Quelle → no_change", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({ parsers: [apoBkNrwParser], repository: repo });
  await svc.run(inp(APO_TXT));
  const out2 = await svc.run(inp(APO_TXT));
  assert.equal(out2.status, "no_change");
  assert.ok(out2.delta.unchanged > 0);
});

test("APO-BK: Delta – neue Anlage → added; entfallener § → removed", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({ parsers: [apoBkNrwParser], repository: repo });
  await svc.run(inp(APO_TXT));
  // Anlage C wird ergänzt; § 2 in Teil 1 entfällt.
  const withoutP2 = APO_TXT.replace(
    /\n§ 2 Stundentafeln[\s\S]*?(?=\nAnlage A)/,
    "\n",
  );
  const changed = withoutP2 + "\n\nAnlage C – Übergang\n\n§ 1 Übergang\n(1) Neu ergänzt.";
  const out = await svc.run(inp(changed));
  assert.ok(out.delta.added >= 1, `Anlage C sollte added sein (delta=${JSON.stringify(out.delta)})`);
  assert.ok(out.delta.removed >= 1, `§ 2 sollte removed sein (delta=${JSON.stringify(out.delta)})`);
});

test("APO-BK: stabile lokale IDs bei mehrfachem Parsen", () => {
  const a = normalizeDocument(apoBkNrwParser.parse(inp(APO_TXT)));
  const b = normalizeDocument(apoBkNrwParser.parse(inp(APO_TXT)));
  const ids = (n: LegalNode): string[] => [n.localId, ...n.children.flatMap(ids)];
  assert.deepEqual(ids(a.root), ids(b.root));
});

test("APO-BK: Versionskonflikt bei identischer Version, geänderter Struktur", () => {
  const first = normalizeDocument(apoBkNrwParser.parse(inp(APO_TXT)));
  first.version.label = "Fassung 2023";
  const snap = buildSnapshot(first);
  const changed = normalizeDocument(
    apoBkNrwParser.parse(inp(APO_TXT + "\n\n§ 99 Übergang\n(1) Neu.")),
  );
  changed.version.label = "Fassung 2023";
  const r = validateDocument(changed, snap);
  assert.ok(r.issues.some((i) => i.code === "version_conflict"));
});

/* --------------------- Verwaltungsvorschriften --------------------- */

const VV_TXT = [
  "10-32 Nr. 4",
  "",
  "Verwaltungsvorschriften",
  "zum Schulgesetz NRW",
  "",
  "Vom 15. März 2018",
  "zuletzt geändert durch RdErl. vom 22.11.2023",
  "ABl. NRW. S. 187",
  "",
  "RdErl. d. Ministeriums für Schule und Bildung",
  "",
  "1 Geltungsbereich",
  "Diese Verwaltungsvorschrift gilt für alle Schulen nach § 2 SchulG.",
  "",
  "1.1 Öffentliche Schulen",
  "Sie umfasst insbesondere:",
  "a) Grundschulen,",
  "b) weiterführende Schulen.",
  "",
  "1.2 Ersatzschulen",
  "Regelungen für Ersatzschulen gelten entsprechend gemäß BASS 20-01 Nr. 1.",
  "",
  "2 Verfahren",
  "",
  "2.1 Antragstellung",
  "Der Antrag ist schriftlich zu stellen.",
  "| Feld | Wert |",
  "| Name | Pflicht |",
  "| Anschrift | Pflicht |",
  "",
  "2.1.1 Fristen",
  "Die Frist beträgt vier Wochen.",
  "",
  "Anlage 1 Musterformular",
  "Das Musterformular steht auf der Website bereit.",
].join("\n");

test("VV: canParse erkennt Titel", () => {
  assert.ok(verwaltungsvorschriftNrwParser.canParse(inp("Verwaltungsvorschrift zu X\nText")));
  assert.ok(!verwaltungsvorschriftNrwParser.canParse(inp("Beliebiger Text ohne Marker")));
});

test("VV: Nummern und Unternummern (1, 1.1, 1.1.1) bilden Hierarchie", () => {
  const doc = verwaltungsvorschriftNrwParser.parse(inp(VV_TXT));
  const n1 = findByNumber(doc.root, "1");
  const n11 = findByNumber(doc.root, "1.1");
  const n211 = findByNumber(doc.root, "2.1.1");
  assert.ok(n1 && n11 && n211);
  assert.equal(n1!.kind, "section");
  assert.equal(n11!.kind, "subsection");
  assert.equal(n211!.kind, "item");
  // Hierarchie: 1.1 hängt unter 1
  assert.ok(n1!.children.some((c) => c.number === "1.1"));
  // 2.1.1 hängt unter 2.1
  const n21 = findByNumber(doc.root, "2.1")!;
  assert.ok(n21.children.some((c) => c.number === "2.1.1"));
});

test("VV: Fließtext, Listen und Tabellen werden korrekt gebunden", () => {
  const doc = verwaltungsvorschriftNrwParser.parse(inp(VV_TXT));
  const n11 = findByNumber(doc.root, "1.1")!;
  const items = n11.children.filter((c) => c.kind === "item" && /^[a-z]\)$/.test(c.number ?? ""));
  assert.equal(items.length, 2);
  const n21 = findByNumber(doc.root, "2.1")!;
  const table = n21.children.find(
    (c) => (c.metadata as { type?: string } | undefined)?.type === "table",
  );
  assert.ok(table, "Tabelle unter 2.1 fehlt");
  const rows = (table!.metadata as { rows: string[][] }).rows;
  assert.equal(rows.length, 3);
});

test("VV: Anlagen als eigene Container", () => {
  const doc = verwaltungsvorschriftNrwParser.parse(inp(VV_TXT));
  const anl = doc.root.children.find((c) => c.number === "Anlage 1");
  assert.ok(anl);
  assert.equal((anl!.metadata as { role?: string }).role, "anlage");
  assert.match(anl!.text ?? anl!.children.map((c) => c.text).join(" ") ?? "", /Musterformular|Website/);
});

test("VV: Verweise werden in metadata.references erfasst", () => {
  const doc = verwaltungsvorschriftNrwParser.parse(inp(VV_TXT));
  const n1 = findByNumber(doc.root, "1")!;
  const refs1 = (n1.metadata as { references?: string[] } | undefined)?.references ?? [];
  assert.ok(refs1.some((r) => /§\s*2/.test(r)));
  const n12 = findByNumber(doc.root, "1.2")!;
  const refs2 = (n12.metadata as { references?: string[] } | undefined)?.references ?? [];
  assert.ok(refs2.some((r) => /BASS\s*20\s*-\s*01/i.test(r)));
});

test("VV: Metadaten (BASS-Gliederung, ABl., Daten, Herausgeber)", () => {
  const doc = verwaltungsvorschriftNrwParser.parse(inp(VV_TXT));
  assert.equal(doc.source.key, "verwaltungsvorschrift-nrw");
  assert.equal(doc.source.shortName, "VV");
  assert.match(doc.source.title, /Verwaltungsvorschrift/i);
  assert.equal(doc.version.publishedAt, "2018-03-15");
  assert.equal(doc.version.label, "Fassung 2023-11-22");
  const meta = doc.source.metadata as { bassNumber?: string; fundstelle?: string };
  assert.match(String(meta.bassNumber), /10-32 Nr\. 4/);
  assert.match(String(meta.fundstelle), /ABl\. NRW/);
});

test("VV: Normalisierung + Validierung ohne Fehler", () => {
  const doc = normalizeDocument(verwaltungsvorschriftNrwParser.parse(inp(VV_TXT)));
  const r = validateDocument(doc);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test("VV: Delta – Re-Import ohne Änderung → no_change", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({
    parsers: [verwaltungsvorschriftNrwParser],
    repository: repo,
  });
  await svc.run(inp(VV_TXT));
  const out2 = await svc.run(inp(VV_TXT));
  assert.equal(out2.status, "no_change");
});

test("VV: Delta – geänderter Abschnitt → updated, entfallene Anlage → removed", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({
    parsers: [verwaltungsvorschriftNrwParser],
    repository: repo,
  });
  await svc.run(inp(VV_TXT));
  const changed = VV_TXT
    .replace("Der Antrag ist schriftlich zu stellen.", "Der Antrag ist elektronisch zu stellen.")
    .replace(/\nAnlage 1[\s\S]+$/, "");
  const out = await svc.run(inp(changed));
  assert.ok(out.delta.updated >= 1);
  assert.ok(out.delta.removed >= 1);
});

test("VV: stabile lokale IDs bei mehrfachem Parsen", () => {
  const a = normalizeDocument(verwaltungsvorschriftNrwParser.parse(inp(VV_TXT)));
  const b = normalizeDocument(verwaltungsvorschriftNrwParser.parse(inp(VV_TXT)));
  const ids = (n: LegalNode): string[] => [n.localId, ...n.children.flatMap(ids)];
  assert.deepEqual(ids(a.root), ids(b.root));
});

test("VV: fehlerhafte Quelle (leer) wird durch Framework abgewiesen", async () => {
  const svc = new LegalImportService({
    parsers: [verwaltungsvorschriftNrwParser],
    repository: new InMemoryLegalImportRepository(),
  });
  await assert.rejects(() => svc.run(inp("")));
});

/* --------------------- Registry & Kompatibilität --------------------- */

test("Parser-Registry enthält alle produktionsreifen Parser", () => {
  assert.ok(preparedParsers.includes(bassNrwParser));
  assert.ok(preparedParsers.includes(apoBkNrwParser));
  assert.ok(preparedParsers.includes(verwaltungsvorschriftNrwParser));
});

test("Registry: canParse trennt APO-BK, VV und BASS deterministisch", () => {
  assert.ok(apoBkNrwParser.canParse(inp("APO-BK\nText")));
  assert.ok(!bassNrwParser.canParse(inp("APO-BK\nText")));
  assert.ok(verwaltungsvorschriftNrwParser.canParse(inp("Verwaltungsvorschrift zu X")));
  assert.ok(bassNrwParser.canParse(inp("BASS 12-05 Nr. 1\nText")));
});
