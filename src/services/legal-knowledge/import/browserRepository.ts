/**
 * Sprint 4.5F – Browser-Adapter für das Legal Import Framework.
 *
 * Der Adapter erfüllt den bestehenden `LegalImportRepositoryPort` und persistiert
 * Snapshots sowie eine Import-Historie in `localStorage`. Er ist bewusst leicht:
 * das Framework selbst bleibt unverändert. Für spätere Sprints kann derselbe
 * Port gegen eine Supabase-Implementierung ausgetauscht werden.
 */
import type {
  LegalImportDelta,
  LegalImportRepositoryPort,
  LegalImportSnapshot,
  NormalizedLegalDocument,
} from "./index";

const SNAP_KEY = "lk.import.snapshots.v1";
const HIST_KEY = "lk.import.history.v1";

export interface LegalImportHistoryEntry {
  id: string;
  timestamp: string;
  parserId: string;
  parserLabel?: string;
  sourceKey: string;
  sourceTitle: string;
  versionLabel: string;
  status: "completed" | "no_change" | "failed";
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  user?: string | null;
  message?: string | null;
}

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Quota / privacy modus – silently ignore */
  }
}

export class BrowserLegalImportRepository implements LegalImportRepositoryPort {
  async loadSnapshot(sourceKey: string): Promise<LegalImportSnapshot | null> {
    const map = safeRead<Record<string, LegalImportSnapshot>>(SNAP_KEY, {});
    return map[sourceKey] ?? null;
  }

  async applyDelta(_input: {
    document: NormalizedLegalDocument;
    delta: LegalImportDelta;
    previous: LegalImportSnapshot | null;
  }): Promise<void> {
    /* Delta wird ausschließlich zur Anzeige/Historie verwendet. */
  }

  async saveSnapshot(snapshot: LegalImportSnapshot): Promise<void> {
    const map = safeRead<Record<string, LegalImportSnapshot>>(SNAP_KEY, {});
    map[snapshot.sourceKey] = snapshot;
    safeWrite(SNAP_KEY, map);
  }
}

export const browserLegalImportRepository = new BrowserLegalImportRepository();

export function listImportHistory(): LegalImportHistoryEntry[] {
  return safeRead<LegalImportHistoryEntry[]>(HIST_KEY, []);
}

export function appendImportHistory(entry: LegalImportHistoryEntry): void {
  const list = listImportHistory();
  list.unshift(entry);
  safeWrite(HIST_KEY, list.slice(0, 200));
}

export function clearImportHistory(): void {
  safeWrite(HIST_KEY, []);
}

export function listSnapshots(): LegalImportSnapshot[] {
  const map = safeRead<Record<string, LegalImportSnapshot>>(SNAP_KEY, {});
  return Object.values(map);
}

export function getSnapshot(sourceKey: string): LegalImportSnapshot | null {
  const map = safeRead<Record<string, LegalImportSnapshot>>(SNAP_KEY, {});
  return map[sourceKey] ?? null;
}
