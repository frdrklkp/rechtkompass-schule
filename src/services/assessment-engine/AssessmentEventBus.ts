/**
 * Sprint 4.6C – Lokaler Eventbus der Assessment Engine.
 * Nur lokale Beobachtung. Keine Analytics, keine externen Aufrufe.
 */
import type { AssessmentEvent, AssessmentEventListener, AssessmentEventName } from "./types";

export class AssessmentEventBus {
  private listeners = new Set<AssessmentEventListener>();
  private history: AssessmentEvent[] = [];

  subscribe(listener: AssessmentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(name: AssessmentEventName, caseId: string, detail?: Record<string, unknown>): AssessmentEvent {
    const event: AssessmentEvent = { name, caseId, at: new Date().toISOString(), detail };
    this.history.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* Beobachter dürfen die Bewertung nicht unterbrechen. */
      }
    }
    return event;
  }

  getHistory(): AssessmentEvent[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
  }
}
