/**
 * Sprint 4.6A – Event-Bus des Decision Navigators.
 * Rein prozessintern, keine externe Verarbeitung.
 */
import type { NavigatorEvent, NavigatorEventListener } from "./types";

export class NavigatorEventBus {
  private listeners = new Set<NavigatorEventListener>();
  private log: NavigatorEvent[] = [];

  on(listener: NavigatorEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: NavigatorEvent): void {
    this.log.push(event);
    for (const l of [...this.listeners]) {
      try {
        l(event);
      } catch {
        /* Listener-Fehler dürfen die Navigation nie unterbrechen. */
      }
    }
  }

  history(): NavigatorEvent[] {
    return [...this.log];
  }

  clear(): void {
    this.log = [];
  }
}
