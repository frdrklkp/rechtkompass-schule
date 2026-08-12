/**
 * Sprint 4.6B – Deterministische Auflösung von Sichtbarkeit und Pflichtstatus.
 * Keine dynamische Auswertung, kein eval.
 */
import type {
  SituationAnswer,
  SituationAnswerValue,
  SituationCondition,
  SituationQuestionDefinition,
  SituationSchemaDefinition,
} from "./types";

export interface ResolvedSituationQuestion {
  definition: SituationQuestionDefinition;
  visible: boolean;
  required: boolean;
}

function valuesEqual(a: SituationAnswerValue | undefined, b: SituationAnswerValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function isBlank(value: SituationAnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export class SituationQuestionResolver {
  constructor(private readonly schema: SituationSchemaDefinition) {}

  private answerOf(
    answers: Record<string, SituationAnswer>,
    questionId: string,
  ): SituationAnswer | undefined {
    return answers[questionId];
  }

  evaluateCondition(
    condition: SituationCondition,
    answers: Record<string, SituationAnswer>,
  ): boolean {
    const answer = this.answerOf(answers, condition.questionId);
    // Nur ausdrücklich beantwortete Angaben erfüllen Bedingungen.
    const value = answer && answer.answerStatus === "answered" ? answer.value : undefined;

    switch (condition.operator) {
      case "equals":
        return valuesEqual(value, condition.value);
      case "notEquals":
        return !valuesEqual(value, condition.value);
      case "includes":
        return Array.isArray(value) && value.some((v) => v === condition.value);
      case "exists":
        return !isBlank(value);
      case "isTrue":
        return value === true;
      case "isFalse":
        return value === false;
      default:
        return false;
    }
  }

  private allMatch(
    conditions: SituationCondition[] | undefined,
    answers: Record<string, SituationAnswer>,
  ): boolean {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every((c) => this.evaluateCondition(c, answers));
  }

  isVisible(
    question: SituationQuestionDefinition,
    answers: Record<string, SituationAnswer>,
  ): boolean {
    if (!question.visible) return false;
    return this.allMatch(question.dependsOn, answers);
  }

  isRequired(
    question: SituationQuestionDefinition,
    answers: Record<string, SituationAnswer>,
  ): boolean {
    if (!this.isVisible(question, answers)) return false;
    if (question.type === "information") return false;
    if (question.required) return true;
    if (!question.requiredWhen || question.requiredWhen.length === 0) return false;
    return this.allMatch(question.requiredWhen, answers);
  }

  resolve(answers: Record<string, SituationAnswer>): ResolvedSituationQuestion[] {
    return [...this.schema.questions]
      .sort((a, b) => a.order - b.order)
      .map((definition) => ({
        definition,
        visible: this.isVisible(definition, answers),
        required: this.isRequired(definition, answers),
      }));
  }

  visibleQuestions(answers: Record<string, SituationAnswer>): SituationQuestionDefinition[] {
    return this.resolve(answers)
      .filter((q) => q.visible)
      .map((q) => q.definition);
  }

  /** Sichtbare, für die Erfassung relevante Fragen (ohne reine Hinweise). */
  relevantQuestions(answers: Record<string, SituationAnswer>): SituationQuestionDefinition[] {
    return this.visibleQuestions(answers).filter((q) => q.type !== "information");
  }

  sectionsInOrder() {
    return [...this.schema.sections].sort((a, b) => a.order - b.order);
  }
}
