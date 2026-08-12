import type { CopilotAnswer, GroundedChunk } from "./types";

export interface AnswerValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export const AnswerValidator = {
  validate(answer: CopilotAnswer, grounded: GroundedChunk[]): AnswerValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const allowed = new Set(grounded.map((g) => g.hit.citation.chunkId));

    if (!answer.answered) {
      if (!answer.reasonUnanswered) errors.push("answered=false ohne Begründung.");
      return { ok: errors.length === 0, errors, warnings };
    }

    const s = answer.sections;
    if (!s.kurzantwort || s.kurzantwort.trim().length < 3) errors.push("Kurzantwort fehlt.");
    if (!s.einordnung) warnings.push("Einordnung fehlt.");
    if (!Array.isArray(s.empfohleneHandlung) || s.empfohleneHandlung.length === 0)
      warnings.push("Keine empfohlene Handlung.");
    if (!s.begruendung) errors.push("Begründung fehlt.");
    if (!s.disclaimer) errors.push("Disclaimer fehlt.");

    if (grounded.length > 0 && answer.citations.length === 0)
      errors.push("Antwort ohne Rechtsgrundlagen trotz vorhandener Treffer.");

    for (const c of answer.citations) {
      if (!allowed.has(c.chunkId)) errors.push(`Fundstelle ${c.display} stammt nicht aus Retrieval.`);
    }

    return { ok: errors.length === 0, errors, warnings };
  },
};
