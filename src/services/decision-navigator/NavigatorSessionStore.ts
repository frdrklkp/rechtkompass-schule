/**
 * Sprint 4.6A – Persistenz des Navigator-Status.
 * Ports & Adapters: In-Memory (Tests) und Browser-Storage (Runtime).
 */
import type { NavigatorState } from "./types";

export interface NavigatorSessionStorePort {
  save(state: NavigatorState): void;
  load(navigatorId: string): NavigatorState | null;
  remove(navigatorId: string): void;
  list(): NavigatorState[];
}

export class InMemoryNavigatorSessionStore implements NavigatorSessionStorePort {
  private map = new Map<string, string>();

  save(state: NavigatorState): void {
    this.map.set(state.navigatorId, JSON.stringify(state));
  }
  load(navigatorId: string): NavigatorState | null {
    const raw = this.map.get(navigatorId);
    return raw ? (JSON.parse(raw) as NavigatorState) : null;
  }
  remove(navigatorId: string): void {
    this.map.delete(navigatorId);
  }
  list(): NavigatorState[] {
    return [...this.map.values()].map((r) => JSON.parse(r) as NavigatorState);
  }
}

const PREFIX = "rk:navigator:";

/** Browser-Adapter; fällt außerhalb des Browsers still auf No-Op zurück. */
export class LocalStorageNavigatorSessionStore implements NavigatorSessionStorePort {
  private available(): Storage | null {
    try {
      return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  save(state: NavigatorState): void {
    const s = this.available();
    if (!s) return;
    try {
      s.setItem(PREFIX + state.navigatorId, JSON.stringify(state));
    } catch {
      /* Quota o. Ä. – Navigation bleibt funktionsfähig. */
    }
  }

  load(navigatorId: string): NavigatorState | null {
    const s = this.available();
    if (!s) return null;
    const raw = s.getItem(PREFIX + navigatorId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as NavigatorState;
    } catch {
      return null;
    }
  }

  remove(navigatorId: string): void {
    this.available()?.removeItem(PREFIX + navigatorId);
  }

  list(): NavigatorState[] {
    const s = this.available();
    if (!s) return [];
    const out: NavigatorState[] = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        out.push(JSON.parse(s.getItem(key)!) as NavigatorState);
      } catch {
        /* defekter Eintrag wird ignoriert */
      }
    }
    return out;
  }
}
