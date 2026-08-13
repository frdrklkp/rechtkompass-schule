// Unit-Tests für die Provider-Plattform (Sprint 3.5.1).
// Runner-agnostisch: verwendet node:test (Node >= 18) – kann via
// `node --test src/services/editorial/ai/__tests__/*.test.ts` (nach TS
// Kompilierung) oder Vitest ausgeführt werden. Bewusst dependency-frei.

import assert from "node:assert/strict";
import test from "node:test";

import { AIModelRegistry } from "../registry/AIModelRegistry";
import { AIProviderFactory } from "../providers/AIProviderFactory";
import { runTask, getRoute, overrideRoute } from "../router/AIModelRouter";
import { AI_FLAGS, getFlag, setFlag, resetFlags } from "../runtime/featureFlags";
import {
  validateAgainstSchema,
  SchemaViolationError,
} from "../runtime/schemaValidator";
import { withRetry } from "../runtime/retry";
import {
  clearRecords,
  listRecent,
  summarize,
  estimateCostUsd,
} from "../runtime/telemetry";
import { MockProvider } from "../providers/MockProvider";

test("registry: kennt Default-Modelle", () => {
  assert.ok(AIModelRegistry.get("google/gemini-3.6-flash"));
  assert.ok(AIModelRegistry.get("mock/echo"));
  assert.equal(AIModelRegistry.list().length > 3, true);
});

test("factory: Mock-Provider immer verfügbar", () => {
  const p = AIProviderFactory.get("mock");
  assert.equal(p.id, "mock");
  assert.equal(p.supportsModel("mock/echo"), true);
});

test("factory: ohne LOVABLE_API_KEY fällt Gateway auf Mock", () => {
  const orig = process.env.LOVABLE_API_KEY;
  delete process.env.LOVABLE_API_KEY;
  AIProviderFactory.clearCache();
  const p = AIProviderFactory.get("lovable-gateway");
  assert.equal(p.id, "mock");
  if (orig) process.env.LOVABLE_API_KEY = orig;
  AIProviderFactory.clearCache();
});

test("mock provider: liefert JSON gemäß Schema", async () => {
  const mp = new MockProvider();
  const res = await mp.complete({
    model: "mock/echo",
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: JSON.stringify({ anweisung: "test" }) },
    ],
    jsonSchema: {
      name: "t",
      schema: {
        type: "object",
        properties: { value: { type: "string" }, reason: { type: "string" } },
        required: ["value", "reason"],
      },
    },
  });
  assert.ok(res.json);
  assert.equal((res.json as { value: string }).value.length > 0, true);
});

test("schemaValidator: findet fehlende Felder", () => {
  const v = validateAgainstSchema(
    { reason: "x" },
    {
      type: "object",
      properties: { value: { type: "string" }, reason: { type: "string" } },
      required: ["value", "reason"],
    },
  );
  assert.equal(v.ok, false);
  assert.equal(v.errors.length >= 1, true);
});

test("router: overrideRoute registriert Fallbacks", () => {
  const before = getRoute("improve.title");
  overrideRoute("improve.title", { fallbackModels: ["mock/echo"] });
  const after = getRoute("improve.title");
  assert.deepEqual(after.fallbackModels, ["mock/echo"]);
  overrideRoute("improve.title", { fallbackModels: before.fallbackModels });
});

test("router runTask: verwendet Mock ohne Key", async () => {
  const orig = process.env.LOVABLE_API_KEY;
  const origAnthropic = process.env.ANTHROPIC_API_KEY;
  delete process.env.LOVABLE_API_KEY;
  // AIProviderFactory fällt auch auf ANTHROPIC_API_KEY zurück (siehe
  // AIProviderFactory.ts:36,67) - ist der in der Umgebung gesetzt (z.B. für
  // echte KI-Aufrufe während der Entwicklung), wählt der Router sonst den
  // echten Anthropic-Provider statt Mock. Für "ohne Key" müssen beide
  // möglichen Schlüssel-Quellen entfernt werden (Fund 2026-08-13).
  delete process.env.ANTHROPIC_API_KEY;
  // Ohne Key liefert die Factory für das Gateway den Mock-Provider. Damit der
  // Router eine mock-fähige Route hat, wird für den Test das Mock-Modell als
  // Fallback registriert (Testdaten, keine Produktivlogik).
  const beforeRoute = getRoute("improve.title");
  overrideRoute("improve.title", { fallbackModels: ["mock/echo"] });
  AIProviderFactory.clearCache();
  clearRecords();

  const result = await runTask({
    task: "improve.title",
    request: {
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: JSON.stringify({ anweisung: "titel" }) },
      ],
      jsonSchema: {
        name: "t",
        schema: {
          type: "object",
          properties: { value: { type: "string" }, reason: { type: "string" } },
          required: ["value", "reason"],
        },
      },
    },
  });
  assert.equal(result.meta.providerId, "mock");
  const recs = listRecent();
  assert.equal(recs.length >= 1, true);
  const sum = summarize();
  assert.equal(sum.totalCalls >= 1, true);
  overrideRoute("improve.title", { fallbackModels: beforeRoute.fallbackModels });
  if (orig) process.env.LOVABLE_API_KEY = orig;
  if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
  AIProviderFactory.clearCache();
});


test("retry: wiederholt bei 429 und gibt am Ende zurück", async () => {
  let calls = 0;
  const out = await withRetry(
    async () => {
      calls++;
      if (calls < 3) {
        const e = new Error("rate") as Error & { status: number };
        e.status = 429;
        throw e;
      }
      return "ok";
    },
    { maxAttempts: 4, initialDelayMs: 1, timeoutMs: 2000 },
  );
  assert.equal(out, "ok");
  assert.equal(calls, 3);
});

test("telemetry: Kostenschätzung ist nicht negativ", () => {
  const c = estimateCostUsd("google/gemini-3.6-flash", {
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
  });
  assert.equal(c >= 0, true);
});

test("featureFlags: setFlag/getFlag round-trip", () => {
  resetFlags();
  setFlag(AI_FLAGS.ENABLE_GATEWAY, false);
  assert.equal(getFlag<boolean>(AI_FLAGS.ENABLE_GATEWAY), false);
  resetFlags();
});

test("SchemaViolationError transportiert errors + raw", () => {
  const e = new SchemaViolationError(["a", "b"], { x: 1 });
  assert.equal(e.errors.length, 2);
  assert.deepEqual(e.raw, { x: 1 });
});
