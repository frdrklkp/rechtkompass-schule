/**
 * Sprint 4.5D – Tests für den produktionsreifen BASS-Importer.
 * Nutzt ausschließlich das bestehende Legal Import Framework.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryLegalImportRepository,
  LegalImportError,
  LegalImportService,
  bassNrwParser,
  buildSnapshot,
  computeDelta,
  legalImportTelemetry,
  normalizeDocument,
  validateDocument,
} from "../import";
import type { LegalImportInput, LegalImportTelemetryPayload, LegalNode } from "../import";

const BASS_TXT = [
  "12-05 Nr. 1",
  "",
  "Verordnung",
  "über den Bildungsgang und die Abiturprüfung",
  "in der gymnasialen Oberstufe",
  "",
  "Vom 5. Oktober 2010",
  "zuletzt geändert durch RdErl. vom 15.06.2024",
  "",
  "Herausgeber: Ministerium für Schule und Bildung",
  "Vgl. BASS 12-05 Nr. 1.",
  "",
  "Teil 1 Allgemeine Bestimmungen",
  "",
  "Kapitel 1 Geltungsbereich",
  "",
  "Abschnitt 1 Grundlagen",
  "",
  "§ 1 Geltungsbereich",
  "(1) Diese Verordnung gilt für die gymnasiale Oberstufe.",
  "(2) Ausgenommen sind:",
  "a) Schulen in freier Trägerschaft nach § 100 SchulG,",
  "b) Weiterbildungskollegs gemäß Artikel 3.",
  "",
  "§ 2 Aufgaben",
  "(1) Die gymnasiale Oberstufe führt zur Hochschulreife.",
  "",
  "Kapitel 2 Stundentafel",
  "",
  "§ 3 Stundentafel",
  "(1) Die Wochenstunden sind der folgenden Tabelle zu entnehmen.",
  "| Fach | EF | Q1 | Q2 |",
  "| Deutsch | 3 | 3 | 3 |",
  "| Mathematik | 3 | 4 | 4 |",
  "",
  "(2) Ergänzende Regelungen enthält BASS 13-11 Nr. 2.",
].join("\n");

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

test("BASS: canParse erkennt Zitat und offizielle URL", () => {
  assert.ok(bassNrwParser.canParse(inp("BASS 12-05 Nr. 1\nText")));
  assert.ok(
    bassNrwParser.canParse(
      inp("Nur Fließtext", { officialUrl: "https://bass.schul-welt.de/1234.htm" }),
    ),
  );
  assert.ok(!bassNrwParser.canParse(inp("Ein beliebiger Text ohne Marker.")));
});

test("BASS: vollständiger Import erzeugt Teil/Kapitel/Abschnitt/Paragraph/Absatz", () => {
  const doc = bassNrwParser.parse(inp(BASS_TXT));
  const teil = doc.root.children.find((c) => c.kind === "part");
  assert.ok(teil, "Teil fehlt");
  assert.equal(teil!.number, "Teil 1");
  const kapitel = teil!.children.find((c) => c.kind === "chapter");
  assert.ok(kapitel);
  const abschnitt = kapitel!.children.find((c) => c.kind === "section");
  assert.ok(abschnitt);
  const p1 = findByNumber(doc.root, "§ 1");
  assert.ok(p1);
  assert.equal(p1!.kind, "paragraph");
  assert.equal(p1!.heading, "Geltungsbereich");
  const abs1 = p1!.children.find((c) => c.number === "(1)");
  assert.ok(abs1);
  assert.match(abs1!.text ?? "", /gymnasiale Oberstufe/);
});

test("BASS: Listen (a/b) werden als Items unterhalb des Absatzes abgelegt", () => {
  const doc = bassNrwParser.parse(inp(BASS_TXT));
  const p1 = findByNumber(doc.root, "§ 1")!;
  const abs2 = p1.children.find((c) => c.number === "(2)")!;
  const items = abs2.children.filter((c) => c.kind === "item");
  assert.equal(items.length, 2);
  assert.equal(items[0].number, "a)");
  assert.match(items[1].text ?? "", /Weiterbildungskollegs/);
});

test("BASS: Tabellen werden als text-Node mit metadata.rows abgelegt", () => {
  const doc = bassNrwParser.parse(inp(BASS_TXT));
  const p3 = findByNumber(doc.root, "§ 3")!;
  const abs1 = p3.children.find((c) => c.number === "(1)")!;
  const table = abs1.children.find(
    (c) => (c.metadata as { type?: string } | undefined)?.type === "table",
  );
  assert.ok(table, "Tabellenknoten fehlt");
  const rows = (table!.metadata as { rows: string[][] }).rows;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["Fach", "EF", "Q1", "Q2"]);
  assert.deepEqual(rows[2], ["Mathematik", "3", "4", "4"]);
});

test("BASS: Verweise werden als metadata.references je Textknoten extrahiert", () => {
  const doc = bassNrwParser.parse(inp(BASS_TXT));
  const p1 = findByNumber(doc.root, "§ 1")!;
  const abs2 = p1.children.find((c) => c.number === "(2)")!;
  const alphaItem = abs2.children.find((c) => c.number === "a)")!;
  const refs = (alphaItem.metadata as { references?: string[] } | undefined)?.references ?? [];
  assert.ok(refs.some((r) => /§\s*100/.test(r)), "§ 100 sollte als Verweis erkannt werden");

  const p3 = findByNumber(doc.root, "§ 3")!;
  const abs2p3 = p3.children.find((c) => c.number === "(2)")!;
  const refs2 = (abs2p3.metadata as { references?: string[] } | undefined)?.references ?? [];
  assert.ok(refs2.some((r) => /BASS\s*13\s*-\s*11/i.test(r)), "BASS-Verweis fehlt");
});

test("BASS: Metadaten (Zitat, Herausgeber, Daten) und Versionslabel", () => {
  const doc = bassNrwParser.parse(inp(BASS_TXT));
  assert.equal(doc.source.key, "bass-nrw");
  assert.equal(doc.source.shortName, "BASS");
  assert.equal(doc.source.jurisdiction, "NRW");
  assert.match(doc.source.title, /Verordnung/);
  assert.match(String(doc.source.authority), /Ministerium/);
  assert.equal(doc.version.publishedAt, "2010-10-05");
  assert.match(doc.version.citation ?? "", /12-05 Nr\. 1/);
  // Versionslabel bevorzugt „Zuletzt geändert".
  assert.equal(doc.version.label, "Fassung 2024-06-15");
  assert.equal((doc.source.metadata as { source?: string }).source, "bass");
});

test("BASS: Normalisierung + Validierung liefern keinen Fehler", () => {
  const doc = normalizeDocument(bassNrwParser.parse(inp(BASS_TXT)));
  const r = validateDocument(doc);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test("BASS: Delta – unveränderte Quelle ergibt no_change beim Re-Import", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({ parsers: [bassNrwParser], repository: repo });
  const out1 = await svc.run(inp(BASS_TXT));
  assert.equal(out1.status, "completed");
  const out2 = await svc.run(inp(BASS_TXT));
  assert.equal(out2.status, "no_change");
  assert.equal(out2.delta.added, 0);
  assert.equal(out2.delta.updated, 0);
  assert.equal(out2.delta.removed, 0);
  assert.ok(out2.delta.unchanged > 0);
});

test("BASS: Delta – geänderte Quelle erzeugt updated bzw. removed", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({ parsers: [bassNrwParser], repository: repo });
  await svc.run(inp(BASS_TXT));
  const changed = BASS_TXT
    .replace(
      "(1) Die gymnasiale Oberstufe führt zur Hochschulreife.",
      "(1) Die gymnasiale Oberstufe führt planmäßig zur allgemeinen Hochschulreife.",
    )
    .replace(/\n§ 3 Stundentafel[\s\S]+$/, ""); // § 3 (inkl. Tabelle) entfernen
  const out = await svc.run(inp(changed));
  assert.ok(out.delta.updated >= 1, "erwartetes update fehlt");
  assert.ok(out.delta.removed >= 1, "erwartetes remove fehlt");
});

test("BASS: fehlerhafte Quelle (leerer Rohtext) wird kontrolliert abgewiesen", async () => {
  const svc = new LegalImportService({
    parsers: [bassNrwParser],
    repository: new InMemoryLegalImportRepository(),
  });
  await assert.rejects(
    () => svc.run(inp("")),
    (e: unknown) => e instanceof LegalImportError && e.code === "no_parser",
  );
});

test("BASS: Versionskonflikt – gleiche Version, geänderte Struktur → Warnung", () => {
  const first = normalizeDocument(bassNrwParser.parse(inp(BASS_TXT)));
  first.version.label = "Fassung 2024";
  const snap = buildSnapshot(first);
  const changed = normalizeDocument(
    bassNrwParser.parse(inp(BASS_TXT + "\n\n§ 99 Übergang\n(1) Ergänzt.")),
  );
  changed.version.label = "Fassung 2024";
  const r = validateDocument(changed, snap);
  assert.ok(r.issues.some((i) => i.code === "version_conflict"));
});

test("BASS: Telemetrie enthält parserId=bass-nrw und sourceKey", async () => {
  const events: LegalImportTelemetryPayload[] = [];
  const off = legalImportTelemetry.register((p) => events.push(p));
  try {
    const svc = new LegalImportService({
      parsers: [bassNrwParser],
      repository: new InMemoryLegalImportRepository(),
    });
    await svc.run(inp(BASS_TXT));
  } finally {
    off();
  }
  assert.ok(events.some((e) => e.event === "legal_import_started" && e.parserId === "bass-nrw"));
  assert.ok(events.some((e) => e.event === "legal_import_finished" && e.sourceKey === "bass-nrw"));
  const delta = events.find((e) => e.event === "legal_import_delta");
  assert.ok(delta && delta.parserId === "bass-nrw");
});

test("BASS: Golden Reference – Signatur ist deterministisch", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({ parsers: [bassNrwParser], repository: repo, now: () => 0 });
  const out = await svc.run(inp(BASS_TXT));
  const snap = repo.peek("bass-nrw");
  assert.ok(snap);
  const snap2 = buildSnapshot(out.document);
  assert.deepEqual(snap!.nodeHashes, snap2.nodeHashes);
  const delta = computeDelta(out.document, snap!);
  assert.equal(delta.added, 0);
  assert.equal(delta.updated, 0);
  assert.equal(delta.removed, 0);
});
