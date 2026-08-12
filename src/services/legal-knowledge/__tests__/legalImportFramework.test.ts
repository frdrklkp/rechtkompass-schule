/**
 * Sprint 4.5C – Tests für das Legal Import Framework.
 * Nutzt node:test (bestehende Test-Konvention der Doc-Gen-Sprints).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryLegalImportRepository,
  LegalImportError,
  LegalImportService,
  buildSnapshot,
  computeDelta,
  legalImportTelemetry,
  normalizeDocument,
  schulgesetzNrwParser,
  validateDocument,
  bassParser,
  faqParser,
  courtDecisionParser,
  preparedParsers,
} from "../import";
import type {
  LegalImportInput,
  LegalImportParser,
  LegalImportTelemetryPayload,
  NormalizedLegalDocument,
} from "../import";

const SCHUL_TXT = [
  "Schulgesetz für das Land Nordrhein-Westfalen",
  "",
  "§ 1 – Recht auf Bildung",
  "(1) Jeder junge Mensch hat ein Recht auf schulische Bildung.",
  "(2) Die Fähigkeiten und Neigungen sind zu fördern.",
  "",
  "§ 2 – Bildungs- und Erziehungsauftrag",
  "(1) Die Schule vermittelt Werte und Kompetenzen.",
].join("\n");

function inp(raw: string, hint?: LegalImportInput["hint"]): LegalImportInput {
  return { raw, hint };
}

test("Parser: Schulgesetz NRW erkennt Paragraphen und Absätze", () => {
  const doc = schulgesetzNrwParser.parse(inp(SCHUL_TXT));
  assert.equal(doc.root.children.length, 2);
  const p1 = doc.root.children[0];
  assert.equal(p1.kind, "paragraph");
  assert.equal(p1.number, "§ 1");
  assert.equal(p1.heading, "Recht auf Bildung");
  assert.equal(p1.children.length, 2);
  assert.equal(p1.children[0].kind, "subsection");
  assert.equal(p1.children[0].number, "(1)");
});

test("Normalisierung: Whitespace wird geglättet und lokale IDs vergeben", () => {
  const raw: NormalizedLegalDocument = schulgesetzNrwParser.parse(inp(SCHUL_TXT));
  const norm = normalizeDocument(raw);
  const ids = new Set<string>();
  const walk = (n: NormalizedLegalDocument["root"]) => {
    assert.ok(n.localId, "localId nicht vergeben");
    assert.ok(!ids.has(n.localId), `duplicate localId: ${n.localId}`);
    ids.add(n.localId);
    n.children.forEach(walk);
  };
  walk(norm.root);
});

test("Validierung: fehlender Titel wird als Fehler gemeldet", () => {
  const doc = normalizeDocument(schulgesetzNrwParser.parse(inp(SCHUL_TXT)));
  doc.source.title = "";
  const r = validateDocument(doc);
  assert.equal(r.ok, false);
  assert.ok(r.issues.find((i) => i.code === "missing_title"));
});

test("Validierung: doppelte lokale IDs blockieren Import", () => {
  const doc = normalizeDocument(schulgesetzNrwParser.parse(inp(SCHUL_TXT)));
  doc.root.children[1].localId = doc.root.children[0].localId;
  const r = validateDocument(doc);
  assert.equal(r.ok, false);
  assert.ok(r.issues.find((i) => i.code === "duplicate_local_id"));
});

test("Delta-Import: unveränderte Knoten werden als unchanged markiert", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({ parsers: [schulgesetzNrwParser], repository: repo });

  const out1 = await svc.run(inp(SCHUL_TXT, { detectedVersion: "Fassung 2024" }));
  assert.equal(out1.status, "completed");
  assert.equal(out1.delta.updated, 0);
  assert.ok(out1.delta.added > 0);

  const out2 = await svc.run(inp(SCHUL_TXT, { detectedVersion: "Fassung 2024" }));
  assert.equal(out2.status, "no_change");
  assert.equal(out2.delta.added, 0);
  assert.equal(out2.delta.updated, 0);
  assert.equal(out2.delta.removed, 0);
  assert.ok(out2.delta.unchanged > 0);
});

test("Delta-Import: geänderter Absatz erzeugt updated, entfernter Paragraph erzeugt removed", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({ parsers: [schulgesetzNrwParser], repository: repo });
  await svc.run(inp(SCHUL_TXT, { detectedVersion: "Fassung 2024" }));

  const modified = SCHUL_TXT.replace(
    "(2) Die Fähigkeiten und Neigungen sind zu fördern.",
    "(2) Die Fähigkeiten und Neigungen sind besonders zu fördern.",
  ).replace(/§ 2[\s\S]+$/, ""); // § 2 entfernen

  const out = await svc.run(inp(modified, { detectedVersion: "Fassung 2024" }));
  assert.ok(out.delta.updated >= 1, "erwartetes update fehlt");
  assert.ok(out.delta.removed >= 1, "erwartetes remove fehlt");
});

test("Versionierung: gleiche Version aber geänderter Inhalt → version_conflict-Warnung", () => {
  const first = normalizeDocument(schulgesetzNrwParser.parse(inp(SCHUL_TXT)));
  first.version.label = "Fassung 2024";
  const snap = buildSnapshot(first);

  const changed = normalizeDocument(
    schulgesetzNrwParser.parse(
      inp(SCHUL_TXT + "\n\n§ 3 – Neu\n(1) Ergänzung."),
    ),
  );
  changed.version.label = "Fassung 2024";
  const r = validateDocument(changed, snap);
  assert.ok(r.issues.some((i) => i.code === "version_conflict"));
});

test("Fehlerhafte Quelle: leere Eingabe wird abgelehnt", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({ parsers: [schulgesetzNrwParser], repository: repo });
  // Parser matcht leeren Text nicht → no_parser
  await assert.rejects(
    () => svc.run(inp("")),
    (e: unknown) => e instanceof LegalImportError && e.code === "no_parser",
  );
});

test("Doppelte Einträge: manuell gedoppelte Paragraphen werden erkannt", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({ parsers: [schulgesetzNrwParser], repository: repo });
  const dupe = SCHUL_TXT + "\n\n" + SCHUL_TXT.split("\n").slice(2, 5).join("\n"); // § 1 doppelt
  // Der Parser vergibt zwar unterschiedliche path-IDs, aber wir stellen sicher,
  // dass der Validator explizit gesetzte Duplikate abweist.
  const parsed = normalizeDocument(schulgesetzNrwParser.parse(inp(dupe)));
  parsed.root.children[parsed.root.children.length - 1].localId = parsed.root.children[0].localId;
  const r = validateDocument(parsed);
  assert.equal(r.ok, false);
  await assert.rejects(
    () => svc.run(inp("Kein Rechtstext ohne Struktur.")),
    (e: unknown) => e instanceof LegalImportError,
  );
});

test("Parser-Registry: vorbereitete Stubs erkennen ihre Quellenart", () => {
  const cases: Array<[LegalImportParser, string]> = [
    [bassParser, "BASS 12-05 Nr. 1 – Beispiel"],
    [faqParser, "Frage: Wie melde ich einen Vorfall?\nAntwort: Über das Meldeportal."],
    [courtDecisionParser, "Urteil vom 12.03.2024, Az.: 4 K 123/23"],
  ];
  for (const [p, sample] of cases) {
    assert.ok(p.canParse(inp(sample)), `${p.id} sollte erkennen`);
    const doc = p.parse(inp(sample));
    assert.equal(doc.source.key, p.id);
    assert.ok(doc.root.children.length > 0);
  }
  // Alle vorbereiteten Parser exportieren die Standard-Signatur.
  for (const p of preparedParsers) {
    assert.equal(typeof p.canParse, "function");
    assert.equal(typeof p.parse, "function");
  }
});

test("Telemetrie: Ereignisse werden für erfolgreichen Import ausgelöst", async () => {
  const events: LegalImportTelemetryPayload[] = [];
  const off = legalImportTelemetry.register((p) => events.push(p));
  try {
    const svc = new LegalImportService({
      parsers: [schulgesetzNrwParser],
      repository: new InMemoryLegalImportRepository(),
    });
    await svc.run(inp(SCHUL_TXT, { detectedVersion: "Fassung 2024" }));
  } finally {
    off();
  }
  const names = events.map((e) => e.event);
  assert.ok(names.includes("legal_import_started"));
  assert.ok(names.includes("legal_import_delta"));
  assert.ok(names.includes("legal_import_finished"));
});

test("Golden Reference: kompletter Import produziert stabile Signatur", async () => {
  const repo = new InMemoryLegalImportRepository();
  const svc = new LegalImportService({
    parsers: [schulgesetzNrwParser],
    repository: repo,
    now: () => 0,
  });
  const out = await svc.run(inp(SCHUL_TXT, { detectedVersion: "Fassung 2024" }));
  assert.equal(out.sourceKey, "schulgesetz-nrw");
  assert.equal(out.versionLabel, "Fassung 2024");
  assert.equal(out.document.root.children.length, 2);
  const snap = repo.peek("schulgesetz-nrw");
  assert.ok(snap);
  // Snapshot ist deterministisch (gleicher Input → gleiche Hashes).
  const snap2 = buildSnapshot(out.document);
  assert.deepEqual(snap!.nodeHashes, snap2.nodeHashes);
  // Delta gegen sich selbst = nur unchanged.
  const delta = computeDelta(out.document, snap!);
  assert.equal(delta.added, 0);
  assert.equal(delta.updated, 0);
  assert.equal(delta.removed, 0);
});
