/**
 * Sprint 4.6B – Fachlich neutrale Validierung der Situationserfassung.
 * Prüft ausschließlich Struktur und Vollständigkeit der Angaben.
 */
import { SituationQuestionResolver } from "./SituationQuestionResolver";
import type {
  SituationAnswer,
  SituationCase,
  SituationQuestionDefinition,
  SituationSchemaDefinition,
  SituationValidationIssue,
  SituationValidationResult,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function isValidTime(value: string): boolean {
  if (!TIME_RE.test(value)) return false;
  const [h, m] = value.split(":").map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

function isBlank(answer: SituationAnswer | undefined): boolean {
  if (!answer) return true;
  if (answer.answerStatus === "notAnswered") return true;
  if (answer.answerStatus !== "answered") return false;
  const v = answer.value;
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export class SituationValidator {
  private readonly resolver: SituationQuestionResolver;

  constructor(private readonly schema: SituationSchemaDefinition) {
    this.resolver = new SituationQuestionResolver(schema);
  }

  validate(situationCase: SituationCase): SituationValidationResult {
    const issues: SituationValidationIssue[] = [];
    const answers = situationCase.answers;
    const resolved = this.resolver.resolve(answers);

    for (const { definition, visible, required } of resolved) {
      if (!visible) continue;
      const answer = answers[definition.id];

      if (required && isBlank(answer)) {
        issues.push({
          code: definition.required ? "required_missing" : "conditional_required_missing",
          questionId: definition.id,
          section: definition.section,
          message: `„${definition.title}“ muss beantwortet oder ausdrücklich als unbekannt markiert werden.`,
        });
        continue;
      }

      if (answer && answer.answerStatus === "answered") {
        issues.push(...this.checkType(definition, answer));
        issues.push(...this.checkRules(definition, answer));
      }
    }

    issues.push(...this.checkReferences(situationCase));

    return { valid: issues.length === 0, issues };
  }

  private checkType(
    definition: SituationQuestionDefinition,
    answer: SituationAnswer,
  ): SituationValidationIssue[] {
    const v = answer.value;
    const mismatch = (message: string): SituationValidationIssue => ({
      code: "type_mismatch",
      questionId: definition.id,
      section: definition.section,
      message,
    });

    switch (definition.type) {
      case "boolean":
        return typeof v === "boolean" ? [] : [mismatch(`„${definition.title}“ erwartet Ja oder Nein.`)];
      case "multiChoice":
        return Array.isArray(v) ? [] : [mismatch(`„${definition.title}“ erwartet eine Auswahlliste.`)];
      case "date":
        if (typeof v !== "string") return [mismatch(`„${definition.title}“ erwartet ein Datum.`)];
        return isValidDate(v)
          ? []
          : [{ code: "invalid_date", questionId: definition.id, section: definition.section, message: `„${definition.title}“ enthält kein gültiges Datum (JJJJ-MM-TT).` }];
      case "time":
        if (typeof v !== "string") return [mismatch(`„${definition.title}“ erwartet eine Uhrzeit.`)];
        return isValidTime(v)
          ? []
          : [{ code: "invalid_time", questionId: definition.id, section: definition.section, message: `„${definition.title}“ enthält keine gültige Uhrzeit (HH:MM).` }];
      case "dateTime": {
        if (typeof v !== "string") return [mismatch(`„${definition.title}“ erwartet Datum und Uhrzeit.`)];
        const d = new Date(v);
        return Number.isNaN(d.getTime())
          ? [{ code: "invalid_datetime", questionId: definition.id, section: definition.section, message: `„${definition.title}“ enthält keinen gültigen Zeitpunkt.` }]
          : [];
      }
      case "text":
      case "textarea":
      case "location":
      case "singleChoice":
        return typeof v === "string" ? [] : [mismatch(`„${definition.title}“ erwartet einen Text.`)];
      default:
        return [];
    }
  }

  private checkRules(
    definition: SituationQuestionDefinition,
    answer: SituationAnswer,
  ): SituationValidationIssue[] {
    const rules = definition.validation;
    if (!rules) return [];
    const issues: SituationValidationIssue[] = [];
    const push = (message: string) =>
      issues.push({ code: "validation_rule", questionId: definition.id, section: definition.section, message });

    const v = answer.value;
    if (typeof v === "string") {
      if (rules.minLength !== undefined && v.trim().length < rules.minLength) {
        push(`„${definition.title}“ benötigt mindestens ${rules.minLength} Zeichen.`);
      }
      if (rules.maxLength !== undefined && v.length > rules.maxLength) {
        push(`„${definition.title}“ darf höchstens ${rules.maxLength} Zeichen enthalten.`);
      }
      if (rules.pattern && !new RegExp(rules.pattern).test(v)) {
        push(`„${definition.title}“ entspricht nicht dem erwarteten Format.`);
      }
    }
    if (Array.isArray(v)) {
      if (rules.minSelected !== undefined && v.length < rules.minSelected) {
        push(`„${definition.title}“ benötigt mindestens ${rules.minSelected} Auswahl(en).`);
      }
      if (rules.maxSelected !== undefined && v.length > rules.maxSelected) {
        push(`„${definition.title}“ erlaubt höchstens ${rules.maxSelected} Auswahl(en).`);
      }
    }
    return issues;
  }

  private checkReferences(situationCase: SituationCase): SituationValidationIssue[] {
    const issues: SituationValidationIssue[] = [];
    const seen = new Set<string>();
    for (const p of situationCase.participants) {
      if (seen.has(p.id)) {
        issues.push({
          code: "duplicate_participant_id",
          questionId: null,
          section: "beteiligte",
          message: `Die Kennung einer beteiligten Person ist mehrfach vergeben (${p.displayName || p.id}).`,
        });
      }
      seen.add(p.id);
    }
    for (const w of situationCase.witnesses) {
      if (w.participantId && !seen.has(w.participantId)) {
        issues.push({
          code: "unknown_participant_reference",
          questionId: null,
          section: "zeugen",
          message: `Der Zeuge „${w.displayName || w.id}“ verweist auf eine nicht vorhandene beteiligte Person.`,
        });
      }
    }
    return issues;
  }
}
