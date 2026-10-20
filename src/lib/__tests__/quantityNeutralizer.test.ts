import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptRewrite, findTargets, neutralizeQuantities } from "../quantityNeutralizer";

const U = new Set(["24|Stunde", "25|Prozent", "30|Prozent", "3|Tag"]);

test("findTargets zerschneidet Sätze nicht an z. B.", () => {
  const t = findTargets({ faq: [{ q: "Zuschlag?", a: "Möglich ist ein Zeitzuschlag (z.B. 25%, 30%) nach Einzelfall." }] }, U);
  assert.equal(t.length, 1);
  assert.match(t[0].sentence, /^Möglich ist/);
});

test("acceptRewrite: kurze Einträge dürfen schrumpfen, unbelegte Zahl muss weg", () => {
  assert.equal(acceptRewrite("sofort (innerhalb von 24 Stunden)", "unverzüglich", U), true);
  assert.equal(acceptRewrite("sofort (innerhalb von 24 Stunden)", "binnen 24 Stunden", U), false);
  assert.equal(acceptRewrite("Die Eltern erhalten eine Frist von 3 Tagen für die Stellungnahme zur geplanten Maßnahme.", "Frist.", U), false);
});

test("neutralizeQuantities ersetzt im Entscheidungsbaum und lässt Struktur stehen", async () => {
  const row = { decision_tree: { results: { a: { urgency: "sofort (innerhalb von 24 Stunden)", title: "Löschen" } } } };
  const res = await neutralizeQuantities(row, U, async (items) => items.map((x) => ({ i: x.i, text: "unverzüglich" })));
  assert.equal(res.replaced, 1);
  assert.deepEqual(res.patch.decision_tree, { results: { a: { urgency: "unverzüglich", title: "Löschen" } } });
  assert.equal(row.decision_tree.results.a.urgency, "sofort (innerhalb von 24 Stunden)"); // Original unverändert
});
