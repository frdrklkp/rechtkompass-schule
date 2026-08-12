/** Sprint 4.6H – Ereignisse des Dokumentationsassistenten (Nachvollziehbarkeit, keine Fachlogik). */
import type {
  DocumentationEvent,
  DocumentationEventListener,
  DocumentationEventName,
} from "./types";

export class DocumentationEventBus {
  private readonly listeners = new Set<DocumentationEventListener>();
  private readonly events: DocumentationEvent[] = [];

  on(listener: DocumentationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(name: DocumentationEventName, detail?: Record<string, unknown>): void {
    const event: DocumentationEvent = { name, at: new Date().toISOString(), detail };
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  getEvents(): DocumentationEvent[] {
    return [...this.events];
  }
}
