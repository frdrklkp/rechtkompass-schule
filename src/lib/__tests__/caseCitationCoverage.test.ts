import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLegalCitations, extractLegalCitationsForCoverage } from "../legalCitationExtractor";
import { collectCaseText, planCitationCoverage, sectionNumberOf, VALIDATED_FIELDS, type CoverageSection } from "../caseCitationCoverage";

const keys = (cs: Array<{ lawAbbrev: string; paragraph: string }>) => cs.map((c) => `${c.lawAbbrev} ${c.paragraph}`);

test("Extraktor überspringt Satz-, Nummer- und Buchstabenangaben", () => {
  assert.deepEqual(keys(extractLegalCitations("§ 53 Abs. 3 Satz 2 SchulG NRW und Art. 6 Abs. 1 lit. e DSGVO")), [
    "SchulG NRW 53",
    "DSGVO 6",
  ]);
});

test("Abdeckungs-Extraktor erkennt zusätzliche Gesetze, die Fallseiten-Variante nicht", () => {
  const text = "§ 10 Abs. 1 Nr. 1 JArbSchG, § 2 SGB VII, § 8a SGB VIII, § 15 des Berufsbildungsgesetzes, Landesbeamtengesetz NRW § 62";
  assert.deepEqual(keys(extractLegalCitationsForCoverage(text)), ["JArbSchG 10", "SGB VII 2", "SGB VIII 8a", "BBiG 15", "LBG NRW 62"]);
  assert.deepEqual(keys(extractLegalCitations(text)), ["SGB VIII 8a"]);
});

test("sectionNumberOf liest nur das letzte Referenz-Segment", () => {
  assert.deepEqual(sectionNumberOf("Titel 27.§ 839"), { kind: "paragraph", number: "839" });
  assert.deepEqual(sectionNumberOf("Kapitel I.Art 2"), { kind: "article", number: "2" });
  assert.deepEqual(sectionNumberOf("§ 8a"), { kind: "paragraph", number: "8a" });
  assert.equal(sectionNumberOf("Eingangsformel"), null);
});

test("planCitationCoverage: nachverknüpfen, abgedeckt, mehrdeutig, fehlend", () => {
  const sec = (id: string, reference: string, title: string): CoverageSection => ({ id, reference, title });
  const citations = extractLegalCitationsForCoverage(
    "§ 43 SchulG NRW, § 42 SchulG NRW, § 1 APO-BK, § 99 JArbSchG, § 10 JArbSchG, § 3 HwO, § 1 BASS",
  );
  const r = planCitationCoverage({
    citations,
    sectionsByLaw: new Map([
      ["SchulG NRW", [sec("s42", "§ 42", "Allgemeine Rechte"), sec("s43", "§ 43", "Teilnahmepflicht")]],
      ["APO-BK", [sec("a1", "§ 1", "Berufsschule"), sec("b1", "§ 1", "Berufsfachschule")]],
      ["JArbSchG", [sec("j10", "§ 10", "Prüfungen und außerbetriebliche Ausbildungsmaßnahmen")]],
      ["HwO", null],
    ]),
    linkedSectionIds: new Set(["s42"]),
  });
  assert.deepEqual(r.toLink.map((t) => t.section.id), ["s43", "j10"]);
  assert.deepEqual(keys(r.covered), ["SchulG NRW 42"]);
  assert.deepEqual(keys(r.ambiguous.map((a) => a.citation)), ["APO-BK 1"]);
  assert.deepEqual(keys(r.sectionMissing), ["JArbSchG 99"]);
  assert.deepEqual(keys(r.lawMissing), ["HwO 3"]);
});

test("planCitationCoverage: mehrdeutige Nummer gilt als abgedeckt, wenn einer der Kandidaten verknüpft ist", () => {
  const r = planCitationCoverage({
    citations: extractLegalCitationsForCoverage("§ 1 APO-BK"),
    sectionsByLaw: new Map([["APO-BK", [{ id: "a1", reference: "§ 1", title: "X" }, { id: "b1", reference: "§ 1", title: "Y" }]]]),
    linkedSectionIds: new Set(["b1"]),
  });
  assert.equal(r.covered.length, 1);
  assert.equal(r.ambiguous.length, 0);
});

test("collectCaseText sammelt Arrays, FAQ-Objekte und optional den Entscheidungsbaum", () => {
  const row = {
    short_answer: "a",
    checklist: ["b", "c"],
    faq: [{ q: "d", a: "e" }],
    decision_tree: { results: { r1: { text: "f" } } },
  };
  assert.equal(collectCaseText(row), "a\nb\nc\nd\ne");
  assert.equal(collectCaseText(row, { includeDecisionTree: true }), "a\nb\nc\nd\ne\nf");
  assert.equal(collectCaseText(row, { fields: VALIDATED_FIELDS }), "a\nb\nc");
});
