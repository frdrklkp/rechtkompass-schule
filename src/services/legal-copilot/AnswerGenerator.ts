/**
 * Ruft den AI-Provider mit dem gebauten Prompt auf und parst dessen JSON-Antwort.
 * Kein LLM-Wissen wird zugelassen – die Regeln stehen im System-Prompt.
 */
import { AIProviderFactory } from "@/services/editorial/ai/providers/AIProviderFactory";
import type { AICompletionResult } from "@/services/editorial/ai/providers/types";
import { CopilotError } from "./errors";
import type { BuiltPrompt } from "./PromptBuilder";
import type { RawLlmAnswer } from "./AnswerFormatter";

export interface GeneratedAnswer {
  raw: RawLlmAnswer;
  usage: AICompletionResult["usage"];
  meta: AICompletionResult["meta"];
  latencyMs: number;
  llmConfidence: number;
}

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answered: { type: "boolean" },
    reason: { type: ["string", "null"] },
    sections: {
      type: "object",
      additionalProperties: false,
      properties: {
        kurzantwort: { type: "string" },
        einordnung: { type: "string" },
        empfohleneHandlung: { type: "array", items: { type: "string" } },
        begruendung: { type: "string" },
        hinweise: { type: "array", items: { type: "string" } },
        unsicherheiten: { type: "array", items: { type: "string" } },
        typischeFehler: { type: "array", items: { type: "string" } },
        naechsteSchritte: { type: "array", items: { type: "string" } },
      },
      required: [
        "kurzantwort", "einordnung", "empfohleneHandlung", "begruendung",
        "hinweise", "unsicherheiten", "typischeFehler", "naechsteSchritte",
      ],
    },
    citationRefs: { type: "array", items: { type: "string" } },
    checklist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          role: { type: ["string", "null"] },
        },
        required: ["label"],
      },
    },
    followUps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          question: { type: "string" },
          hint: { type: ["string", "null"] },
        },
        required: ["code", "question"],
      },
    },
  },
  required: ["answered"],
} as const;

function tryParseJson(text: string): RawLlmAnswer {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as RawLlmAnswer;
  } catch {
    // Versuche das erste JSON-Objekt zu finden
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)) as RawLlmAnswer; } catch { /* ignore */ }
    }
    throw new CopilotError("answer_invalid", "Antwort ist kein valides JSON.");
  }
}

export const AnswerGenerator = {
  async generate(prompt: BuiltPrompt, opts: { forceMock?: boolean; model?: string; signal?: AbortSignal } = {}): Promise<GeneratedAnswer> {
    const providerId = opts.forceMock ? "mock" : "anthropic-native";
    const provider = AIProviderFactory.get(providerId);
    const model = opts.model ?? "anthropic/claude-haiku-4-5";
    const started = Date.now();
    try {
      const res = await provider.complete({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0,
        maxTokens: 2000,
        jsonSchema: { name: "grounded_copilot_answer", schema: ANSWER_SCHEMA as unknown as Record<string, unknown> },
        signal: opts.signal,
        taskId: "legal-copilot-answer",
      });
      const latencyMs = Date.now() - started;
      const raw = (res.json as RawLlmAnswer | undefined) ?? tryParseJson(res.content);
      return {
        raw,
        usage: res.usage,
        meta: res.meta,
        latencyMs,
        llmConfidence: raw.answered ? 0.75 : 0.3,
      };
    } catch (err) {
      if (err instanceof CopilotError) throw err;
      throw new CopilotError("llm_failed", err instanceof Error ? err.message : "LLM-Aufruf fehlgeschlagen.", err);
    }
  },
};
