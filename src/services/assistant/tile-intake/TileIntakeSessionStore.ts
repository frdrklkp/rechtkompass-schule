/**
 * Tier 3 – Persistenz der Kachel-Sitzung. Eigener Speicherort, getrennt von
 * der alten Assistenten-Sitzung (ASSISTANT_SESSION_STORAGE_KEY), damit sich
 * beide Modelle während der Umstellung nicht überschneiden.
 */
import type { TileIntakeSession } from "./types";
import { TILE_INTAKE_SESSION_STORAGE_KEY, TILE_INTAKE_SESSION_VERSION } from "./types";

export interface TileIntakeSessionStorePort {
  load(): TileIntakeSession | null;
  save(session: TileIntakeSession): void;
  clear(): void;
}

export class LocalStorageTileIntakeSessionStore implements TileIntakeSessionStorePort {
  load(): TileIntakeSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(TILE_INTAKE_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TileIntakeSession;
      if (parsed.version !== TILE_INTAKE_SESSION_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  save(session: TileIntakeSession): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(TILE_INTAKE_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* Speicher nicht verfügbar - Sitzung bleibt nur im Arbeitsspeicher erhalten. */
    }
  }

  clear(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TILE_INTAKE_SESSION_STORAGE_KEY);
  }
}

export class InMemoryTileIntakeSessionStore implements TileIntakeSessionStorePort {
  private session: TileIntakeSession | null = null;
  load(): TileIntakeSession | null {
    return this.session;
  }
  save(session: TileIntakeSession): void {
    this.session = session;
  }
  clear(): void {
    this.session = null;
  }
}
