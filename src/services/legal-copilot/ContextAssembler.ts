/**
 * Baut den Prompt-Kontext (Verlauf + grounded chunks) für den PromptBuilder.
 * Keine KI-Aufrufe.
 */
import type { CopilotSessionSnapshot, GroundedChunk } from "./types";

export interface AssembledContext {
  historyForPrompt: Array<{ role: "user" | "assistant"; text: string }>;
  groundedForPrompt: Array<{
    refId: string;
    citation: string;
    law: string | null;
    excerpt: string;
    reviewStatus: string;
    score: number;
  }>;
}

export const ContextAssembler = {
  assemble(session: CopilotSessionSnapshot, grounded: GroundedChunk[], maxHistory = 6): AssembledContext {
    const history = session.turns
      .filter((t) => t.role === "user" || t.role === "assistant")
      .slice(-maxHistory)
      .map((t) => ({
        role: t.role as "user" | "assistant",
        text: (t.question ?? t.answerSummary ?? "").toString().slice(0, 500),
      }))
      .filter((h) => h.text.length > 0);

    const groundedForPrompt = grounded.map((g) => ({
      refId: g.refId,
      citation: g.hit.citation.display,
      law: g.hit.citation.law,
      excerpt: g.hit.content ?? g.hit.excerpt ?? "",
      reviewStatus: (g.hit.metadata?.reviewStatus ?? "unverified").toString(),
      score: g.hit.score,
    }));

    return { historyForPrompt: history, groundedForPrompt };
  },
};
