/**
 * Sprint 4.6C – Deterministische Auswertung einzelner Bewertungsregeln.
 * Zugriff ausschließlich über typisierte Feldpfade. Kein eval, keine dynamischen Strings.
 */
import type { SituationCase } from "@/services/situation-analyzer";
import { labelForField } from "./fieldLabels";
import type {
  AssessmentCondition,
  AssessmentReason,
  AssessmentRule,
  ReasonImpact,
} from "./types";

export interface RuleEvaluation {
  rule: AssessmentRule;
  matched: boolean;
  /** Grund für ein Überspringen (nur wenn matched === false). */
  skippedReason?: "condition_not_met" | "disabled" | "required_field_missing";
  sourceValues: Record<string, unknown>;
  missingRequiredFields: string[];
}

/** Sicherer Lesezugriff über einen punktnotierten Pfad. */
export function readField(situation: SituationCase, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = situation;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isTruthyState(value: unknown): boolean {
  return value === true || value === "known" || value === "yes";
}

function isFalsyState(value: unknown): boolean {
  return value === false || value === "notApplicable" || value === "no";
}

function count(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") return value.trim().length === 0 ? 0 : 1;
  return 0;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function evaluateCondition(situation: SituationCase, condition: AssessmentCondition): boolean {
  const actual = readField(situation, condition.field);
  const expected = condition.value;
  let result = false;

  switch (condition.operator) {
    case "equals":
      result = actual === expected;
      break;
    case "notEquals":
      result = actual !== expected;
      break;
    case "isTrue":
      result = isTruthyState(actual);
      break;
    case "isFalse":
      result = isFalsyState(actual);
      break;
    case "exists":
      result = actual !== undefined && actual !== null && actual !== "";
      break;
    case "notExists":
      result = actual === undefined || actual === null || actual === "";
      break;
    case "includes":
      result = Array.isArray(actual)
        ? actual.includes(expected as never)
        : typeof actual === "string" && typeof expected === "string"
          ? actual.includes(expected)
          : false;
      break;
    case "notIncludes":
      result = !(Array.isArray(actual)
        ? actual.includes(expected as never)
        : typeof actual === "string" && typeof expected === "string"
          ? actual.includes(expected)
          : false);
      break;
    case "greaterThan": {
      const a = toNumber(actual);
      const b = toNumber(expected);
      result = a !== null && b !== null && a > b;
      break;
    }
    case "greaterThanOrEqual": {
      const a = toNumber(actual);
      const b = toNumber(expected);
      result = a !== null && b !== null && a >= b;
      break;
    }
    case "lessThan": {
      const a = toNumber(actual);
      const b = toNumber(expected);
      result = a !== null && b !== null && a < b;
      break;
    }
    case "lessThanOrEqual": {
      const a = toNumber(actual);
      const b = toNumber(expected);
      result = a !== null && b !== null && a <= b;
      break;
    }
    case "isUnknown":
      result = actual === "unknown" || actual === undefined || actual === null;
      break;
    case "isNotApplicable":
      result = actual === "notApplicable";
      break;
    case "countGreaterThan": {
      const b = toNumber(expected);
      result = b !== null && count(actual) > b;
      break;
    }
    case "countEquals": {
      const b = toNumber(expected);
      result = b !== null && count(actual) === b;
      break;
    }
    default:
      result = false;
  }

  return condition.negate ? !result : result;
}

export class AssessmentRuleEvaluator {
  /** Wertet eine einzelne Regel gegen das SituationCase aus. */
  evaluate(situation: SituationCase, rule: AssessmentRule): RuleEvaluation {
    const sourceValues: Record<string, unknown> = {};
    for (const field of new Set([...rule.requiredFields, ...rule.conditions.map((c) => c.field)])) {
      sourceValues[field] = readField(situation, field);
    }

    if (!rule.enabled) {
      return { rule, matched: false, skippedReason: "disabled", sourceValues, missingRequiredFields: [] };
    }

    const missingRequiredFields = rule.requiredFields.filter((field) => {
      const value = readField(situation, field);
      return value === undefined || value === null;
    });
    if (missingRequiredFields.length > 0) {
      return {
        rule,
        matched: false,
        skippedReason: "required_field_missing",
        sourceValues,
        missingRequiredFields,
      };
    }

    const matched = rule.conditions.every((condition) => evaluateCondition(situation, condition));
    return {
      rule,
      matched,
      skippedReason: matched ? undefined : "condition_not_met",
      sourceValues,
      missingRequiredFields: [],
    };
  }

  /** Erzeugt einen verständlichen Bewertungsgrund aus einer zutreffenden Regel. */
  buildReason(evaluation: RuleEvaluation): AssessmentReason {
    const { rule, sourceValues } = evaluation;
    const impact: ReasonImpact =
      rule.result.trafficLightContribution === "red"
        ? "critical"
        : rule.result.trafficLightContribution === "yellow"
          ? "negative"
          : rule.result.trafficLightContribution === "green"
            ? "positive"
            : rule.result.confidenceImpact > 0
              ? "positive"
              : rule.result.confidenceImpact < 0
                ? "negative"
                : "informational";

    return {
      id: `reason_${rule.id}`,
      ruleId: rule.id,
      title: rule.title,
      description: rule.description,
      impact,
      priority: rule.priority,
      sourceFields: rule.conditions.map((c) => c.field),
      sourceValues,
      userFacingText: rule.reasonTemplate,
    };
  }

  /** Lesbare Darstellung eines Quellfelds für Detailansichten. */
  describeField(field: string, value: unknown): string {
    return `${labelForField(field)}: ${String(value)}`;
  }
}
