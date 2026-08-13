/**
 * Regressionstest für schulgesetzNrwParser.
 *
 * Grund: Beim ersten echten Testimport (2026-08-13) hat der Parser
 * Bedienelemente der recht.nrw.de-Seite ("Mehr", "Paragraph ausdrucken",
 * "Paragraph Link kopieren", "Fußnoten", "Link kopiert", "Der Link zum
 * Pragraph wurde kopiert") als Rechtstext übernommen und nie die echte
 * Paragraphen-Überschrift erkannt (das Portal liefert sie nie im
 * Bindestrich-Format "§ N – Titel", sondern als eigene Zeile danach).
 * Der Fixture-Text unten ist ein wortgetreuer Auszug der echten Seite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { schulgesetzNrwParser } from "../import/parsers/schulgesetzNrwParser";
import type { LegalImportInput, LegalNode } from "../import/types";

const REAL_PAGE_EXCERPT = [
  "Inhaltsübersicht",
  "Erster Teil",
  "Allgemeine Grundlagen",
  "Erster Abschnitt",
  "Auftrag der Schule",
  "§ 1 Recht auf Bildung, Erziehung und individuelle Förderung",
  "§ 2 Bildungs- und Erziehungsauftrag der Schule",
  "Link kopiert",
  "Der Link zum Pragraph wurde kopiert",
  "§ 1",
  "Recht auf Bildung, Erziehung und individuelle Förderung",
  "Mehr",
  "Paragraph ausdrucken",
  "Paragraph Link kopieren",
  "Fußnoten",
  "§§ 1, 29, 41 geändert durch Artikel 1 des Gesetzes v. 27. Juni 2006 (GV. NRW. S. 278).",
  "(1) Jeder junge Mensch hat ohne Rücksicht auf seine wirtschaftliche Lage und Herkunft und sein Geschlecht ein Recht auf schulische Bildung, Erziehung und individuelle Förderung.",
  "(2) Die Fähigkeiten und Neigungen des jungen Menschen sowie der Wille der Eltern bestimmen seinen Bildungsweg.",
  "Link kopiert",
  "Der Link zum Pragraph wurde kopiert",
  "§ 2",
  "Bildungs- und Erziehungsauftrag der Schule",
  "Mehr",
  "Paragraph ausdrucken",
  "Paragraph Link kopieren",
  "Fußnoten",
  "(1) Die Schule unterrichtet und erzieht junge Menschen auf der Grundlage des Grundgesetzes.",
].join("\n");

function makeInput(raw: string): LegalImportInput {
  return { raw, hint: { officialUrl: "https://recht.nrw.de/lmi/owa/br_text_anzeigen?v_id=1" } };
}

function findParagraph(root: LegalNode, number: string): LegalNode | undefined {
  return root.children.find((n) => n.number === number);
}

test("entfernt Bedienelemente der Seite aus dem Rechtstext", () => {
  const doc = schulgesetzNrwParser.parse(makeInput(REAL_PAGE_EXCERPT));
  const p1 = findParagraph(doc.root, "§ 1");
  assert.ok(p1, "§ 1 sollte erkannt werden");
  const fullText = [p1!.text, ...p1!.children.map((c) => c.text)].filter(Boolean).join(" ");
  for (const noise of ["Mehr", "Paragraph ausdrucken", "Paragraph Link kopieren", "Fußnoten", "Link kopiert", "Pragraph wurde kopiert"]) {
    assert.ok(!fullText.includes(noise), `Text sollte "${noise}" nicht enthalten: ${fullText.slice(0, 120)}`);
  }
});

test("erkennt die echte Paragraphenüberschrift (eigene Zeile, kein Bindestrich)", () => {
  const doc = schulgesetzNrwParser.parse(makeInput(REAL_PAGE_EXCERPT));
  const p1 = findParagraph(doc.root, "§ 1");
  const p2 = findParagraph(doc.root, "§ 2");
  assert.equal(p1?.heading, "Recht auf Bildung, Erziehung und individuelle Förderung");
  assert.equal(p2?.heading, "Bildungs- und Erziehungsauftrag der Schule");
});

test("übernimmt die Inhaltsübersicht nicht in den Dokumenttitel", () => {
  const doc = schulgesetzNrwParser.parse(makeInput(REAL_PAGE_EXCERPT));
  assert.ok(
    !doc.root.heading?.includes("Erster Abschnitt"),
    `Dokumenttitel sollte nicht die Inhaltsübersicht enthalten: ${doc.root.heading}`,
  );
});

test("behält den echten Normtext inklusive Absätzen", () => {
  const doc = schulgesetzNrwParser.parse(makeInput(REAL_PAGE_EXCERPT));
  const p1 = findParagraph(doc.root, "§ 1");
  assert.equal(p1?.children.length, 2);
  assert.match(p1!.children[0].text ?? "", /Recht auf schulische Bildung/);
  assert.match(p1!.children[1].text ?? "", /Fähigkeiten und Neigungen/);
  // Die Änderungsfußnote bleibt als normaler Fließtext erhalten (kein Rauschen, sondern echter Inhalt).
  assert.match(p1?.text ?? "", /geändert durch Artikel 1/);
});

test("§ 2 ohne separate Änderungsfußnote bleibt unbeeinflusst", () => {
  const doc = schulgesetzNrwParser.parse(makeInput(REAL_PAGE_EXCERPT));
  const p2 = findParagraph(doc.root, "§ 2");
  assert.equal(p2?.children.length, 1);
  assert.match(p2!.children[0].text ?? "", /unterrichtet und erzieht/);
});
