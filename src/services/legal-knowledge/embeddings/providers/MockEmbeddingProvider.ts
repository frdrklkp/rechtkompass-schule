/**
 * Deterministischer Mock-Provider. Nutzt sha256(input) als Seed für einen
 * pseudo-zufälligen, aber reproduzierbaren Vektor. Keine Netzwerkaufrufe.
 */
import { createHash } from "crypto";
import { EmbeddingModelRegistry } from "../registry/EmbeddingModelRegistry";
import {
  EmbeddingAuthenticationError,
  EmbeddingDimensionMismatchError,
  EmbeddingInputTooLargeError,
  EmbeddingRateLimitError,
  EmbeddingTimeoutError,
} from "../runtime/errors";
import type {
  EmbeddingBatchResult,
  EmbeddingModelDefinition,
  EmbeddingResult,
} from "../types";
import type { EmbeddingProvider, EmbeddingProviderHealth } from "./types";

export interface MockProviderOptions {
  simulate?: {
    rateLimitOnFirstCall?: boolean;
    timeout?: boolean;
    authenticationError?: boolean;
    dimensionMismatch?: boolean;
    inputTooLarge?: boolean;
    failEveryNth?: number; // 0 = disabled
  };
}

function seededVector(text: string, dims: number, normalize: boolean): number[] {
  // Erzeuge deterministischen Vektor: wiederhole sha256 mit counter.
  const out: number[] = [];
  let counter = 0;
  while (out.length < dims) {
    const h = createHash("sha256").update(`${counter}:${text}`).digest();
    for (let i = 0; i < h.length && out.length < dims; i += 4) {
      const u = h.readUInt32BE(i);
      // Map to [-1, 1)
      out.push((u / 0xffffffff) * 2 - 1);
    }
    counter++;
  }
  if (normalize) {
    const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
    for (let i = 0; i < out.length; i++) out[i] = out[i] / norm;
  }
  return out;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly id = "mock" as const;
  private opts: MockProviderOptions;
  private callCount = 0;

  constructor(opts: MockProviderOptions = {}) {
    this.opts = opts;
  }

  supportsModel(modelId: string): boolean {
    try { return EmbeddingModelRegistry.get(modelId).providerId === "mock"; } catch { return false; }
  }
  getModelCapabilities(modelId: string): EmbeddingModelDefinition {
    return EmbeddingModelRegistry.get(modelId);
  }

  private tick() {
    this.callCount++;
    const sim = this.opts.simulate ?? {};
    if (sim.authenticationError) throw new EmbeddingAuthenticationError("mock auth error");
    if (sim.timeout) throw new EmbeddingTimeoutError("mock timeout");
    if (sim.rateLimitOnFirstCall && this.callCount === 1) throw new EmbeddingRateLimitError("mock rate limit");
    if (sim.inputTooLarge) throw new EmbeddingInputTooLargeError("mock input too large");
  }

  async embedOne(input: string, opts: { modelId: string }): Promise<EmbeddingResult> {
    this.tick();
    const model = this.getModelCapabilities(opts.modelId);
    const dims = this.opts.simulate?.dimensionMismatch ? model.dimensions - 1 : model.dimensions;
    if (dims !== model.dimensions) throw new EmbeddingDimensionMismatchError(model.dimensions, dims);
    const vector = seededVector(input, model.dimensions, model.normalizationStrategy === "l2");
    return {
      vector,
      model: model.modelId,
      modelVersion: model.version,
      provider: "mock",
      dimensions: model.dimensions,
      usage: { promptTokens: Math.ceil(input.length / 4), totalTokens: Math.ceil(input.length / 4) },
      latencyMs: 0,
      requestId: `mock-${this.callCount}`,
      createdAt: new Date().toISOString(),
    };
  }

  async embedMany(inputs: string[], opts: { modelId: string }): Promise<EmbeddingBatchResult> {
    const model = this.getModelCapabilities(opts.modelId);
    const results: (EmbeddingResult | null)[] = [];
    const failures: EmbeddingBatchResult["failedItems"] = [];
    let totalTokens = 0;
    const failEvery = this.opts.simulate?.failEveryNth ?? 0;
    for (let i = 0; i < inputs.length; i++) {
      try {
        if (failEvery > 0 && (i + 1) % failEvery === 0) {
          failures.push({ index: i, code: "provider", message: "mock partial failure", retryable: true });
          results.push(null);
          continue;
        }
        const r = await this.embedOne(inputs[i], opts);
        totalTokens += r.usage?.totalTokens ?? 0;
        results.push(r);
      } catch (err) {
        const e = err as Error & { code?: string; retryable?: boolean };
        failures.push({ index: i, code: e.code ?? "provider", message: e.message, retryable: e.retryable ?? true });
        results.push(null);
      }
    }
    return {
      results,
      failedItems: failures,
      usage: { promptTokens: totalTokens, totalTokens },
      provider: "mock",
      model: model.modelId,
      modelVersion: model.version,
      latencyMs: 0,
    };
  }

  async healthCheck(): Promise<EmbeddingProviderHealth> {
    return { ok: true, providerId: "mock", latencyMs: 0, checkedAt: new Date().toISOString() };
  }
}
