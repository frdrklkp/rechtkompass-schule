/** Mapper zwischen Repository-Rohdaten und Session-Snapshot. */
import type { CopilotSessionSnapshot } from "./types";

export const ConversationMapper = {
  toClient(session: CopilotSessionSnapshot) {
    return {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      turns: session.turns.map((t) => ({
        role: t.role,
        at: t.at,
        question: t.question ?? null,
        answerSummary: t.answerSummary ?? null,
        chunkIds: t.chunkIds ?? [],
      })),
    };
  },
};
