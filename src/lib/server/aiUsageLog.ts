// Protokolliert Token-Verbrauch je KI-Aufruf in public.ai_usage_log
// (Migration db/2026-10-03_ai_usage_log.sql). Kostenmessung darf nie einen
// KI-Aufruf stören: jeder Fehler wird verschluckt, und der Schreibvorgang
// wird im Worker abgewartet (nicht abgewartete fetch-Aufrufe werden dort nach
// der Antwort abgebrochen), aber mit kurzem Zeitlimit begrenzt.

const WRITE_TIMEOUT_MS = 1500;

export interface AiUsageEntry {
  provider: string;
  model: string;
  taskId?: string | null;
  promptTokens: number;
  completionTokens: number;
  latencyMs?: number | null;
}

export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  // Nur serverseitig: der Service-Role-Zugriff darf nie im Browser landen.
  if (typeof window !== "undefined" && typeof (globalThis as { document?: unknown }).document !== "undefined") return;
  try {
    const { createServiceSupabase } = await import("../searchEmbeddings.supabase.server");
    const client = createServiceSupabase();
    const insert = (client.from("ai_usage_log" as never) as unknown as {
      insert: (row: Record<string, unknown>) => PromiseLike<unknown>;
    }).insert({
      provider: entry.provider,
      model: entry.model,
      task_id: entry.taskId ?? null,
      prompt_tokens: entry.promptTokens,
      completion_tokens: entry.completionTokens,
      latency_ms: entry.latencyMs ?? null,
    });
    await Promise.race([
      Promise.resolve(insert),
      new Promise((resolve) => setTimeout(resolve, WRITE_TIMEOUT_MS)),
    ]);
  } catch {
    // Messung ist optional - nie den eigentlichen Aufruf gefährden.
  }
}
