import { test } from "node:test";
import assert from "node:assert/strict";
import { completeWithValidation, CompletionValidationError, unwrapSingleWrapper } from "../completionGuard";

const schema = {
  type: "object",
  properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "array", items: { type: "string" } } },
  required: ["a", "b", "c"],
};

test("unwrapSingleWrapper hebt eine einzelne Hülle (Objekt oder JSON-String) an", () => {
  assert.deepEqual(unwrapSingleWrapper({ revision: { a: "x", b: "y", c: [] } }, schema), { a: "x", b: "y", c: [] });
  assert.deepEqual(unwrapSingleWrapper({ revision: JSON.stringify({ a: "x", b: "y" }) }, schema), { a: "x", b: "y" });
});

test("unwrapSingleWrapper lässt gültige, mehrdeutige oder fremde Antworten unverändert", () => {
  const ok = { a: "x", b: "y", c: [] };
  assert.equal(unwrapSingleWrapper(ok, schema), ok);
  const two = { p: { a: "1", b: "2" }, q: { a: "3", b: "4" } };
  assert.equal(unwrapSingleWrapper(two, schema), two);
  const foreign = { other: { z: 1 } };
  assert.equal(unwrapSingleWrapper(foreign, schema), foreign);
});

test("completeWithValidation repariert die Hülle und meldet sonst die erhaltenen Felder", async () => {
  const fixed = await completeWithValidation(async () => ({ legal_case_revision: { a: "x", b: "y", c: ["z"] } }), schema);
  assert.deepEqual(fixed, { a: "x", b: "y", c: ["z"] });
  await assert.rejects(
    completeWithValidation(async () => ({ foo: 1 }), schema, 1),
    (e: unknown) => e instanceof CompletionValidationError && e.errors.some((x) => x.includes("erhaltene Felder: [foo]")),
  );
});
