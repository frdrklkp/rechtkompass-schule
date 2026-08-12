/**
 * Sprint 4.6F – Persistenz der Assistenten-Sitzung.
 * Bewusst getrennt vom Navigator-Store: der Assistent führt zum Navigator,
 * ersetzt ihn aber nicht.
 */
import {
  ASSISTANT_SESSION_STORAGE_KEY,
  ASSISTANT_SESSION_VERSION,
  type AssistantSession,
} from "./types";

export interface AssistantSessionStorePort {
  load(): AssistantSession | null;
  save(session: AssistantSession): void;
  clear(): void;
}

/** Prüft Version und Grundstruktur einer gespeicherten Sitzung. */
export function isCompatibleAssistantSession(value: unknown): value is AssistantSession {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<AssistantSession>;
  return (
    s.version === ASSISTANT_SESSION_VERSION &&
    typeof s.sessionId === "string" &&
    typeof s.description === "string" &&
    typeof s.phase === "string" &&
    Array.isArray(s.answeredQuestionIds)
  );
}

export class InMemoryAssistantSessionStore implements AssistantSessionStorePort {
  private session: AssistantSession | null = null;

  load(): AssistantSession | null {
    return this.session;
  }

  save(session: AssistantSession): void {
    this.session = session;
  }

  clear(): void {
    this.session = null;
  }
}

export class LocalStorageAssistantSessionStore implements AssistantSessionStorePort {
  constructor(private readonly key: string = ASSISTANT_SESSION_STORAGE_KEY) {}

  private storage(): Storage | null {
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      return window.localStorage;
    } catch {
      return null;
    }
  }

  load(): AssistantSession | null {
    const storage = this.storage();
    if (!storage) return null;
    const raw = storage.getItem(this.key);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isCompatibleAssistantSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  save(session: AssistantSession): void {
    const storage = this.storage();
    if (!storage) return;
    try {
      storage.setItem(this.key, JSON.stringify(session));
    } catch {
      /* Speicher voll oder nicht verfügbar – Sitzung bleibt im Arbeitsspeicher. */
    }
  }

  clear(): void {
    const storage = this.storage();
    if (!storage) return;
    try {
      storage.removeItem(this.key);
    } catch {
      /* ignoriert */
    }
  }
}
