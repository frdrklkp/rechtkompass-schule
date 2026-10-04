import { test } from "node:test";
import assert from "node:assert/strict";
import { readCopilotResponse, stageLabel } from "../progressStream";
import type { CopilotProgressEvent } from "../types";

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

test("readCopilotResponse liefert Phasen in Reihenfolge und zuletzt das Ergebnis - auch bei zerstückelten Chunks", async () => {
  const events: CopilotProgressEvent[] = [];
  const res = sseResponse([
    'event: progress\ndata: {"stage":"retrieval_done","hits":12,"ms":1825}\n\nevent: progress\ndata: {"stage":"gen',
    'erating"}\n\nevent: progress\ndata: {"stage":"checking"}\n\n',
    'event: result\ndata: {"result":{"sessionId":"s1","answer":{"answered":true}}}\n\n',
  ]);
  const payload = await readCopilotResponse(res, (e) => events.push(e));
  assert.deepEqual(events.map((e) => e.stage), ["retrieval_done", "generating", "checking"]);
  assert.equal((payload.result as { sessionId?: string } | null)?.sessionId, "s1");
});

test("readCopilotResponse fällt auf JSON zurück, wenn kein Ereignisstrom kommt", async () => {
  const res = new Response(JSON.stringify({ result: null, error: "Fehler X" }), { headers: { "Content-Type": "application/json" } });
  const payload = await readCopilotResponse(res, () => { throw new Error("darf nicht aufgerufen werden"); });
  assert.equal(payload.result, null);
  assert.equal(payload.error, "Fehler X");
});

test("readCopilotResponse meldet fehlendes Ergebnis statt zu hängen", async () => {
  const payload = await readCopilotResponse(sseResponse(['event: progress\ndata: {"stage":"generating"}\n\n']), () => {});
  assert.equal(payload.result, null);
  assert.match(payload.error ?? "", /Keine Antwort/);
});

test("stageLabel nennt Trefferzahl und Dauer, nie Antworttext", () => {
  assert.equal(stageLabel(null), "Rechtsgrundlagen werden gesucht…");
  assert.equal(stageLabel({ stage: "retrieval_done", hits: 1, ms: 840 }), "1 Rechtsgrundlage gefunden (0.8 s) · Antwort wird formuliert…");
  assert.match(stageLabel({ stage: "checking" }), /geprüft/);
});
