/**
 * Sprint 4.6E – Tests der redaktionellen Matching-Schicht.
 *
 * Geprüft werden Bestandsaudit, Filter, Indexoperationen, Verifikation und
 * das Ansichtsmodell. Es wird keine Matching-Logik nachgebaut: alle Erwartungen
 * beziehen sich auf die bestehenden Services.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_AUDIT_FILTER,
  applyStaleOnly,
  buildAuditReport,
  buildProfilePanelModel,
  defaultIndexBuilder,
  defaultPracticeCaseAuditor,
  defaultProfileMapper,
  filterAuditRows,
  previewIndex,
  reindexCase,
  verifyIndex,
  type PracticeCaseSource,
} from "../index";

function source(overrides: Partial<PracticeCaseSource> = {}): PracticeCaseSource {
  return {
    id: "case-1",
    title: "Handynutzung im Unterricht",
    status: "published",
    ampel: "gelb",
    category: "Digitales",
    subcategory: "Mediennutzung",
    shortDescription:
      "Eine Lehrkraft beobachtet, dass ein Schüler im Unterricht heimlich eine Aufnahme erstellt.",
    shortAnswer: "Gerät sichern lassen, Vorgang dokumentieren, Schulleitung informieren.",
    recommendation: "Sachlich dokumentieren und Eltern informieren.",
    responsibilities: "Lehrkraft, Schulleitung",
    legalExplanation: "Persönlichkeitsrecht und Recht am eigenen Bild sind betroffen.",
    checklist: ["Vorgang dokumentieren"],
    documentation: ["Aktennotiz"],
    keywords: ["Handynutzung", "Bildrechte", "Datenschutz"],
    legalSectionIds: ["sec-1"],
    templateIds: ["tpl-1"],
    hasDecisionTree: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
    curatedProfile: null,
    ...overrides,
  };
}

/* ------------------------------ Bestandsaudit ----------------------------- */

test("Audit erzeugt je Praxisfall eine Zeile mit Indexzustand", () => {
  const sources = [source(), source({ id: "case-2", title: "Beleidigung im Klassenchat" })];
  const rows = defaultPracticeCaseAuditor.rows(sources, null);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.indexState),
    ["notIndexed", "notIndexed"],
  );
  assert.ok(rows.every((r) => r.contentHash.length > 0));
});

test("Audit kennzeichnet indexierte und veraltete Fälle", () => {
  const sources = [source()];
  const index = defaultIndexBuilder.build(sources);
  const indexedRows = defaultPracticeCaseAuditor.rows(sources, index);
  assert.equal(indexedRows[0].indexState, "indexed");

  const changed = [source({ keywords: ["Handynutzung", "Bildrechte", "Aufnahme", "Neu"] })];
  const staleRows = defaultPracticeCaseAuditor.rows(changed, index);
  assert.equal(staleRows[0].indexState, "stale");
});

test("Audit kennzeichnet nicht veröffentlichte Fälle als übersprungen", () => {
  const sources = [source({ status: "draft" })];
  const index = defaultIndexBuilder.build(sources);
  const rows = defaultPracticeCaseAuditor.rows(sources, index);
  assert.equal(rows[0].indexState, "skipped");
  assert.equal(rows[0].readiness.indexable, false);
  assert.ok(rows[0].errors.length > 0);
});

test("Bestandskennzahlen werden vollständig aus den Quelldaten berechnet", () => {
  const sources = [
    source(),
    source({ id: "case-2", status: "draft", keywords: [], legalSectionIds: [] }),
    source({ id: "case-3", status: "published", title: "Fehlzeiten" }),
  ];
  const inventory = defaultPracticeCaseAuditor.inventory(sources, null);
  assert.equal(inventory.totalCases, 3);
  assert.equal(inventory.publishedCases, 2);
  assert.equal(inventory.matchReady, 2);
  assert.equal(inventory.keywordLinkCount, 6);
  assert.equal(inventory.legalLinkCount, 2);
  assert.equal(inventory.indexedCount, 0);
  assert.ok(inventory.inventoryHash.length > 0);
});

test("Bestandshash ist reproduzierbar und reagiert auf Änderungen", () => {
  const a = defaultPracticeCaseAuditor.inventory([source()], null).inventoryHash;
  const b = defaultPracticeCaseAuditor.inventory([source()], null).inventoryHash;
  const c = defaultPracticeCaseAuditor.inventory([source({ status: "draft" })], null).inventoryHash;
  assert.equal(a, b);
  assert.notEqual(a, c);
});

/* --------------------------------- Filter -------------------------------- */

test("Filter greifen auf Reifegrad, Indexzustand und Suche", () => {
  const sources = [
    source(),
    source({ id: "case-2", title: "Fehlzeiten dokumentieren", status: "draft" }),
  ];
  const rows = defaultPracticeCaseAuditor.rows(sources, null);

  assert.equal(filterAuditRows(rows, EMPTY_AUDIT_FILTER).length, 2);
  assert.equal(filterAuditRows(rows, { ...EMPTY_AUDIT_FILTER, indexable: "yes" }).length, 1);
  assert.equal(filterAuditRows(rows, { ...EMPTY_AUDIT_FILTER, readiness: "notReady" }).length, 1);
  assert.equal(filterAuditRows(rows, { ...EMPTY_AUDIT_FILTER, search: "fehlzeiten" }).length, 1);
  assert.ok(filterAuditRows(rows, { ...EMPTY_AUDIT_FILTER, errors: "only" }).length >= 1);
  assert.equal(
    filterAuditRows(rows, { ...EMPTY_AUDIT_FILTER, indexState: "notIndexed" }).length,
    2,
    "ohne gespeicherten Index gilt jeder Fall als nicht indexiert",
  );
});

/* --------------------------- Indexoperationen ---------------------------- */

test("Indexvorschau verändert den gespeicherten Index nicht", () => {
  const sources = [source()];
  const preview = previewIndex(sources, null);
  assert.equal(preview.added.length, 1);
  assert.equal(preview.changed.length, 0);
  assert.equal(preview.removed.length, 0);
  assert.equal(preview.delta.indexHashBefore, null);
  assert.equal(preview.delta.indexHashAfter, preview.next.indexHash);
});

test("Vorschau meldet übersprungene Fälle als Warnung", () => {
  const preview = previewIndex([source({ status: "draft" })], null);
  assert.ok(preview.warnings.length > 0);
  assert.ok(preview.errors.some((e) => e.includes("indexierbar")));
});

test("Teilübernahme behält unveränderte Einträge samt Indexzeitpunkt", () => {
  const first = [source(), source({ id: "case-2", title: "Fehlzeiten" })];
  const index = defaultIndexBuilder.build(first);
  const before = index.entries.find((e) => e.caseId === "case-1")!;

  const changed = [
    source(),
    source({ id: "case-2", title: "Fehlzeiten", keywords: ["A", "B", "C", "D"] }),
  ];
  const preview = previewIndex(changed, index);
  const merged = applyStaleOnly(preview, index);

  const keptEntry = merged.entries.find((e) => e.caseId === "case-1")!;
  assert.equal(keptEntry.indexedAt, before.indexedAt);
  assert.equal(merged.entries.length, 2);
  assert.equal(merged.indexHash, preview.next.indexHash);
});

test("Einzelfall-Reindexierung lässt andere Einträge unverändert", () => {
  const sources = [source(), source({ id: "case-2", title: "Fehlzeiten" })];
  const index = defaultIndexBuilder.build(sources);
  const untouched = index.entries.find((e) => e.caseId === "case-2")!;

  const updated = source({ keywords: ["Handynutzung", "Bildrechte", "Datenschutz", "Aufnahme"] });
  const { index: next, indexed } = reindexCase(index, updated);
  assert.equal(indexed, true);
  assert.equal(next.entries.length, 2);
  assert.equal(next.entries.find((e) => e.caseId === "case-2")!.indexedAt, untouched.indexedAt);
  assert.notEqual(next.indexHash, index.indexHash);
});

test("Reindexierung eines nicht veröffentlichten Falls entfernt ihn aus dem Index", () => {
  const index = defaultIndexBuilder.build([source()]);
  const { index: next, indexed, skipped } = reindexCase(index, source({ status: "archived" }));
  assert.equal(indexed, false);
  assert.equal(next.entries.length, 0);
  assert.equal(skipped?.reason, "not_published");
});

test("Verifikation erkennt fehlenden und veralteten Index", () => {
  const sources = [source()];
  assert.equal(verifyIndex(null, sources).ok, false);

  const index = defaultIndexBuilder.build(sources);
  assert.equal(verifyIndex(index, sources).ok, true);

  const grown = [...sources, source({ id: "case-2", title: "Fehlzeiten" })];
  const verification = verifyIndex(index, grown);
  assert.equal(verification.ok, false);
  assert.ok(verification.issues.some((i) => i.startsWith("Nicht indexiert")));
});

test("Neue veröffentlichte Fälle wachsen ohne Codeänderung in den Index", () => {
  const index = defaultIndexBuilder.build([source()]);
  const grown = [source(), source({ id: "case-neu", title: "Neuer Praxisfall Mediennutzung" })];
  const preview = previewIndex(grown, index);
  assert.deepEqual(preview.delta.added, ["case-neu"]);
  assert.equal(preview.next.entries.length, 2);
});

test("Auditbericht ist gültiges JSON", () => {
  const report = buildAuditReport({
    inventory: defaultPracticeCaseAuditor.inventory([source()], null),
  });
  const parsed = JSON.parse(report) as { inventory: { totalCases: number } };
  assert.equal(parsed.inventory.totalCases, 1);
});

/* ------------------------------ Ansichtsmodell --------------------------- */

test("Ansichtsmodell trennt abgeleitete und kuratierte Werte", () => {
  const curated = source({
    curatedProfile: {
      status: "approved",
      keywords: ["Handynutzung", "Bildrechte", "Datenschutz", "Aufnahme"],
      requiredSignals: ["nachweiseVorhanden"],
      excludedSignals: ["akuteGefahr"],
      priority: 9,
      specificity: 0,
      matchingEnabled: false,
    },
  });
  const model = buildProfilePanelModel(curated, null);

  assert.equal(model.curated, true);
  assert.equal(model.matchingEnabled, false);
  assert.equal(model.profile.status, "approved");
  assert.equal(model.profile.priority, 5, "Priorität wird auf 1–5 begrenzt");
  assert.equal(model.profile.specificity, 1, "Spezifität wird auf 1–5 begrenzt");

  const keywords = model.fields.find((f) => f.key === "keywords")!;
  assert.deepEqual(keywords.curatedOnly, ["Aufnahme"]);
  assert.equal(keywords.origin, "mixed");
  assert.equal(model.indexStatus.state, "notIndexed");
});

test("Ansichtsmodell zeigt Indexzustand und fehlende Pflichtangaben", () => {
  const incomplete = source({ status: "draft", keywords: [] });
  const model = buildProfilePanelModel(incomplete, null);
  assert.ok(model.missingRequired.length >= 2);
  assert.equal(model.readiness.indexable, false);

  const index = defaultIndexBuilder.build([source()]);
  const indexed = buildProfilePanelModel(source(), index);
  assert.equal(indexed.indexStatus.state, "indexed");
  assert.equal(indexed.indexStatus.indexHash, index.indexHash);
});

test("Kuratiertes Profil wird gegenüber der Ableitung bevorzugt", () => {
  const derived = defaultProfileMapper.derive(source());
  const resolved = defaultProfileMapper.resolve(
    source({ curatedProfile: { categories: ["Sonderfall"], status: "review" } }),
  );
  assert.deepEqual(derived.categories, ["Digitales"]);
  assert.deepEqual(resolved.categories, ["Sonderfall"]);
  assert.equal(resolved.status, "review");
  assert.equal(resolved.origin, "curated");
});
