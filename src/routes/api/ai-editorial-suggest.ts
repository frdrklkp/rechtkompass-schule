// Konsolidierte Server-Route für alle KI-Editorial-Tasks.
// Läuft ausschließlich über AIProviderFactory + AIModelRouter.
// KEINE direkten Provider-/Gateway-Aufrufe mehr in dieser Datei.
// KEINE Persistenz. Nur Vorschlagsgenerierung.

import { createFileRoute } from "@tanstack/react-router";
import {
  schemaForTask,
  TASK_CONFIG,
} from "@/services/editorial/ai/PromptTemplates";
import { runTask } from "@/services/editorial/ai/router/AIModelRouter";
import { AIError } from "@/services/editorial/ai/types";
import type { AITaskType } from "@/services/editorial/ai/types";

interface RequestBody {
  task?: AITaskType;
  case?: Record<string, unknown>;
  quality?: Record<string, unknown> | null;
  hint?: string | null;
  extra?: Record<string, unknown> | null;
}

export const Route = createFileRoute("/api/ai-editorial-suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const task = body.task;
        const caseCtx = body.case;
        if (!task || !(task in TASK_CONFIG)) {
          return new Response("task required", { status: 400 });
        }
        const validTask: AITaskType = task;
        if (!caseCtx || typeof caseCtx !== "object") {
          return new Response("case required", { status: 400 });
        }

        const cfg = TASK_CONFIG[validTask];
        const baseSchema = schemaForTask(validTask) as {
          properties?: Record<string, unknown>;
          required?: string[];
        };
        const schema = {
          type: "object",
          properties: {
            ...baseSchema.properties,
            confidence: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: baseSchema.required ?? ["value", "reason"],
        };

        const userPayload = {
          aufgabe: task,
          anweisung: cfg.instruction,
          fall_kontext: caseCtx,
          qualitaets_kontext: body.quality ?? null,
          hinweis: body.hint ?? null,
          zusatz: body.extra ?? null,
          rueckgabeformat:
            "Antworte AUSSCHLIESSLICH mit {value, reason, confidence?}. 'value' entspricht dem Feldtyp. 'reason' erklärt die Änderung in 1-2 Sätzen.",
        };

        try {
          const result = await runTask({
            task: validTask,
            request: {
              messages: [
                { role: "system", content: cfg.system },
                { role: "user", content: JSON.stringify(userPayload) },
              ],
              jsonSchema: { name: "ai_editorial_suggestion", schema },
              temperature: 0.4,
            },
          });
          const parsed = (result.json ?? {}) as {
            value?: unknown;
            reason?: string;
            confidence?: string;
          };
          return new Response(
            JSON.stringify({
              value: parsed.value ?? null,
              reason: parsed.reason ?? "",
              confidence: parsed.confidence ?? "medium",
              _meta: {
                providerId: result.meta.providerId,
                model: result.meta.model,
                latencyMs: result.meta.latencyMs,
                fromFallback: !!result.meta.fromFallback,
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          if (err instanceof AIError) {
            const status =
              err.code === "rate_limited"
                ? 429
                : err.code === "credits_exhausted"
                  ? 402
                  : err.code === "bad_request"
                    ? 400
                    : err.code === "aborted"
                      ? 499
                      : err.status ?? 502;
            return new Response(
              JSON.stringify({ error: err.userMessage, code: err.code, detail: err.detail }),
              { status, headers: { "Content-Type": "application/json" } },
            );
          }
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ error: msg }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
