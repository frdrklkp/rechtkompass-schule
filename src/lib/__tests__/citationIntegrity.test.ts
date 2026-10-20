import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absatzStructure, parseAbsatzRef, checkAbsatzCitations, extractQuantities, checkQuantities, checkCaseIntegrity,
  type LawSectionLookup,
} from "../citationIntegrity";

// § 53 SchulG NRW so, wie er im Bestand liegt: Kopfzeile + 9 Absätze je Zeile
const SCHULG_53 = [
  "§ 53 zuletzt geändert durch Artikel 1 des Gesetzes vom 27. Mai 2025 (GV. NRW. S. 501), in Kraft getreten am 1. August 2025.",
  "Erzieherische Einwirkungen und Ordnungsmaßnahmen dienen der geordneten Unterrichts- und Erziehungsarbeit.",
  "Zu den erzieherischen Einwirkungen gehören insbesondere das erzieherische Gespräch.",
  "Ordnungsmaßnahmen sind 1. der schriftliche Verweis, 2. die Überweisung in eine parallele Klasse, 3. der vorübergehende Ausschluss vom Unterricht von einem Tag bis zu zwei Wochen.",
  "Maßnahmen nach Absatz 3 Nr. 4 und 5.",
  "Maßnahmen nach Absatz 3 Nr. 6 und 7.",
  "Über Ordnungsmaßnahmen nach Absatz 3 Nummer 1 bis 3 entscheidet die Schulleiterin oder der Schulleiter. Den Eltern ist Gelegenheit zur Stellungnahme zu geben. In dringenden Fällen kann auf vorherige Anhörungen verzichtet werden.",
  "Über Ordnungsmaßnahmen nach Absatz 3 Nr. 4 bis 7 entscheidet die Teilkonferenz.",
  "Vor der Beschlussfassung hat die Teilkonferenz Gelegenheit zur Stellungnahme zu geben.",
  "Ordnungsmaßnahmen werden den Eltern schriftlich bekannt gegeben und begründet.",
].join("\n");

const lookup: LawSectionLookup = {
  find: (law, par) => (law.startsWith("SchulG") && par === "53" ? { content: SCHULG_53, lineStructured: true } : null),
};

test("SchulG-Zeilengliederung: Kopfzeile zählt nicht als Absatz", () => {
  const st = absatzStructure(SCHULG_53, { lineStructured: true });
  assert.equal(st?.absaetze.length, 9);
  assert.match(st!.absaetze[8], /schriftlich bekannt gegeben/);
});

test("Absatzmarken (1) (2) werden erkannt, Fließtext ohne Marken nicht", () => {
  assert.equal(absatzStructure("(1) Erster Absatz. (2) Zweiter Absatz. (3) Dritter.")?.absaetze.length, 3);
  assert.equal(absatzStructure("Bevor ein Verwaltungsakt erlassen wird, ist anzuhören. Von der Anhörung kann abgesehen werden."), null);
});

test("Zeilengliederung hat Vorrang vor zufälligen (1)-Marken im Text", () => {
  const s48 = "§ 48 zuletzt geändert durch Gesetz.\nDie Leistungsbewertung soll Aufschluss geben.\nBewertet werden Kenntnisse.\nNotenstufen: 1. sehr gut (1) Die Note sehr gut soll erteilt werden, 2. gut (2) Die Note gut.";
  assert.equal(absatzStructure(s48, { lineStructured: true })?.absaetze.length, 3);
});

test("parseAbsatzRef liest Absatz und Satz", () => {
  assert.deepEqual(parseAbsatzRef("§ 120 Absatz 7 Satz 1 des Schulgesetzes NRW"), { absatz: 7, satz: 1 });
  assert.deepEqual(parseAbsatzRef("§ 53 Abs. 9 SchulG NRW"), { absatz: 9, satz: undefined });
});

test("Absatzprüfung: § 53 Abs. 9 besteht, § 53 Abs. 10 nicht", () => {
  assert.deepEqual(checkAbsatzCitations("x", "Bekanntgabe nach § 53 Abs. 9 SchulG NRW.", lookup), []);
  const f = checkAbsatzCitations("x", "Bekanntgabe nach § 53 Abs. 10 SchulG NRW.", lookup);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "absatz_fehlt");
  assert.equal(f[0].vorhanden, 9);
});

test("Absatzprüfung rät nicht, wenn die Norm unbekannt ist", () => {
  assert.deepEqual(checkAbsatzCitations("x", "§ 28 Abs. 9 VwVfG NRW", lookup), []);
});

test("amtliche Absatzzahl aus den Metadaten greift auch ohne Gliederung im Text", () => {
  const lk: LawSectionLookup = { find: (law, par) => (law === "GG" && par === "34" ? { content: "Verletzt jemand in Ausübung eines Amtes ...", lineStructured: false, absatzCount: 1 } : null) };
  assert.equal(checkAbsatzCitations("x", "Art. 34 Abs. 2 GG", lk)[0]?.vorhanden, 1);
  assert.deepEqual(checkAbsatzCitations("x", "Art. 34 GG", lk), []);
});

test("Satzprüfung meldet nur deutliche Überschreitung", () => {
  assert.deepEqual(checkAbsatzCitations("x", "§ 53 Abs. 6 Satz 3 SchulG NRW", lookup), []);
  assert.equal(checkAbsatzCitations("x", "§ 53 Abs. 6 Satz 9 SchulG NRW", lookup)[0]?.kind, "satz_fehlt");
});

test("Zahlen: Wörter und Ziffern, Bereiche, Einheiten", () => {
  const q = extractQuantities("innerhalb von drei Tagen, 15 Minuten vor Beginn, 2 bis 3 Wochen, bis zu 20 Prozent");
  assert.deepEqual(q.map((x) => `${x.value} ${x.unit}`), ["3 Tag", "15 Minute", "2 Woche", "3 Woche", "20 Prozent"]);
});

test("Zahlen: Paragrafen, Daten und Aufzählungen sind keine Fristen", () => {
  assert.deepEqual(extractQuantities("§ 53 Abs. 3 Nr. 3 SchulG, Erlass vom 3. Januar 2020, Seite 12"), []);
  assert.deepEqual(extractQuantities("an einem Tag"), []);
});

test("Zahlen: belegte Frist ist ok, unbelegte wird gemeldet", () => {
  const src = ["Die Anzeige ist binnen drei Tagen zu erstatten."];
  assert.deepEqual(checkQuantities("x", "Unfallanzeige innerhalb von 3 Tagen.", src), []);
  const f = checkQuantities("x", "Das Attest ist innerhalb von 5 Tagen vorzulegen.", src);
  assert.equal(f.length, 1);
  assert.equal(f[0].raw, "5 Tagen");
});

test("Gesamtprüfung über Felder inkl. FAQ", () => {
  const r = checkCaseIntegrity(
    { short_answer: "Nach § 53 Abs. 8 SchulG NRW wird schriftlich bekannt gegeben.", faq: [{ q: "Frist?", a: "Eine Frist von 3 Tagen ist die absolute Grenze." }] },
    lookup,
    [SCHULG_53],
  );
  assert.equal(r.absatz.length, 0); // Abs. 8 existiert - inhaltlich falsch, aber vorhanden: das prüft die Inhaltsprüfung
  assert.equal(r.zahlen.length, 1);
  assert.equal(r.zahlen[0].field, "faq");
});
