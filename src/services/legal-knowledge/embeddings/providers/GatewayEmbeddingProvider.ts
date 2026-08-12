/**
 * Lovable AI Gateway Embedding-Provider.
 * NUR serverseitig verwenden (LOVABLE_API_KEY).
 */
import { EmbeddingModelRegistry } from "../registry/EmbeddingModelRegistry";
import {
  EmbeddingAuthenticationError,
  EmbeddingDimensionMismatchError,
  EmbeddingProviderError,
  classifyHttpError,
} from "../runtime/errors";
import type {
  EmbeddingBatchResult,
  EmbeddingModelDefinition,
  EmbeddingResult,
} from "../types";
import type { EmbeddingProvider, EmbeddingProviderHealth } from "./types";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/embeddings";

export class GatewayEmbeddingProvider implements EmbeddingProvider {
  readonly id = "lovable-gateway" as const;
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new EmbeddingAuthenticationError("LOVABLE_API_KEY missing");
    this.apiKey = apiKey;
  }

  supportsModel(modelId: string): boolean {
    try {
      const m = EmbeddingModelRegistry.get(modelId);
      return m.providerId === "lovable-gateway";
    } catch { return false; }
  }
  getModelCapabilities(modelId: string): EmbeddingModelDefinition {
    return EmbeddingModelRegistry.get(modelId);
  }

  private async call(input: string | string[], modelId: string, signal?: AbortSignal): Promise<{
    data: Array<{ embedding: number[]; index: number }>;
    usage?: { prompt_tokens?: number; total_tokens?: number };
    requestId?: string;
    latencyMs: number;
  }> {
    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: modelId, input }),
        signal,
      });
    } catch (err) {
      throw new EmbeddingProviderError(`Netzwerkfehler: ${(err as Error).message}`, { cause: err });
    }
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw classifyHttpError(res.status, body);
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
      usage?: { prompt_tokens?: number; total_tokens?: number };
      id?: string;
    };
    const data = (json.data ?? []).map((d, i) => ({
      embedding: Array.isArray(d.embedding) ? d.embedding : [],
      index: d.index ?? i,
    })).sort((a, b) => a.index - b.index);
    return { data, usage: json.usage, requestId: json.id, latencyMs };
  }

  async embedOne(input: string, opts: { modelId: string; signal?: AbortSignal }): Promise<EmbeddingResult> {
    const model = this.getModelCapabilities(opts.modelId);
    const r = await this.call(input, opts.modelId, opts.signal);
    const vec = r.data[0]?.embedding ?? [];
    if (vec.length !== model.dimensions) throw new EmbeddingDimensionMismatchError(model.dimensions, vec.length);
    return {
      vector: vec,
      model: model.modelId,
      modelVersion: model.version,
      provider: "lovable-gateway",
      dimensions: model.dimensions,
      usage: r.usage ? { promptTokens: r.usage.prompt_tokens ?? 0, totalTokens: r.usage.total_tokens ?? 0 } : undefined,
      latencyMs: r.latencyMs,
      requestId: r.requestId,
      createdAt: new Date().toISOString(),
    };
  }

  async embedMany(inputs: string[], opts: { modelId: string; signal?: AbortSignal }): Promise<EmbeddingBatchResult> {
    const model = this.getModelCapabilities(opts.modelId);
    const r = await this.call(inputs, opts.modelId, opts.signal);
    const results: (EmbeddingResult | null)[] = [];
    const failed: EmbeddingBatchResult["failedItems"] = [];
    for (let i = 0; i < inputs.length; i++) {
      const vec = r.data[i]?.embedding ?? [];
      if (vec.length !== model.dimensions) {
        failed.push({ index: i, code: "dimension_mismatch", message: `expected ${model.dimensions} got ${vec.length}`, retryable: false });
        results.push(null);
        continue;
      }
      results.push({
        vector: vec, model: model.modelId, modelVersion: model.version, provider: "lovable-gateway",
        dimensions: model.dimensions,
        latencyMs: r.latencyMs, createdAt: new Date().toISOString(),
      });
    }
    return {
      results, failedItems: failed,
      usage: r.usage ? { promptTokens: r.usage.prompt_tokens ?? 0, totalTokens: r.usage.total_tokens ?? 0 } : undefined,
      provider: "lovable-gateway", model: model.modelId, modelVersion: model.version, latencyMs: r.latencyMs,
    };
  }

  async healthCheck(signal?: AbortSignal): Promise<EmbeddingProviderHealth> {
    const start = Date.now();
    try {
      await this.embedOne("ping", { modelId: EmbeddingModelRegistry.getDefault().modelId, signal });
      return { ok: true, providerId: "lovable-gateway", latencyMs: Date.now() - start, checkedAt: new Date().toISOString() };
    } catch (err) {
      return { ok: false, providerId: "lovable-gateway", latencyMs: Date.now() - start, detail: (err as Error).message, checkedAt: new Date().toISOString() };
    }
  }
}
