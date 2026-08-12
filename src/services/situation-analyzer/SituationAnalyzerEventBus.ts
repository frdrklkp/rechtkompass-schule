/** Sprint 4.6B – Lokaler Event-Bus des Situation Analyzers. */
import type { SituationEvent, SituationEventListener } from "./types";

export class SituationAnalyzerEventBus {
  private listeners = new Set<SituationEventListener>();
  private log: SituationEvent[] = [];

  on(listener: SituationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: SituationEvent): void {
    this.log.push(event);
    for (const l of [...this.listeners]) {
      try {
        l(event);
      } catch {
        /* Listener-Fehler dürfen die Erfassung nie unterbrechen. */
      }
    }
  }

  history(): SituationEvent[] {
    return [...this.log];
  }

  clear(): void {
    this.log = [];
  }
}
