// Standardimplementierung des AIProvider gegen den Lovable AI Gateway.
// Dies ist die Default-Implementierung, KEINE Architekturvorgabe. Die
// gesamte übrige Codebasis referenziert ausschließlich AIProvider.
//
// Ein späterer nativer Provider (OpenAIProvider, AnthropicProvider,
// OllamaProvider, AzureOpenAIProvider, …) implementiert dasselbe Interface
// und wird via AIProviderFactory registriert – ohne Refactoring.

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

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Siehe AnthropicProvider.ts DEFAULT_TIMEOUT_MS - dieselbe Begründung
// (Fund: Code-Audit 12.08.2026, keine Timeouts auf KI-Aufrufen).
const DEFAULT_TIMEOUT_MS = 120_000;

export interface GatewayProviderOptions {
  apiKey: string;
  baseUrl?: string;
}

interface GatewayChatBody {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
  };
}

export class GatewayProvider implements AIProvider {
  readonly id = "lovable-gateway" as const;
  readonly capabilities = CAPS;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: GatewayProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? GATEWAY_URL;
  }

  supportsModel(model: string): boolean {
    const desc = AIModelRegistry.get(model);
    return !!desc && desc.providers.includes(this.id);
  }

  private buildBody(req: AICompletionRequest, stream: boolean): GatewayChatBody {
    const body: GatewayChatBody = {
      model: req.model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream,
    };
    if (req.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: req.jsonSchema.name,
          strict: false,
          schema: req.jsonSchema.schema,
        },
      };
    }
    return body;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const started = Date.now();
    // Ohne eigenes Signal des Aufrufers: eigenen Timeout aufsetzen, statt
    // unbegrenzt zu hängen (siehe AnthropicProvider.ts für dieselbe Logik).
    const ownController = req.signal ? null : new AbortController();
    const effectiveSignal = req.signal ?? ownController!.signal;
    const timeoutId = ownController
      ? setTimeout(() => ownController.abort(), DEFAULT_TIMEOUT_MS)
      : null;
    let res: Response;
    try {
      res = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildBody(req, false)),
        signal: effectiveSignal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIError({
        code: msg.includes("aborted") ? "aborted" : "network",
        userMessage: "Netzwerkfehler beim KI-Gateway.",
        detail: msg,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new AIError({
          code: "rate_limited",
          status: 429,
          userMessage: "Rate-Limit erreicht. Bitte kurz warten und erneut versuchen.",
          detail: text,
        });
      }
      if (res.status === 402) {
        throw new AIError({
          code: "credits_exhausted",
          status: 402,
          userMessage: "AI-Guthaben aufgebraucht. Bitte im Workspace nachladen.",
          detail: text,
        });
      }
      throw new AIError({
        code: res.status >= 500 ? "server_error" : "bad_request",
        status: res.status,
        userMessage: `KI-Gateway antwortete mit Status ${res.status}.`,
        detail: text,
      });
    }
    const raw = (await res.json().catch(() => null)) as
      | {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        }
      | null;
    const content = raw?.choices?.[0]?.message?.content ?? "";
    let json: unknown = undefined;
    if (req.jsonSchema && content) {
      try {
        json = JSON.parse(content);
      } catch {
        throw new AIError({
          code: "invalid_response",
          userMessage: "KI-Antwort war kein gültiges JSON.",
          detail: content.slice(0, 400),
        });
      }
    }
    return {
      content,
      json,
      usage: raw?.usage
        ? {
            promptTokens: raw.usage.prompt_tokens ?? 0,
            completionTokens: raw.usage.completion_tokens ?? 0,
            totalTokens: raw.usage.total_tokens ?? 0,
          }
        : undefined,
      meta: {
        providerId: this.id,
        model: req.model,
        latencyMs: Date.now() - started,
      },
    };
  }

  async *stream(req: AICompletionRequest): AsyncIterable<AIStreamChunk> {
    // Streaming-Grundgerüst. Konsumenten sollen später über AI-SDK/Server
    // Sent Events streamen. Aktuell fallen wir auf complete() zurück, um
    // das Interface bereitzustellen, ohne UI-Pfad zu erzwingen.
    const res = await this.complete(req);
    yield { delta: res.content, done: true, usage: res.usage };
  }

  async healthCheck(signal?: AbortSignal): Promise<AIHealthReport> {
    const t0 = Date.now();
    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
        signal,
      });
      return {
        providerId: this.id,
        ok: res.ok || res.status === 400, // 400 heißt: Endpunkt erreichbar
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
