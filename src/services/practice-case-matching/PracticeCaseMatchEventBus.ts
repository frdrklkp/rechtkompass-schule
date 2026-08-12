/** Sprint 4.6E – Ereigniskanal der Matching-Grundlage. */
import type {
  PracticeCaseMatchEvent,
  PracticeCaseMatchEventListener,
  PracticeCaseMatchEventName,
} from "./types";

export class PracticeCaseMatchEventBus {
  private readonly listeners = new Set<PracticeCaseMatchEventListener>();
  private readonly log: PracticeCaseMatchEvent[] = [];

  subscribe(listener: PracticeCaseMatchEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(name: PracticeCaseMatchEventName, detail?: Record<string, unknown>): PracticeCaseMatchEvent {
    const event: PracticeCaseMatchEvent = { name, at: new Date().toISOString(), detail };
    this.log.push(event);
    for (const listener of this.listeners) listener(event);
    return event;
  }

  history(): PracticeCaseMatchEvent[] {
    return [...this.log];
  }
}
