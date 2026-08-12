/**
 * Sprint 4.6D – Lokaler Eventbus der Action Engine.
 * Nur lokale Beobachtung. Keine Analytics, keine externen Aufrufe.
 */
import type { ActionEvent, ActionEventListener, ActionEventName } from "./types";

export class ActionEventBus {
  private listeners = new Set<ActionEventListener>();
  private history: ActionEvent[] = [];

  subscribe(listener: ActionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(name: ActionEventName, caseId: string, detail?: Record<string, unknown>): ActionEvent {
    const event: ActionEvent = { name, caseId, at: new Date().toISOString(), detail };
    this.history.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* Beobachter dürfen die Verarbeitung nicht unterbrechen. */
      }
    }
    return event;
  }

  getHistory(): ActionEvent[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
  }
}
