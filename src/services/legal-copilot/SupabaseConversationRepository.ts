/**
 * Persistente Sitzungsverwaltung des Grounded Legal Copilot in Supabase
 * (Tabellen: copilot_conversations + copilot_conversation_turns, siehe
 * db/2026-09-29_copilot_conversations.sql).
 *
 * Läuft ausschließlich SERVERSEITIG mit dem Service-Role-Client - die
 * Nutzerbindung (userId aus requireApiAuth) wird hier erzwungen: eine
 * fremde oder unbekannte session_id führt still zu einer neuen eigenen
 * Sitzung statt zu einem Fehler oder gar Fremdzugriff. Clients haben per
 * RLS nur SELECT auf die eigenen Zeilen.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationRepositoryPort } from "./ConversationRepository";
import type { CopilotSessionSnapshot, CopilotSessionTurn } from "./types";

const MAX_TURNS = 20;

function newId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `cpl_${Date.now().toString(36)}_${rnd}`;
}

interface ConversationRow {
  session_id: string;
  user_id: string;
  created_at: string;
}

interface TurnRow {
  seq: number;
  role: "user" | "assistant";
  at: string;
  question: string | null;
  answer_summary: string | null;
  chunk_ids: unknown;
}

export class SupabaseConversationRepository implements ConversationRepositoryPort {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private client: SupabaseClient<any>,
    private userId: string,
    private caseId: string | null = null,
  ) {}

  async ensure(sessionId?: string | null): Promise<CopilotSessionSnapshot> {
    if (sessionId) {
      const { data, error } = await this.client
        .from("copilot_conversations")
        .select("session_id, user_id, created_at")
        .eq("session_id", sessionId)
        .eq("user_id", this.userId)
        .maybeSingle();
      if (error) throw new Error(`copilot_conversations select: ${error.message}`);
      if (data) return this.snapshot(data as ConversationRow);
    }
    const created: ConversationRow = {
      session_id: newId(),
      user_id: this.userId,
      created_at: new Date().toISOString(),
    };
    const { error } = await this.client.from("copilot_conversations").insert({
      session_id: created.session_id,
      user_id: created.user_id,
      case_id: this.caseId,
    });
    if (error) throw new Error(`copilot_conversations insert: ${error.message}`);
    return { sessionId: created.session_id, createdAt: created.created_at, turns: [] };
  }

  async append(sessionId: string, turn: CopilotSessionTurn): Promise<void> {
    if (turn.role !== "user" && turn.role !== "assistant") return;
    const { data: last, error: seqErr } = await this.client
      .from("copilot_conversation_turns")
      .select("seq")
      .eq("session_id", sessionId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (seqErr) throw new Error(`copilot_conversation_turns seq: ${seqErr.message}`);
    const { error } = await this.client.from("copilot_conversation_turns").insert({
      session_id: sessionId,
      seq: ((last as { seq: number } | null)?.seq ?? 0) + 1,
      role: turn.role,
      at: turn.at,
      question: turn.question ?? null,
      answer_summary: turn.answerSummary ?? null,
      chunk_ids: turn.chunkIds ?? [],
    });
    if (error) throw new Error(`copilot_conversation_turns insert: ${error.message}`);
    await this.client
      .from("copilot_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  }

  async reset(sessionId: string): Promise<void> {
    const { error } = await this.client
      .from("copilot_conversations")
      .delete()
      .eq("session_id", sessionId)
      .eq("user_id", this.userId);
    if (error) throw new Error(`copilot_conversations delete: ${error.message}`);
  }

  private async snapshot(row: ConversationRow): Promise<CopilotSessionSnapshot> {
    const { data, error } = await this.client
      .from("copilot_conversation_turns")
      .select("seq, role, at, question, answer_summary, chunk_ids")
      .eq("session_id", row.session_id)
      .order("seq", { ascending: false })
      .limit(MAX_TURNS);
    if (error) throw new Error(`copilot_conversation_turns select: ${error.message}`);
    const turns = ((data ?? []) as TurnRow[])
      .reverse()
      .map((t) => ({
        role: t.role,
        at: t.at,
        question: t.question ?? undefined,
        answerSummary: t.answer_summary ?? undefined,
        chunkIds: Array.isArray(t.chunk_ids) ? (t.chunk_ids as string[]) : undefined,
      }));
    return { sessionId: row.session_id, createdAt: row.created_at, turns };
  }
}
