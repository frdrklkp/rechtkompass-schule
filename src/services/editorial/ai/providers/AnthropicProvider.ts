// Nativer Provider gegen die Anthropic Messages API. Implementiert
// dasselbe AIProvider-Interface wie GatewayProvider/MockProvider – der
// Rest der Codebasis (Router, AnswerGenerator, …) merkt vom Wechsel nichts.

import { AIError } from "../types";
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

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Registry-IDs ("anthropic/claude-sonnet-5") -> tatsächliche API-Modell-IDs.
// Getrennt gehalten, damit sich unser interner Bezeichner nie zufällig mit
// einer Anthropic-Modellversion verhakt.
const MODEL_MAP: Record<string, string> = {
  "anthropic/claude-opus-5": "claude-opus-5",
  "anthropic/claude-sonnet-5": "claude-sonnet-5",
  "anthropic/claude-haiku-4-5": "claude-haiku-4-5-20251001",
};

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  input?: unknown;
}

const STRUCTURED_TOOL_NAME = "emit_result";

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic-native" as const;
  readonly capabilities = CAPS;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: AnthropicProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? ANTHROPIC_URL;
  }

  supportsModel(model: string): boolean {
    const desc = AIModelRegistry.get(model);
    return !!desc && desc.providers.includes(this.id);
  }

  private resolveModel(model: string): string {
    return MODEL_MAP[model] ?? model;
  }

  private buildBody(req: AICompletionRequest) {
    const system = req.messages.find((m) => m.role === "system")?.content;
    const messages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: this.resolveModel(req.model),
      max_tokens: req.maxTokens ?? 4096,
      messages,
    };
    if (system) body.system = system;
    if (req.temperature !== undefined) body.temperature = req.temperature;

    // Claude kennt kein response_format: json_schema wie OpenAI-kompatible
    // APIs. Strukturierte Ausgabe erzwingen wir stattdessen über ein
    // einzelnes Pflicht-Tool, dessen Eingabeschema exakt dem angeforderten
    // JSON-Schema entspricht (Standardmuster für Claude Structured Output).
    if (req.jsonSchema) {
      body.tools = [
        {
          name: STRUCTURED_TOOL_NAME,
          description: `Liefert das Ergebnis für ${req.jsonSchema.name}.`,
          input_schema: req.jsonSchema.schema,
        },
      ];
      body.tool_choice = { type: "tool", name: STRUCTURED_TOOL_NAME };
    }
    return body;
  }

  private async request(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    try {
      return await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIError({
        code: msg.includes("abort") ? "aborted" : "network",
        userMessage: "Netzwerkfehler bei Anthropic.",
        detail: msg,
      });
    }
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const started = Date.now();
    const res = await this.request(this.buildBody(req), req.signal);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new AIError({
          code: "rate_limited",
          status: 429,
          userMessage: "Rate-Limit bei Anthropic erreicht. Bitte kurz warten.",
          detail: text,
        });
      }
      if (res.status === 401 || res.status === 403) {
        throw new AIError({
          code: "bad_request",
          status: res.status,
          userMessage: "Anthropic-API-Key ungültig oder fehlt.",
          detail: text,
        });
      }
      if (res.status === 400) {
        throw new AIError({
          code: "bad_request",
          status: 400,
          userMessage: "Ungültige Anfrage an Anthropic.",
          detail: text,
        });
      }
      throw new AIError({
        code: res.status >= 500 ? "server_error" : "bad_request",
        status: res.status,
        userMessage: `Anthropic antwortete mit Status ${res.status}.`,
        detail: text,
      });
    }

    const raw = (await res.json().catch(() => null)) as {
      content?: AnthropicContentBlock[];
      usage?: { input_tokens?: number; output_tokens?: number };
    } | null;

    const blocks = raw?.content ?? [];
    let content = "";
    let json: unknown = undefined;

    if (req.jsonSchema) {
      const toolBlock = blocks.find((b) => b.type === "tool_use");
      json = toolBlock?.input;
      content = json !== undefined ? JSON.stringify(json) : "";
      if (json === undefined) {
        throw new AIError({
          code: "invalid_response",
          userMessage: "Anthropic hat keine strukturierte Antwort geliefert.",
          detail: JSON.stringify(blocks).slice(0, 400),
        });
      }
    } else {
      content = blocks
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("");
    }

    const promptTokens = raw?.usage?.input_tokens ?? 0;
    const completionTokens = raw?.usage?.output_tokens ?? 0;

    return {
      content,
      json,
      usage: raw?.usage
        ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
        : undefined,
      meta: {
        providerId: this.id,
        model: req.model,
        latencyMs: Date.now() - started,
      },
    };
  }

  async *stream(req: AICompletionRequest): AsyncIterable<AIStreamChunk> {
    // Kein Streaming-Pfad in der UI verdrahtet (siehe GatewayProvider) –
    // Interface-konformer Fallback auf complete().
    const res = await this.complete(req);
    yield { delta: res.content, done: true, usage: res.usage };
  }

  async healthCheck(signal?: AbortSignal): Promise<AIHealthReport> {
    const t0 = Date.now();
    try {
      const res = await this.request(
        {
          model: MODEL_MAP["anthropic/claude-haiku-4-5"],
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        },
        signal,
      );
      return {
        providerId: this.id,
        ok: res.ok,
        latencyMs: Date.now() - t0,
        detail: `HTTP ${res.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        providerId: this.id,
        ok: false,
        latencyMs: Date.now() - t0,
        detail: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      };
    }
  }
}
