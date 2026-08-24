/**
 * Regressionstests für den Legal Export Release Blocker (Nutzer-Regelwerk
 * 2026-08-21, Regel 27) - direkt gegen computeReleaseGate(), ohne KI-Aufruf.
 * Die Testnummern entsprechen den 14 im Nutzerdokument vorgegebenen Fällen.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  checkNegativeStatementPhrasing,
  computeReleaseGate,
  findTriggerWords,
  type ClassifiedClaim,
} from "../legalClaimGate";

function claim(overrides: Partial<ClassifiedClaim> & Pick<ClassifiedClaim, "classification">): ClassifiedClaim {
  return {
    id: overrides.id ?? "c1",
    section: overrides.section ?? "recommendation",
    text: overrides.text ?? "Testaussage",
    isCentral: overrides.isCentral ?? false,
    classification: overrides.classification,
    flagType: overrides.flagType,
    problem: overrides.problem,
    sourceId: overrides.sourceId ?? null,
  };
}

test("TEST 1: 'muss schriftlich' ohne Schriftformquelle, zentral => BLOCK (rot)", () => {
  const res = computeReleaseGate([
    claim({ classification: "UNSUPPORTED", isCentral: true, text: "Die Bestellung muss schriftlich erfolgen.", flagType: "LEGAL_UNSUPPORTED_WRITING_REQUIREMENT" }),
  ]);
  assert.notEqual(res.color, "gruen");
  assert.equal(res.color, "rot");
  assert.ok(res.blockers.length > 0);
});

test("TEST 2: 'nicht zulässig' ohne Verbotsquelle, nicht-zentral => BLOCK (mind. gelb)", () => {
  const res = computeReleaseGate([
    claim({ classification: "UNSUPPORTED", isCentral: false, text: "Eine Fachlehrkraft darf nicht Vorsitz übernehmen.", flagType: "LEGAL_UNSUPPORTED_EXCLUSION" }),
  ]);
  assert.notEqual(res.color, "gruen");
});

test("TEST 3: 'wird angefochten' ohne Rechtsfolgenquelle, zentral => BLOCK (rot)", () => {
  const res = computeReleaseGate([
    claim({ classification: "UNSUPPORTED", isCentral: true, text: "Bei fehlender Dokumentation wird das Verfahren angefochten.", flagType: "LEGAL_UNSUPPORTED_LEGAL_CONSEQUENCE" }),
  ]);
  assert.equal(res.color, "rot");
});

test("TEST 4: Quelle schweigt zur Fachzugehörigkeit => präzise statt pauschale Negation", () => {
  const overbroad = checkNegativeStatementPhrasing("Es existiert keine Regelung zur Fachzugehörigkeit.");
  assert.equal(overbroad.overbroad, true);
  const scoped = checkNegativeStatementPhrasing("§ 12 Abs. 4 APO-BK enthält hierzu keine ausdrückliche Regelung.");
  assert.equal(scoped.overbroad, false);
});

test("TEST 5: Befangenheit aus Fachfremdheit abgeleitet => BLOCK/OPEN", () => {
  const res = computeReleaseGate([
    claim({ classification: "UNSUPPORTED", isCentral: false, text: "§ 12 APO-BK verlangt keine Befangenheitsprüfung.", flagType: "LEGAL_OVERBROAD_BIAS_CLAIM" }),
  ]);
  assert.notEqual(res.color, "gruen");
});

test("TEST 6: organisatorische Empfehlung ist kein Blocker und nicht DIRECT", () => {
  const res = computeReleaseGate([
    claim({ classification: "ORGANIZATIONAL", section: "recommendation", isCentral: false, text: "Eine schriftliche Dokumentation ist empfehlenswert." }),
  ]);
  assert.equal(res.color, "gruen");
});

test("TEST 7: Normclaim exakt durch Absatz gedeckt => DIRECT, GRÜN möglich", () => {
  const res = computeReleaseGate([
    claim({ classification: "DIRECT", section: "legal_vorgegeben", isCentral: true, text: "Die Schulleitung übernimmt den Vorsitz oder bestellt eine Vertretung.", sourceId: "sec-1" }),
  ]);
  assert.equal(res.color, "gruen");
});

test("TEST 8: DERIVED Claim im Abschnitt 'Rechtlich vorgegeben' => BLOCK", () => {
  const res = computeReleaseGate([
    claim({ classification: "DERIVED", section: "legal_vorgegeben", isCentral: true, text: "Die Gesamtverantwortung verbleibt stets bei der Schulleitung." }),
  ]);
  assert.notEqual(res.color, "gruen");
  assert.ok(res.flags.some((f) => f.flagType === "LEGAL_STRUCTURAL_MISPLACEMENT"));
});

test("TEST 9: UNSUPPORTED Claim nur in Checkliste => trotzdem BLOCK", () => {
  const res = computeReleaseGate([
    claim({ classification: "UNSUPPORTED", section: "checklist", isCentral: false, text: "Schriftliche Bestellung abheften." }),
  ]);
  assert.notEqual(res.color, "gruen");
});

test("TEST 10: UNSUPPORTED Claim nur in Kurzfassung => trotzdem BLOCK", () => {
  const res = computeReleaseGate([
    claim({ classification: "UNSUPPORTED", section: "short_answer", isCentral: false, text: "Die Bestellung muss zwingend schriftlich erfolgen." }),
  ]);
  assert.notEqual(res.color, "gruen");
});

test("TEST 11: Quelle widerspricht Claim => CONFLICT/BLOCK (rot, zentral)", () => {
  const res = computeReleaseGate([
    claim({ classification: "CONFLICT", section: "legal_einordnung", isCentral: true, text: "Schriftliche Bestellung ist zwingend.", flagType: "LEGAL_SOURCE_CONFLICT" }),
  ]);
  assert.equal(res.color, "rot");
});

test("TEST 12: zentrale OPEN-Rechtsfrage => kein GRÜN (rot)", () => {
  const res = computeReleaseGate([
    claim({ classification: "OPEN", isCentral: true, text: "Wer den Vorsitz bei Verhinderung übernimmt, ist unklar." }),
  ]);
  assert.notEqual(res.color, "gruen");
  assert.equal(res.color, "rot");
});

test("TEST 13: nur Nebenfrage OPEN, Kern sicher => GELB möglich", () => {
  const res = computeReleaseGate([
    claim({ id: "core", classification: "DIRECT", section: "legal_vorgegeben", isCentral: true, text: "Kernaussage." }),
    claim({ id: "side", classification: "OPEN", section: "documentation", isCentral: false, text: "Nebenfrage zur Dokumentationsform." }),
  ]);
  assert.equal(res.color, "gelb");
});

test("TEST 14: vollständig sauberer Fall => GRÜN möglich", () => {
  const res = computeReleaseGate([
    claim({ id: "a", classification: "DIRECT", section: "legal_vorgegeben", isCentral: true, text: "Kernnorm greift unmittelbar." }),
    claim({ id: "b", classification: "DERIVED", section: "legal_einordnung", isCentral: false, text: "Daraus folgt für diesen Fall..." }),
    claim({ id: "c", classification: "ORGANIZATIONAL", section: "recommendation", isCentral: false, text: "Dokumentation ist sinnvoll." }),
  ]);
  assert.equal(res.color, "gruen");
  assert.equal(res.blockers.length, 0);
});

test("Trigger-Wortliste erkennt zentrale Begriffe aus Regel 2", () => {
  assert.deepEqual(findTriggerWords("Die Bestellung muss schriftlich erfolgen, spätestens zwei Wochen vorher."), ["muss", "schriftlich", "spätestens"]);
  assert.deepEqual(findTriggerWords("Ein neutraler Satz ohne Rechtscharakter."), []);
});

test("Mehrere Blocker in derselben Prüfung führen weiterhin nur zu einem finalen Status", () => {
  const res = computeReleaseGate([
    claim({ id: "a", classification: "UNSUPPORTED", isCentral: true, text: "Zentral unbelegt." }),
    claim({ id: "b", classification: "UNSUPPORTED", isCentral: false, text: "Nebensächlich unbelegt." }),
    claim({ id: "c", classification: "OPEN", isCentral: false, text: "Nebenfrage offen." }),
  ]);
  assert.equal(res.color, "rot");
  assert.equal(res.blockers.length, 2);
});
