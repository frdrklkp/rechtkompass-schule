// Providerunabhängige Kernabstraktion. KEIN Provider (Gateway, Native, Mock)
// darf aus dem restlichen Code heraus direkt referenziert werden – Zugriff
// erfolgt ausschließlich über AIProviderFactory + AIModelRouter.

export type AIProviderId =
  | "lovable-gateway"
  | "mock"
  | "openai-native"
  | "anthropic-native"
  | "google-native"
  | "ollama-native"
  | "azure-openai-native";

export type AIVendor = "openai" | "google" | "anthropic" | "mock" | "custom";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  model: string; // vendor/model id, z. B. "google/gemini-3.6-flash"
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  /** JSON-Schema (Subset) für strukturierte Ausgabe. */
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
  } | null;
  /** Signal für Abbruch. */
  signal?: AbortSignal;
  /** Task-Identifier für Telemetrie & Router-Nachvollziehbarkeit. */
  taskId?: string;
}

export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AICompletionResult {
  /** Textinhalt der Antwort (bei JSON-Modus: JSON-String). */
  content: string;
  /** Bereits aus content geparste JSON-Struktur (nur wenn jsonSchema gesetzt). */
  json?: unknown;
  usage?: AITokenUsage;
  /** Provider- und modellabhängiger Bezeichner der tatsächlichen Ausführung. */
  meta: {
    providerId: AIProviderId;
    model: string;
    latencyMs: number;
    /** true, wenn diese Antwort aus einem Fallback stammt. */
    fromFallback?: boolean;
  };
}

export interface AIStreamChunk {
  delta: string;
  done: boolean;
  usage?: AITokenUsage;
}

export interface AIHealthReport {
  providerId: AIProviderId;
  ok: boolean;
  latencyMs: number;
  detail?: string;
  checkedAt: string;
}

export type AIProviderCapability =
  | "chat"
  | "structured-output"
  | "streaming"
  | "vision"
  | "tool-calling";

/**
 * Alle KI-Aufrufe im Editorial-Bereich laufen ausschließlich gegen dieses
 * Interface. Native Provider (Ollama, Azure OpenAI, …) können später ohne
 * Refactoring nachgezogen werden, indem sie diese Schnittstelle
 * implementieren und in der Factory registriert werden.
 */
export interface AIProvider {
  readonly id: AIProviderId;
  readonly capabilities: ReadonlySet<AIProviderCapability>;
  /** true, wenn dieses Modell laut Provider-Registry unterstützt wird. */
  supportsModel(model: string): boolean;
  complete(req: AICompletionRequest): Promise<AICompletionResult>;
  /**
   * Streaming ist im Interface vorbereitet, aber optional. Provider ohne
   * Streaming-Fähigkeit dürfen das nicht implementieren; die aktuelle UI
   * konsumiert kein Streaming.
   */
  stream?(req: AICompletionRequest): AsyncIterable<AIStreamChunk>;
  healthCheck(signal?: AbortSignal): Promise<AIHealthReport>;
}
