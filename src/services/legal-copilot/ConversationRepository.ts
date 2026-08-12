/**
 * Repository-Port für die Sitzungsverwaltung.
 * Default: InMemory (kein Persist). Ein SupabaseRepository kann später
 * nachgezogen werden, ohne die Serviceschicht anzupassen.
 */
import { ConversationMemory } from "./ConversationMemory";
import type { CopilotSessionSnapshot, CopilotSessionTurn } from "./types";

export interface ConversationRepositoryPort {
  ensure(sessionId?: string | null): Promise<CopilotSessionSnapshot>;
  append(sessionId: string, turn: CopilotSessionTurn): Promise<void>;
  reset(sessionId: string): Promise<void>;
}

export class InMemoryConversationRepository implements ConversationRepositoryPort {
  async ensure(sessionId?: string | null) { return ConversationMemory.ensure(sessionId); }
  async append(sessionId: string, turn: CopilotSessionTurn) { ConversationMemory.append(sessionId, turn); }
  async reset(sessionId: string) { ConversationMemory.reset(sessionId); }
}
