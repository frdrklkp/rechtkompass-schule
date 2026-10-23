import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSelfDeletion, sameEmail, OWNED_TABLES } from "../server/myData";

test("Lehrkraft mit exakt bestätigter Adresse darf löschen (Groß-/Kleinschreibung egal)", () => {
    assert.deepEqual(checkSelfDeletion("teacher", " Max.Muster@Schule.de ", "max.muster@schule.de"), { ok: true });
    assert.deepEqual(checkSelfDeletion(null, "a@b.de", "a@b.de"), { ok: true });
});
test("falsche oder fehlende Bestätigung wird abgelehnt", () => {
    assert.equal(checkSelfDeletion("teacher", "andere@schule.de", "a@b.de").ok, false);
    assert.equal(checkSelfDeletion("teacher", "", "a@b.de").ok, false);
    assert.equal(checkSelfDeletion("teacher", "", undefined).ok, false);
});
test("Redaktions- und Administrationskonten löschen sich nicht selbst", () => {
    for (const role of ["editor", "reviewer", "admin"]) assert.equal(checkSelfDeletion(role, "a@b.de", "a@b.de").ok, false);
});
test("E-Mail-Vergleich", () => {
    assert.equal(sameEmail("A@B.de", "a@b.DE "), true);
    assert.equal(sameEmail("a@b.de", null), false);
});
test("alle Tabellen mit Kontobezug aus dem Schul-Löschskript sind abgedeckt", () => {
    const t = OWNED_TABLES.map((x) => x.table);
    for (const need of ["copilot_conversations", "workflow_execution_sessions", "case_documents", "case_files", "pilot_survey_responses", "favorites"]) assert.ok(t.includes(need as never), need);
});
