// Zentrale Instanziierung der Provider. Verhindert Hard-Coding auf einen
// konkreten Provider im Anwendungscode. Native Provider werden hier später
// registriert – ohne Änderungen im Router, in der Registry oder in der
// AIEditorialService-Schicht.

import { AI_FLAGS, getFlag } from "../runtime/featureFlags";
import { AnthropicProvider } from "./AnthropicProvider";
import { GatewayProvider } from "./GatewayProvider";
import { MockProvider } from "./MockProvider";
import type { AIProvider, AIProviderId } from "./types";

type ProviderBuilder = () => AIProvider;

const builders = new Map<AIProviderId, ProviderBuilder>();
const cache = new Map<AIProviderId, AIProvider>();

function readEnvVar(name: string): string | undefined {
  try {
    return (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.[name];
  } catch {
    return undefined;
  }
}

// Default-Registrierung: Gateway (falls Key + Flag), Anthropic (falls Key) und Mock.
function registerDefaults() {
  builders.set("mock", () => new MockProvider());
  builders.set("lovable-gateway", () => {
    const key = readEnvVar("LOVABLE_API_KEY");
    if (!key) {
      throw new Error("LOVABLE_API_KEY missing – Gateway provider not available.");
    }
    return new GatewayProvider({ apiKey: key });
  });
  builders.set("anthropic-native", () => {
    const key = readEnvVar("ANTHROPIC_API_KEY");
    if (!key) {
      throw new Error("ANTHROPIC_API_KEY missing – Anthropic provider not available.");
    }
    return new AnthropicProvider({ apiKey: key });
  });
}
registerDefaults();

export const AIProviderFactory = {
  /**
   * Registrierpunkt für native Provider (OpenAIProvider, AnthropicProvider,
   * OllamaProvider, AzureOpenAIProvider, …). Wird zur Boot-Zeit aufgerufen.
   */
  register(id: AIProviderId, builder: ProviderBuilder): void {
    builders.set(id, builder);
    cache.delete(id);
  },

  /**
   * Liefert Provider-Instanz. Cached pro Prozess. Für den Standardfall
   * `lovable-gateway` fällt der Aufruf auf `mock` zurück, wenn kein Key
   * verfügbar ist ODER das Feature Flag ENABLE_GATEWAY=false gesetzt ist.
   */
  get(id: AIProviderId): AIProvider {
    if (id === "lovable-gateway") {
      const key = readEnvVar("LOVABLE_API_KEY");
      const enabled = getFlag<boolean>(AI_FLAGS.ENABLE_GATEWAY);
      if (!key || !enabled) return this.get("mock");
    }
    if (id === "anthropic-native") {
      const key = readEnvVar("ANTHROPIC_API_KEY");
      if (!key) return this.get("mock");
    }
    const cached = cache.get(id);
    if (cached) return cached;
    const b = builders.get(id);
    if (!b) throw new Error(`No AIProvider registered for id="${id}".`);
    const inst = b();
    cache.set(id, inst);
    return inst;
  },

  has(id: AIProviderId): boolean {
    return builders.has(id);
  },

  clearCache(): void {
    cache.clear();
  },

  registeredIds(): AIProviderId[] {
    return [...builders.keys()];
  },
};
