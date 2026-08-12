// Deterministischer Mock-Provider. Wird verwendet, wenn kein API-Key
// vorhanden ist oder Feature Flag ENABLE_GATEWAY=false.
// Bildet ausschließlich das Interface ab – kein LLM.

import { SYSTEM_BASE } from "../PromptTemplates";
import { AIModelRegistry } from "../registry/AIModelRegistry";
import type {
  AICompletionRequest,
  AICompletionResult,
  AIHealthReport,
  AIProvider,
  AIProviderCapability,
  AIStreamChunk,
} from "./types";

const CAPS: ReadonlySet<AIProviderCapability> = new Set([
  "chat",
  "structured-output",
  "streaming",
]);

function extractUserJson(req: AICompletionRequest): Record<string, unknown> | null {
  const user = req.messages.find((m) => m.role === "user");
  if (!user) return null;
  try {
    return JSON.parse(user.content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Erzeugt eine "vernünftig aussehende" Fake-Antwort passend zum
 * angeforderten Schema. Der Wert ist nicht redaktionell brauchbar, aber
 * für Tests und Preview ohne Key ausreichend.
 */
function synthValue(req: AICompletionRequest): unknown {
  const schema = req.jsonSchema?.schema as
    | { properties?: { value?: { type?: string; items?: { type?: string; properties?: Record<string, unknown> } } } }
    | undefined;
  const valueSchema = schema?.properties?.value;
  const t = valueSchema?.type ?? "string";
  if (t === "array") {
    const item = valueSchema?.items;
    if (item?.type === "object") {
      return [
        { q: "Beispielfrage 1?", a: "Beispielantwort 1." },
        { q: "Beispielfrage 2?", a: "Beispielantwort 2." },
      ];
    }
    return ["Beispielpunkt 1", "Beispielpunkt 2", "Beispielpunkt 3"];
  }
  if (t === "object") {
    return {
      positives: ["Struktur vorhanden"],
      risks: ["Rechtliche Einordnung dünn"],
      improvements: ["Empfehlung präzisieren"],
      recommendations: ["Vor Review überarbeiten"],
    };
  }
  const ctx = extractUserJson(req) as { anweisung?: string } | null;
  return `MOCK: ${ctx?.anweisung ?? "Vorschlag"} – deterministische Antwort ohne LLM.`;
}

export class MockProvider implements AIProvider {
  readonly id = "mock" as const;
  readonly capabilities = CAPS;

  supportsModel(model: string): boolean {
    const desc = AIModelRegistry.get(model);
    if (!desc) return false;
    return desc.providers.includes("mock") || desc.id === "mock/echo";
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    // Systemprompt-Sanity, damit ein leerer Aufruf im Panel offensichtlich wird.
    const hasSystem = req.messages.some((m) => m.role === "system" && m.content.includes(SYSTEM_BASE.slice(0, 20)));
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 40));
    const value = synthValue(req);
    const payload = {
      value,
      reason: hasSystem
        ? "Mock-Provider: deterministischer Vorschlag (kein LLM-Aufruf)."
        : "Mock-Provider: Antwort ohne Systemprompt-Check.",
      confidence: "medium",
    };
    const content = JSON.stringify(payload);
    return {
      content,
      json: payload,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      meta: {
        providerId: this.id,
        model: req.model,
        latencyMs: Date.now() - start,
      },
    };
  }

  async *stream(req: AICompletionRequest): AsyncIterable<AIStreamChunk> {
    const res = await this.complete(req);
    yield { delta: res.content, done: true, usage: res.usage };
  }

  async healthCheck(): Promise<AIHealthReport> {
    return {
      providerId: this.id,
      ok: true,
      latencyMs: 0,
      detail: "Mock provider always healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}
