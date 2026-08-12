/**
 * Sprint 4.6G – Tests des Legal Context.
 *
 * Prüft Resolver, FreshnessChecker, Ranker, Explainer und Service
 * deterministisch und ohne Netzwerk (injizierter Fetcher).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LegalContextError,
  LegalContextEventBus,
  LegalContextExplainer,
  LegalContextFreshnessChecker,
  LegalContextService,
  LEGAL_CONTEXT_SCHEMA_VERSION,
  rankLegalReferences,
  resolveLegalContext,
  type LegalContextData,
  type LegalContextResult,
  type LegalLinkRow,
  type LegalSectionRow,
  type LegalSourceRow,
} from "@/services/legal-context";

/* ------------------------------ Fixtures --------------------------------- */

const NOW = new Date("2026-07-20T12:00:00.000Z");
const now = () => new Date(NOW.getTime());

const CASE_ROW = {
  id: "case-1",
  title: "Beleidigung im Unterricht",
  updated_at: "2026-07-15T10:00:00.000Z",
  status: "published",
};

const SOURCE_LAW: LegalSourceRow = {
  id: "src-schulg",
  name: "Schulgesetz für das Land Nordrhein-Westfalen",
  short_name: "SchulG NRW",
  source_type: "law",
  source_type_v2: "law",
  jurisdiction: "Nordrhein-Westfalen",
  official_url: "https://recht.nrw/schulg",
  version_label: "Stand 2026",
  lifecycle_status: "active",
  verification_status: "editorial_reviewed",
  valid_from: "2005-01-01",
  valid_to: null,
  last_verified_at: "2026-07-01T00:00:00.000Z",
  last_reviewed_at: "2026-07-01",
  replaced_by_source_id: null,
  updated_at: "2026-07-01T08:00:00.000Z",
};

const SOURCE_VV: LegalSourceRow = {
  id: "src-vv",
  name: "Verwaltungsvorschrift Schulrecht",
  short_name: "VV-SchulR",
  source_type: "administrative_regulation",
  source_type_v2: "administrative_regulation",
  jurisdiction: "Nordrhein-Westfalen",
  official_url: null,
  version_label: null,
  lifecycle_status: "active",
  verification_status: "unverified",
  valid_from: null,
  valid_to: null,
  last_verified_at: null,
  last_reviewed_at: null,
  replaced_by_source_id: null,
  updated_at: "2026-06-01T08:00:00.000Z",
};

const SECTION_53: LegalSectionRow = {
  id: "sec-53",
  source_id: "src-schulg",
  section_number: "§ 53",
  title: "Ordnungsmaßnahmen",
  summary: "Ordnungsmaßnahmen bei Verstößen.",
  practice_relevance: "Zentrale Grundlage bei disziplinarischen Fragen.",
  recommendation: null,
  official_url: "https://recht.nrw/schulg#53",
  version_label: null,
  valid_from: "2005-01-01",
  valid_to: null,
  status: "approved",
  last_reviewed_at: "2026-07-01",
  updated_at: "2026-07-01T08:00:00.000Z",
};

const SECTION_VV1: LegalSectionRow = {
  id: "sec-vv1",
  source_id: "src-vv",
  section_number: "Nr. 4.2",
  title: "Verfahrenshinweise",
  summary: null,
  practice_relevance: null,
  recommendation: null,
  official_url: null,
  version_label: null,
  valid_from: null,
  valid_to: null,
  status: "draft",
  last_reviewed_at: null,
  updated_at: "2026-06-01T08:00:00.000Z",
};

const SECTION_ORPHAN: LegalSectionRow = {
  id: "sec-orphan",
  source_id: null,
  section_number: "§ 99",
  title: "Ohne Quelle",
  summary: null,
  practice_relevance: null,
  recommendation: null,
  official_url: null,
  version_label: null,
  valid_from: null,
  valid_to: null,
  status: "draft",
  last_reviewed_at: null,
  updated_at: "2026-05-01T08:00:00.000Z",
};

const LINK_53: LegalLinkRow = {
  id: "link-1",
  legal_section_id: "sec-53",
  relevance: "high",
  explanation: "Tragende Norm bei Ordnungsmaßnahmen.",
  created_at: "2026-07-10T09:00:00.000Z",
};

const LINK_VV1_LEGACY_COLUMN: LegalLinkRow = {
  id: "link-2",
  section_id: "sec-vv1",
  relevance: "medium",
  explanation: null,
  created_at: "2026-07-10T09:00:00.000Z",
};

const LINK_ORPHAN: LegalLinkRow = {
  id: "link-3",
  legal_section_id: "sec-orphan",
  relevance: null,
  explanation: null,
  created_at: "2026-07-10T09:00:00.000Z",
};

const LINK_MISSING: LegalLinkRow = {
  id: "link-4",
  legal_section_id: "sec-geloescht",
  relevance: "low",
  explanation: null,
  created_at: "2026-07-10T09:00:00.000Z",
};

function fixtureData(overrides: Partial<LegalContextData> = {}): LegalContextData {
  return {
    caseRow: { ...CASE_ROW },
    links: [LINK_53, LINK_VV1_LEGACY_COLUMN, LINK_ORPHAN, LINK_MISSING],
    sections: [SECTION_53, SECTION_VV1, SECTION_ORPHAN],
    sources: [SOURCE_LAW, SOURCE_VV],
    ...overrides,
  };
}

function makeService(events?: LegalContextEventBus) {
  return new LegalContextService({
    fetcher: async () => fixtureData(),
    events,
    now,
  });
}

/* ------------------------------ Resolver --------------------------------- */

test("Resolver löst Verknüpfungskette inkl. beider Spaltenvarianten auf", () => {
  const { references, issues } = resolveLegalContext(fixtureData());
  assert.equal(references.length, 3);
  const bySection = new Map(references.map((r) => [r.sectionId, r]));

  const s53 = bySection.get("sec-53");
  assert.ok(s53);
  assert.equal(s53.reference, "§ 53");
  assert.equal(s53.relevance, "high");
  assert.equal(s53.linkExplanation, "Tragende Norm bei Ordnungsmaßnahmen.");
  assert.equal(s53.source?.shortName, "SchulG NRW");
  assert.equal(s53.source?.sourceType, "law");

  // Legacy-Spalte section_id wird ebenfalls aufgelöst.
  const vv1 = bySection.get("sec-vv1");
  assert.ok(vv1);
  assert.equal(vv1.source?.id, "src-vv");

  // Abschnitt ohne Quelle: Referenz bleibt, Issue wird gemeldet.
  const orphan = bySection.get("sec-orphan");
  assert.ok(orphan);
  assert.equal(orphan.source, null);
  assert.ok(issues.some((i) => i.type === "missing_source" && i.sectionId === "sec-orphan"));

  // Verknüpfung auf fehlenden Abschnitt: Issue statt Referenz.
  assert.ok(issues.some((i) => i.type === "missing_section" && i.sectionId === "sec-geloescht"));
});

test("Resolver dedupliziert doppelte Verknüpfungen auf denselben Abschnitt", () => {
  const { references } = resolveLegalContext(
    fixtureData({ links: [LINK_53, { ...LINK_53, id: "link-dup" }] }),
  );
  assert.equal(references.filter((r) => r.sectionId === "sec-53").length, 1);
});

/* --------------------------- FreshnessChecker ---------------------------- */

test("Freshness: ausdrücklich veraltete Quelle (Lifecycle)", () => {
  const checker = new LegalContextFreshnessChecker({ now });
  const { references } = resolveLegalContext(fixtureData());
  const s53 = references.find((r) => r.sectionId === "sec-53")!;
  const outdated = checker.assess({
    ...s53,
    source: { ...s53.source!, lifecycleStatus: "outdated" },
  });
  assert.equal(outdated.status, "outdated");
  assert.ok(outdated.reasons[0].includes("nicht mehr aktuell"));
});

test("Freshness: abgelaufener Gültigkeitszeitraum und ersetzte Fassung", () => {
  const checker = new LegalContextFreshnessChecker({ now });
  const { references } = resolveLegalContext(fixtureData());
  const s53 = references.find((r) => r.sectionId === "sec-53")!;
  assert.equal(
    checker.assess({ ...s53, source: { ...s53.source!, validTo: "2026-01-01" } }).status,
    "outdated",
  );
  assert.equal(
    checker.assess({ ...s53, source: { ...s53.source!, replacedBySourceId: "src-neu" } }).status,
    "outdated",
  );
  assert.equal(
    checker.assess({ ...s53, sectionValidTo: "2020-12-31" }).status,
    "outdated",
  );
});

test("Freshness: aging, unknown und current", () => {
  const checker = new LegalContextFreshnessChecker({ now, agingDays: 180 });
  const { references } = resolveLegalContext(fixtureData());
  const s53 = references.find((r) => r.sectionId === "sec-53")!;
  const vv1 = references.find((r) => r.sectionId === "sec-vv1")!;

  // Prüfung vor 19 Tagen → current.
  assert.equal(checker.assess(s53).status, "current");

  // Prüfung vor 400 Tagen → aging (Abschnitts- und Quellendaten alt).
  const oldSource = { ...s53.source!, lastVerifiedAt: "2025-06-15", lastReviewedAt: "2025-06-15" };
  const aging = checker.assess({ ...s53, source: oldSource, sectionLastReviewedAt: "2025-06-15" });
  assert.equal(aging.status, "aging");
  assert.ok(aging.reasons[0].includes("400 Tage"));

  // Keine zeitlichen Angaben → unknown.
  assert.equal(checker.assess(vv1).status, "unknown");
});

/* -------------------------------- Ranker --------------------------------- */

test("Ranker sortiert nach Relevanz, Quellenart und Referenz", () => {
  const { references } = resolveLegalContext(fixtureData());
  const ranked = rankLegalReferences(references);
  assert.deepEqual(
    ranked.map((r) => r.sectionId),
    ["sec-53", "sec-vv1", "sec-orphan"],
  );
  // Stabil: gleiche Eingabe → gleiche Ausgabe.
  assert.deepEqual(
    rankLegalReferences([...references].reverse()).map((r) => r.sectionId),
    ["sec-53", "sec-vv1", "sec-orphan"],
  );
});

/* ------------------------------- Explainer -------------------------------- */

test("Explainer begründet Anzeige ausschließlich aus vorhandenen Daten", () => {
  const explainer = new LegalContextExplainer();
  const { references } = resolveLegalContext(fixtureData());
  const s53 = references.find((r) => r.sectionId === "sec-53")!;
  const text = explainer.explainReference(s53, "Beleidigung im Unterricht", "current", []);
  assert.ok(text.includes("Beleidigung im Unterricht"));
  assert.ok(text.includes("zentrale Rechtsgrundlage"));
  assert.ok(text.includes("Tragende Norm bei Ordnungsmaßnahmen."));
  assert.ok(text.includes("aktuell"));

  const provenance = explainer.explainProvenance({ kind: "none" });
  assert.ok(provenance.includes("keine fallspezifischen Rechtsgrundlagen"));
});

/* -------------------------------- Service --------------------------------- */

test("Service baut persistierbares Ergebnis mit Hash, Rang und Issues", async () => {
  const events = new LegalContextEventBus();
  const service = makeService(events);
  const result = await service.resolveForCase("case-1");

  assert.equal(result.schemaVersion, LEGAL_CONTEXT_SCHEMA_VERSION);
  assert.deepEqual(result.source, {
    kind: "practice_case",
    caseId: "case-1",
    caseTitle: "Beleidigung im Unterricht",
    caseVersion: "2026-07-15T10:00:00.000Z",
  });
  assert.deepEqual(
    result.references.map((r) => r.sectionId),
    ["sec-53", "sec-vv1", "sec-orphan"],
  );
  assert.equal(result.references[0].freshness, "current");
  assert.equal(result.references[1].freshness, "unknown");
  assert.ok(result.issues.some((i) => i.type === "missing_section"));
  assert.ok(result.issues.some((i) => i.type === "unverified_source" && i.sectionId === "sec-vv1"));
  assert.ok(result.inputHash.length > 0);
  assert.equal(result.resolvedAt, NOW.toISOString());

  // JSON-Roundtrip (Navigator-Kontext-Persistenz).
  const roundtrip = JSON.parse(JSON.stringify(result)) as LegalContextResult;
  assert.deepEqual(roundtrip, result);

  // Ereignis wurde emittiert.
  assert.ok(events.getEvents().some((e) => e.name === "LegalContextResolved"));
});

test("Service: Hash reagiert auf Änderungen an Fall, Abschnitt und Quelle", async () => {
  const base = await makeService().resolveForCase("case-1");

  const changedCase = new LegalContextService({
    fetcher: async () => fixtureData({ caseRow: { ...CASE_ROW, updated_at: "2026-07-19T00:00:00.000Z" } }),
    now,
  });
  const changedSection = new LegalContextService({
    fetcher: async () =>
      fixtureData({ sections: [{ ...SECTION_53, updated_at: "2026-07-19T00:00:00.000Z" }, SECTION_VV1, SECTION_ORPHAN] }),
    now,
  });
  const changedSource = new LegalContextService({
    fetcher: async () =>
      fixtureData({ sources: [{ ...SOURCE_LAW, version_label: "Stand 2027" }, SOURCE_VV] }),
    now,
  });

  for (const variant of [changedCase, changedSection, changedSource]) {
    const fresh = await variant.resolveForCase("case-1");
    assert.notEqual(fresh.inputHash, base.inputHash);
    assert.equal(variant.isStale(base, fresh), true);
  }

  const identical = await makeService().resolveForCase("case-1");
  assert.equal(makeService().isStale(base, identical), false);
});

test("Service: generischer Fallback erfindet keine Rechtsgrundlagen", () => {
  const generic = makeService().resolveGeneric();
  assert.equal(generic.source.kind, "none");
  assert.equal(generic.references.length, 0);
  assert.equal(generic.issues.length, 0);
});

test("Service: fehlender Praxisfall führt zu kontrolliertem Fehler", async () => {
  const service = new LegalContextService({
    fetcher: async () => fixtureData({ caseRow: null }),
    now,
  });
  await assert.rejects(() => service.resolveForCase("case-x"), LegalContextError);
});

test("Service: restore validiert gespeicherte Einträge", async () => {
  const service = makeService();
  const result = await service.resolveForCase("case-1");

  assert.deepEqual(service.restore(JSON.parse(JSON.stringify(result))).entry, result);
  assert.equal(service.restore(undefined).entry, null);
  assert.equal(service.restore(undefined).error, null);
  assert.ok(service.restore("kaputt").error);
  assert.ok(service.restore({ schemaVersion: 999 }).error);
});
