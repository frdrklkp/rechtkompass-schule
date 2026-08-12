/**
 * Sprint 4.6D – Deterministische Auswertung von Handlungsregeln.
 * Zugriff ausschließlich über typisierte Feldpfade. Kein eval, keine dynamischen Strings.
 */
import type { ActionCondition, ActionInput, ActionRule } from "./types";

export interface ActionRuleEvaluation {
  rule: ActionRule;
  matched: boolean;
  skippedReason?:
    | "disabled"
    | "condition_not_met"
    | "required_field_missing"
    | "assessment_status_not_allowed";
  sourceValues: Record<string, unknown>;
  missingRequiredFields: string[];
}

/** Sicherer Lesezugriff über einen punktnotierten Pfad. */
export function readPath(root: unknown, path: string): unknown {
  if (!path) return root;
  const parts = path.split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function sourceRoot(input: ActionInput, source: ActionCondition["source"]): unknown {
  if (source === "situation") return input.situation;
  if (source === "assessment") return input.assessment;
  return input.actionContext;
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

export function evaluateActionCondition(input: ActionInput, condition: ActionCondition): boolean {
  const root = sourceRoot(input, condition.source);
  const actual = readPath(root, condition.field);
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
    case "trafficLightIs":
      result = input.assessment.trafficLight === expected;
      break;
    case "severityIs":
      result = input.assessment.severity === expected;
      break;
    case "confidenceLevelIs":
      result = input.assessment.confidence.level === expected;
      break;
    case "assessmentStatusIs":
      result = input.assessment.status === expected;
      break;
    case "ruleMatched":
      result = input.assessment.matchedRules.some((r) => r.ruleId === expected);
      break;
    case "reasonExists":
      result = input.assessment.reasons.some(
        (r) => r.id === expected || r.ruleId === expected,
      );
      break;
    default:
      result = false;
  }

  return condition.negate ? !result : result;
}

export class ActionRuleEvaluator {
  evaluate(input: ActionInput, rule: ActionRule): ActionRuleEvaluation {
    const sourceValues: Record<string, unknown> = {};
    for (const condition of rule.conditions) {
      sourceValues[`${condition.source}.${condition.field}`] = readPath(
        sourceRoot(input, condition.source),
        condition.field,
      );
    }
    for (const field of rule.requiredFields) {
      sourceValues[`situation.${field}`] = readPath(input.situation, field);
    }

    if (!rule.enabled) {
      return { rule, matched: false, skippedReason: "disabled", sourceValues, missingRequiredFields: [] };
    }

    if (
      rule.requiredAssessmentStatus.length > 0 &&
      !rule.requiredAssessmentStatus.includes(input.assessment.status)
    ) {
      return {
        rule,
        matched: false,
        skippedReason: "assessment_status_not_allowed",
        sourceValues,
        missingRequiredFields: [],
      };
    }

    const missingRequiredFields = rule.requiredFields.filter((field) => {
      const value = readPath(input.situation, field);
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

    const matched = rule.conditions.every((condition) => evaluateActionCondition(input, condition));
    return {
      rule,
      matched,
      skippedReason: matched ? undefined : "condition_not_met",
      sourceValues,
      missingRequiredFields: [],
    };
  }
}
