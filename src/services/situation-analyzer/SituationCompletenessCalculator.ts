/**
 * Sprint 4.6B – Berechnung der Erfassungsvollständigkeit.
 * Keine Risiko-, Qualitäts- oder Rechtsbewertung.
 */
import { SituationQuestionResolver } from "./SituationQuestionResolver";
import type {
  SituationAnswer,
  SituationCompleteness,
  SituationSchemaDefinition,
  SituationUncertainty,
} from "./types";

function isEmptyValue(answer: SituationAnswer): boolean {
  const v = answer.value;
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export class SituationCompletenessCalculator {
  private readonly resolver: SituationQuestionResolver;

  constructor(private readonly schema: SituationSchemaDefinition) {
    this.resolver = new SituationQuestionResolver(schema);
  }

  calculate(answers: Record<string, SituationAnswer>): SituationCompleteness {
    const resolved = this.resolver
      .resolve(answers)
      .filter((q) => q.visible && q.definition.type !== "information");

    let answered = 0;
    let unknown = 0;
    let notApplicable = 0;
    const missingRequired: string[] = [];

    for (const { definition, required } of resolved) {
      const answer = answers[definition.id];
      const status = answer?.answerStatus ?? "notAnswered";

      if (status === "answered" && answer && !isEmptyValue(answer)) answered += 1;
      else if (status === "unknown") unknown += 1;
      else if (status === "notApplicable") notApplicable += 1;
      else if (required) missingRequired.push(definition.id);
    }

    const total = resolved.length;
    const processed = answered + unknown + notApplicable;
    const percentage = total === 0 ? 100 : Math.round((processed / total) * 100);

    return {
      totalRelevantQuestions: total,
      answeredQuestions: answered,
      unknownQuestions: unknown,
      notApplicableQuestions: notApplicable,
      missingRequiredQuestions: missingRequired,
      completionPercentage: percentage,
      isComplete: missingRequired.length === 0,
    };
  }

  uncertainties(answers: Record<string, SituationAnswer>): SituationUncertainty[] {
    const resolved = this.resolver
      .resolve(answers)
      .filter((q) => q.visible && q.definition.type !== "information");
    const out: SituationUncertainty[] = [];
    for (const { definition } of resolved) {
      const status = answers[definition.id]?.answerStatus ?? "notAnswered";
      if (status === "unknown" || status === "notAnswered") {
        out.push({
          questionId: definition.id,
          section: definition.section,
          title: definition.title,
          reason: status,
        });
      }
    }
    return out;
  }
}
