import type { ConversationRepositoryPort } from "./ConversationRepository";
import type { CopilotAnswer, CopilotSessionSnapshot } from "./types";

export class ConversationService {
  constructor(private repo: ConversationRepositoryPort) {}

  async openOrResume(sessionId?: string | null): Promise<CopilotSessionSnapshot> {
    return this.repo.ensure(sessionId);
  }

  async recordUser(sessionId: string, question: string): Promise<void> {
    await this.repo.append(sessionId, {
      role: "user",
      at: new Date().toISOString(),
      question,
    });
  }

  async recordAnswer(sessionId: string, answer: CopilotAnswer, chunkIds: string[]): Promise<void> {
    const summary = answer.sections.kurzantwort || (answer.reasonUnanswered ?? "");
    await this.repo.append(sessionId, {
      role: "assistant",
      at: new Date().toISOString(),
      answerSummary: summary.slice(0, 500),
      chunkIds,
    });
  }

  async reset(sessionId: string): Promise<void> { await this.repo.reset(sessionId); }
}
