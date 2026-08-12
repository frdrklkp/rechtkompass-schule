/**
 * Sprint 4.5H – Tests: Import Experience (Vorschau, Delta Explorer,
 * Versionsvergleich, Importbericht, Dashboard-Kennzahlen, Fehlerdarstellung,
 * Fortschrittsanzeige). Keine Änderungen am Importframework.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeDocument,
  computeDelta,
  validateDocument,
  buildSnapshot,
  schulgesetzNrwParser,
  type LegalImportInput,
  type NormalizedLegalDocument,
} from "../import";
import {
  buildDocumentOverview,
  buildImportPreviewModel,
  buildDeltaExplorer,
  buildVersionComparison,
  buildSectionIndex,
  buildImportReport,
  renderImportReportMarkdown,
  importReportFileName,
  documentContentHash,
  describeImportError,
  aggregateSourceMetrics,
  IMPORT_STEPS,
  stepIdForPhase,
  stepStates,
  progressRatio,
  type SourceImportMetrics,
} from "../import-experience";

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

function doc(text = SCHUL_TXT): NormalizedLegalDocument {
  return normalizeDocument(schulgesetzNrwParser.parse(inp(text)));
}

const PARSER = { id: schulgesetzNrwParser.id, label: schulgesetzNrwParser.label };

/* ---------- Importvorschau ---------- */

test("Importvorschau: Dokumentübersicht zählt Paragraphen und Absätze", () => {
  const overview = buildDocumentOverview(doc());
  assert.equal(overview.documents, 1);
  assert.equal(overview.paragraphs, 2);
  assert.equal(overview.subsections, 3);
  assert.ok(overview.attachments >= 0);
});

test("Importvorschau: Modell enthält Allgemein-, Übersicht- und Delta-Bereich", () => {
  const d = doc();
  const delta = computeDelta(d, null);
  const model = buildImportPreviewModel({
    document: d,
    delta,
    validation: validateDocument(d),
    parser: PARSER,
    durationMs: 42,
  });
  assert.equal(model.general.sourceKey, d.source.key);
  assert.equal(model.general.parserLabel, PARSER.label);
  assert.equal(model.general.durationMs, 42);
  assert.equal(model.general.status, "ready");
  assert.ok(model.overview.paragraphs > 0);
  assert.equal(model.delta.total.added, delta.added);
  assert.equal(model.hasChanges, true);
});

test("Importvorschau: Status 'no_change' ohne Änderungen", () => {
  const d = doc();
  const snapshot = buildSnapshot(d);
  const delta = computeDelta(d, snapshot);
  const model = buildImportPreviewModel({
    document: d,
    delta,
    validation: validateDocument(d, snapshot),
    parser: PARSER,
    durationMs: 5,
  });
  assert.equal(model.hasChanges, false);
  assert.equal(model.general.status, "no_change");
});

test("Importvorschau: blockierter Status bei Validierungsfehler", () => {
  const d = doc();
  d.source.title = "";
  const delta = computeDelta(d, null);
  const model = buildImportPreviewModel({
    document: d,
    delta,
    validation: validateDocument(d),
    parser: PARSER,
    durationMs: 1,
  });
  assert.equal(model.general.status, "blocked");
});

/* ---------- Delta Explorer ---------- */

test("Delta Explorer: gruppiert nach neu, geändert und entfernt", () => {
  const first = doc();
  const index = buildSectionIndex(first);
  const snapshot = buildSnapshot(first);
  const next = doc(
    SCHUL_TXT.replace("§ 2 – Bildungs- und Erziehungsauftrag", "§ 3 – Neue Vorschrift"),
  );
  const delta = computeDelta(next, snapshot);
  const groups = buildDeltaExplorer(next, delta, index);

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((g) => g.kind),
    ["added", "updated", "removed"],
  );
  const total = groups.reduce((sum, g) => sum + g.total, 0);
  assert.ok(total > 0, "keine Änderungen erkannt");
  for (const group of groups) {
    for (const section of group.sections) {
      for (const entry of section.entries) {
        assert.ok(entry.title.length > 0);
        assert.ok(entry.identifier.length > 0);
        assert.ok(entry.version.length > 0);
        assert.ok(entry.reason.length > 0);
      }
    }
  }
});

test("Delta Explorer: entfernte Inhalte nutzen Titel aus dem Abschnittsindex", () => {
  const first = doc();
  const index = buildSectionIndex(first);
  const snapshot = buildSnapshot(first);
  const reduced = doc(SCHUL_TXT.replace(/§ 2[\s\S]+$/, ""));
  const delta = computeDelta(reduced, snapshot);
  const removed = buildDeltaExplorer(reduced, delta, index).find((g) => g.kind === "removed");
  assert.ok(removed);
  assert.ok(removed!.total > 0);
  const entry = removed!.sections[0].entries[0];
  assert.notEqual(entry.title, entry.localId, "Titel wurde nicht aus dem Index aufgelöst");
});

test("Delta Explorer: keine Änderungen ergibt leere Gruppen", () => {
  const d = doc();
  const delta = computeDelta(d, buildSnapshot(d));
  const groups = buildDeltaExplorer(d, delta, buildSectionIndex(d));
  assert.equal(
    groups.reduce((s, g) => s + g.total, 0),
    0,
  );
});

/* ---------- Versionsvergleich ---------- */

test("Versionsvergleich: liefert linke und rechte Seite je Abschnitt", () => {
  const first = doc();
  first.version.label = "Fassung 2023";
  const index = buildSectionIndex(first);
  const snapshot = buildSnapshot(first);

  const next = doc(SCHUL_TXT.replace("Werte und Kompetenzen", "Werte, Haltungen und Kompetenzen"));
  next.version.label = "Fassung 2024";
  const delta = computeDelta(next, snapshot);
  const comparison = buildVersionComparison(next, delta, index, {
    installedVersion: "Fassung 2023",
  });

  assert.equal(comparison.installedVersion, "Fassung 2023");
  assert.equal(comparison.incomingVersion, "Fassung 2024");
  assert.ok(comparison.changedCount > 0);
  const changed = comparison.sections.find((s) => s.status === "updated");
  assert.ok(changed, "kein geänderter Abschnitt gefunden");
  assert.ok(changed!.previousText !== null || changed!.nextText !== null);
});

test("Versionsvergleich: entfernte Abschnitte haben keinen neuen Text", () => {
  const first = doc();
  const index = buildSectionIndex(first);
  const snapshot = buildSnapshot(first);
  const reduced = doc(SCHUL_TXT.replace(/§ 2[\s\S]+$/, ""));
  const delta = computeDelta(reduced, snapshot);
  const comparison = buildVersionComparison(reduced, delta, index);
  const removed = comparison.sections.find((s) => s.status === "removed");
  assert.ok(removed);
  assert.equal(removed!.nextText, null);
});

/* ---------- Importbericht ---------- */

test("Importbericht: enthält Kennzahlen, Prüfsumme und Markdown", () => {
  const d = doc();
  const delta = computeDelta(d, null);
  const report = buildImportReport({
    document: d,
    delta,
    validation: validateDocument(d),
    parser: PARSER,
    durationMs: 120,
    mode: "wizard",
  });
  assert.equal(report.mode, "wizard");
  assert.equal(report.sourceKey, d.source.key);
  assert.equal(report.paragraphs, 2);
  assert.equal(report.delta.added, delta.added);
  assert.match(report.contentHash, /^[0-9a-f]{8}$/);

  const md = renderImportReportMarkdown(report);
  assert.ok(md.includes(d.source.title));
  assert.ok(md.toLowerCase().includes("delta"));
  assert.ok(importReportFileName(report, "pdf").endsWith(".pdf"));
  assert.ok(importReportFileName(report, "md").endsWith(".md"));
});

test("Importbericht: Prüfsumme ist stabil und inhaltsabhängig", () => {
  const a = doc();
  const b = doc();
  assert.equal(documentContentHash(a), documentContentHash(b));
  const c = doc(SCHUL_TXT + "\n\n§ 3 – Ergänzung\n(1) Neu.");
  assert.notEqual(documentContentHash(a), documentContentHash(c));
});

/* ---------- Dashboard-Kennzahlen / Quellenübersicht ---------- */

test("Dashboard: Kennzahlen mehrerer Quellen werden aggregiert", () => {
  const metrics: SourceImportMetrics[] = [
    {
      sourceKey: "a",
      sourceTitle: "A",
      versionLabel: "v1",
      documents: 1,
      paragraphs: 10,
      attachments: 2,
      changed: 3,
      sizeBytes: 100,
      contentHash: "aaaaaaaa",
      lastImportedAt: "2026-01-01T10:00:00.000Z",
    },
    {
      sourceKey: "b",
      sourceTitle: "B",
      versionLabel: "v2",
      documents: 2,
      paragraphs: 5,
      attachments: 1,
      changed: 4,
      sizeBytes: 200,
      contentHash: "bbbbbbbb",
      lastImportedAt: "2026-02-01T10:00:00.000Z",
    },
  ];
  const totals = aggregateSourceMetrics(metrics);
  assert.equal(totals.documents, 3);
  assert.equal(totals.paragraphs, 15);
  assert.equal(totals.attachments, 3);
  assert.equal(totals.changed, 7);
  assert.equal(totals.lastImportedAt, "2026-02-01T10:00:00.000Z");
});

test("Quellenübersicht: leere Kennzahlen liefern Nullwerte", () => {
  const totals = aggregateSourceMetrics([]);
  assert.equal(totals.documents, 0);
  assert.equal(totals.lastImportedAt, null);
});

/* ---------- Fehlerdarstellung ---------- */

test("Fehlerdarstellung: Timeout erhält Handlungsempfehlung", () => {
  const info = describeImportError(new Error("Request timeout after 15000ms"));
  assert.equal(info.code, "timeout");
  assert.ok(info.recommendation.length > 10);
  assert.ok(info.technical.includes("timeout"));
});

test("Fehlerdarstellung: Whitelist-Verstoß wird erkannt", () => {
  const info = describeImportError(new Error("url_rejected: host nicht in Whitelist"));
  assert.equal(info.code, "whitelist_violation");
  assert.ok(info.explanation.length > 10);
});

test("Fehlerdarstellung: unbekannte Fehler bleiben verständlich", () => {
  const info = describeImportError("irgendetwas Unerwartetes");
  assert.ok(info.title.length > 0);
  assert.ok(info.recommendation.length > 0);
});

/* ---------- Fortschrittsanzeige ---------- */

test("Fortschrittsanzeige: Phasen werden auf Schritte abgebildet", () => {
  assert.equal(stepIdForPhase("parsing"), "parse");
  assert.equal(stepIdForPhase("validating"), "validate");
  assert.equal(stepIdForPhase("delta"), "delta");
  assert.equal(IMPORT_STEPS[0].id, "fetch");
  assert.equal(IMPORT_STEPS[IMPORT_STEPS.length - 1].id, "done");
});

test("Fortschrittsanzeige: Zustände und Fortschritt sind monoton", () => {
  const states = stepStates("delta");
  const active = states.find((s) => s.state === "active");
  assert.equal(active?.step.id, "delta");
  assert.ok(states.filter((s) => s.state === "done").length > 0);
  assert.ok(progressRatio("fetch") < progressRatio("delta"));
  assert.equal(progressRatio("done"), 1);
  const failed = stepStates("parse", { failed: true });
  assert.ok(failed.some((s) => s.state === "failed"));
});
