// Simple In-Memory Zähler für Ingestion-Telemetrie. Keine Persistenz.

const counters = new Map<string, number>();

export function bumpTelemetry(key: string, delta = 1): void {
  counters.set(key, (counters.get(key) ?? 0) + delta);
}

export function readTelemetry(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function resetTelemetry(): void {
  counters.clear();
}
