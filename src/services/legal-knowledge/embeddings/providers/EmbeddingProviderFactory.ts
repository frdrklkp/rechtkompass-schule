/**
 * Providerfabrik. Wählt Provider anhand Modell + Feature-Flags.
 * Fallback: MockProvider (deterministisch), wenn externer Provider deaktiviert.
 */
import { EmbeddingModelRegistry } from "../registry/EmbeddingModelRegistry";
import { legalEmbeddingFlags } from "../runtime/featureFlags";
import { GatewayEmbeddingProvider } from "./GatewayEmbeddingProvider";
import { MockEmbeddingProvider } from "./MockEmbeddingProvider";
import type { EmbeddingProvider } from "./types";

export interface FactoryOptions {
  /** Erzwingt Mock, unabhängig vom Modell (Tests). */
  forceMock?: boolean;
  /** API-Key wird explizit übergeben (nur serverseitig). */
  apiKey?: string;
}

export const EmbeddingProviderFactory = {
  forModel(modelId: string, opts: FactoryOptions = {}): EmbeddingProvider {
    const model = EmbeddingModelRegistry.get(modelId);
    if (opts.forceMock || model.providerId === "mock") {
      return new MockEmbeddingProvider();
    }
    if (model.providerId === "lovable-gateway") {
      if (!legalEmbeddingFlags.externalProviderEnabled) {
        // Feature-Flag AUS → deterministischer Fallback für Sicherheit/Tests.
        return new MockEmbeddingProvider();
      }
      const key = opts.apiKey ?? (typeof process !== "undefined" ? process.env.LOVABLE_API_KEY : undefined);
      if (!key) throw new Error("LOVABLE_API_KEY fehlt für Gateway-Provider");
      return new GatewayEmbeddingProvider(key);
    }
    throw new Error(`Kein Provider registriert für ${model.providerId}`);
  },
};
