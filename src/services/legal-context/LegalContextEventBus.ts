/** Sprint 4.6G – Ereignisse des Legal Context (Nachvollziehbarkeit, keine Fachlogik). */
import type { LegalContextEvent, LegalContextEventListener, LegalContextEventName } from "./types";

export class LegalContextEventBus {
  private readonly listeners = new Set<LegalContextEventListener>();
  private readonly events: LegalContextEvent[] = [];

  on(listener: LegalContextEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(name: LegalContextEventName, detail?: Record<string, unknown>): void {
    const event: LegalContextEvent = { name, at: new Date().toISOString(), detail };
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  getEvents(): LegalContextEvent[] {
    return [...this.events];
  }
}
