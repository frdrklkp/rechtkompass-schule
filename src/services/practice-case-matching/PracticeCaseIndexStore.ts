/**
 * Sprint 4.6E – Persistenz des Matching-Index.
 * Port + zwei Adapter. Es entsteht keine parallele Datenhaltung: der Index ist
 * ein reproduzierbarer Cache über den veröffentlichten Fallbestand und kann
 * jederzeit aus den Quelldaten neu aufgebaut werden.
 */
import { MATCHING_INDEX_VERSION, MATCHING_PROFILE_VERSION, type PracticeCaseMatchIndex } from "./types";

export interface PracticeCaseIndexStorePort {
  load(): PracticeCaseMatchIndex | null;
  save(index: PracticeCaseMatchIndex): void;
  clear(): void;
}

export const PRACTICE_CASE_INDEX_STORAGE_KEY = "rk.practiceCaseMatchIndex.v1";

export function isCompatibleIndex(index: PracticeCaseMatchIndex | null): index is PracticeCaseMatchIndex {
  return (
    !!index &&
    index.indexVersion === MATCHING_INDEX_VERSION &&
    index.profileVersion === MATCHING_PROFILE_VERSION &&
    Array.isArray(index.entries)
  );
}

export class InMemoryPracticeCaseIndexStore implements PracticeCaseIndexStorePort {
  private index: PracticeCaseMatchIndex | null = null;

  load() {
    return this.index;
  }
  save(index: PracticeCaseMatchIndex) {
    this.index = structuredClone(index);
  }
  clear() {
    this.index = null;
  }
}

export class LocalStoragePracticeCaseIndexStore implements PracticeCaseIndexStorePort {
  constructor(private readonly key: string = PRACTICE_CASE_INDEX_STORAGE_KEY) {}

  private get storage(): Storage | null {
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      return window.localStorage;
    } catch {
      return null;
    }
  }

  load() {
    const storage = this.storage;
    if (!storage) return null;
    try {
      const raw = storage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PracticeCaseMatchIndex;
      return isCompatibleIndex(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  save(index: PracticeCaseMatchIndex) {
    const storage = this.storage;
    if (!storage) return;
    try {
      storage.setItem(this.key, JSON.stringify(index));
    } catch {
      /* Speicherlimit oder deaktivierter Storage: Index bleibt flüchtig. */
    }
  }

  clear() {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* bewusst ignoriert */
    }
  }
}
