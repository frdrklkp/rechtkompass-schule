/** Sprint 4.6F – Ereignisse des Assistenten (Nachvollziehbarkeit, keine Fachlogik). */
import type { AssistantEvent, AssistantEventListener, AssistantEventName } from "./types";

export class AssistantEventBus {
  private readonly listeners = new Set<AssistantEventListener>();
  private readonly events: AssistantEvent[] = [];

  on(listener: AssistantEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(name: AssistantEventName, sessionId: string, detail?: Record<string, unknown>): void {
    const event: AssistantEvent = { name, sessionId, at: new Date().toISOString(), detail };
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  getEvents(): AssistantEvent[] {
    return [...this.events];
  }
}
