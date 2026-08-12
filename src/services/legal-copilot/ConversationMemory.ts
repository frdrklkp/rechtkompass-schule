/**
 * In-Memory-Sitzungsverlauf.
 * Keine langfristige Speicherung. Sessions altern nach TTL.
 */
import type { CopilotSessionSnapshot, CopilotSessionTurn } from "./types";

const TTL_MS = 60 * 60 * 1000; // 1 Stunde
const MAX_TURNS = 20;
const MAX_SESSIONS = 200;

interface StoredSession extends CopilotSessionSnapshot {
  updatedAt: string;
}

const sessions = new Map<string, StoredSession>();

function newId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `cpl_${Date.now().toString(36)}_${rnd}`;
}

function evict(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - Date.parse(s.updatedAt) > TTL_MS) sessions.delete(id);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => Date.parse(a[1].updatedAt) - Date.parse(b[1].updatedAt))[0];
    if (!oldest) break;
    sessions.delete(oldest[0]);
  }
}

export const ConversationMemory = {
  ensure(sessionId?: string | null): CopilotSessionSnapshot {
    evict();
    const id = sessionId && sessions.has(sessionId) ? sessionId : newId();
    const existing = sessions.get(id);
    if (existing) return { ...existing, turns: [...existing.turns] };
    const created: StoredSession = {
      sessionId: id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: [],
    };
    sessions.set(id, created);
    return { ...created, turns: [] };
  },

  append(sessionId: string, turn: CopilotSessionTurn): void {
    const s = sessions.get(sessionId);
    if (!s) return;
    s.turns.push(turn);
    if (s.turns.length > MAX_TURNS) s.turns.splice(0, s.turns.length - MAX_TURNS);
    s.updatedAt = new Date().toISOString();
  },

  reset(sessionId: string): void { sessions.delete(sessionId); },
  clearAll(): void { sessions.clear(); },
  size(): number { return sessions.size; },
};
