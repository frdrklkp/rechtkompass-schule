// Zentrale Model-Registry. Neue Modelle werden ausschließlich hier
// registriert – Router und Provider konsumieren nur diese Daten.
// Kein Hard-Coding in Provider-Klassen.

import type { AIProviderCapability, AIProviderId, AIVendor } from "../providers/types";

export interface ModelDescriptor {
  id: string; // z. B. "google/gemini-3.6-flash"
  vendor: AIVendor;
  contextTokens: number;
  maxOutputTokens: number;
  capabilities: AIProviderCapability[];
  /** Reihenfolge der Provider, die dieses Modell bedienen können (Präferenz erst). */
  providers: AIProviderId[];
  /** Kostenstufe für den Router: 1 (günstig) .. 5 (teuer). */
  costTier: 1 | 2 | 3 | 4 | 5;
  /** Latenzstufe: 1 (schnell) .. 5 (langsam). */
  latencyTier: 1 | 2 | 3 | 4 | 5;
  deprecated?: boolean;
}

const REGISTRY: Record<string, ModelDescriptor> = {
  "google/gemini-3.6-flash": {
    id: "google/gemini-3.6-flash",
    vendor: "google",
    contextTokens: 1_000_000,
    maxOutputTokens: 8192,
    capabilities: ["chat", "structured-output", "streaming"],
    providers: ["lovable-gateway", "google-native"],
    costTier: 1,
    latencyTier: 1,
  },
  "google/gemini-3-flash-preview": {
    id: "google/gemini-3-flash-preview",
    vendor: "google",
    contextTokens: 1_000_000,
    maxOutputTokens: 8192,
    capabilities: ["chat", "structured-output", "streaming"],
    providers: ["lovable-gateway"],
    costTier: 1,
    latencyTier: 1,
  },
  "google/gemini-2.5-flash": {
    id: "google/gemini-2.5-flash",
    vendor: "google",
    contextTokens: 1_000_000,
    maxOutputTokens: 8192,
    capabilities: ["chat", "structured-output", "streaming"],
    providers: ["lovable-gateway"],
    costTier: 1,
    latencyTier: 1,
  },
  "google/gemini-2.5-pro": {
    id: "google/gemini-2.5-pro",
    vendor: "google",
    contextTokens: 1_000_000,
    maxOutputTokens: 8192,
    capabilities: ["chat", "structured-output", "streaming"],
    providers: ["lovable-gateway"],
    costTier: 4,
    latencyTier: 3,
  },
  "openai/gpt-5-mini": {
    id: "openai/gpt-5-mini",
    vendor: "openai",
    contextTokens: 400_000,
    maxOutputTokens: 16_000,
    capabilities: ["chat", "structured-output", "streaming"],
    providers: ["lovable-gateway", "openai-native", "azure-openai-native"],
    costTier: 2,
    latencyTier: 2,
  },
  "openai/gpt-5-nano": {
    id: "openai/gpt-5-nano",
    vendor: "openai",
    contextTokens: 400_000,
    maxOutputTokens: 8_000,
    capabilities: ["chat", "structured-output", "streaming"],
    providers: ["lovable-gateway", "openai-native"],
    costTier: 1,
    latencyTier: 1,
  },
  "openai/gpt-5": {
    id: "openai/gpt-5",
    vendor: "openai",
    contextTokens: 400_000,
    maxOutputTokens: 16_000,
    capabilities: ["chat", "structured-output", "streaming", "vision"],
    providers: ["lovable-gateway", "openai-native", "azure-openai-native"],
    costTier: 4,
    latencyTier: 3,
  },
  "mock/echo": {
    id: "mock/echo",
    vendor: "mock",
    contextTokens: 32_000,
    maxOutputTokens: 2048,
    capabilities: ["chat", "structured-output"],
    providers: ["mock"],
    costTier: 1,
    latencyTier: 1,
  },
};

export const AIModelRegistry = {
  get(id: string): ModelDescriptor | undefined {
    return REGISTRY[id];
  },
  require(id: string): ModelDescriptor {
    const d = REGISTRY[id];
    if (!d) throw new Error(`Unknown model in registry: ${id}`);
    return d;
  },
  list(): ModelDescriptor[] {
    return Object.values(REGISTRY);
  },
  providersFor(id: string): AIProviderId[] {
    return REGISTRY[id]?.providers ?? [];
  },
  /** Erweiterungspunkt für native Provider (Ollama, Azure, …). */
  register(desc: ModelDescriptor): void {
    REGISTRY[desc.id] = desc;
  },
};
