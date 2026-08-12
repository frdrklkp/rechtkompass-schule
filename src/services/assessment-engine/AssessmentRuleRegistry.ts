/**
 * Sprint 4.6C – Registry der Bewertungsregeln.
 * Hält Regeln sortiert nach Priorität und prüft ihre Definition.
 */
import type { AssessmentRule, AssessmentValidationIssue, RulePriority } from "./types";

const PRIORITY_ORDER: Record<RulePriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class AssessmentRuleRegistry {
  private rules = new Map<string, AssessmentRule>();

  constructor(rules: AssessmentRule[] = []) {
    for (const rule of rules) this.register(rule);
  }

  register(rule: AssessmentRule): void {
    this.rules.set(rule.id, rule);
  }

  unregister(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  get(ruleId: string): AssessmentRule | undefined {
    return this.rules.get(ruleId);
  }

  /** Deterministische Reihenfolge: Priorität, danach Regel-ID. */
  list(): AssessmentRule[] {
    return [...this.rules.values()].sort((a, b) => {
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return p !== 0 ? p : a.id.localeCompare(b.id);
    });
  }

  listEnabled(): AssessmentRule[] {
    return this.list().filter((r) => r.enabled);
  }

  size(): number {
    return this.rules.size;
  }

  /** Strukturprüfung der registrierten Regeln (keine fachliche Prüfung). */
  validateDefinitions(): AssessmentValidationIssue[] {
    const issues: AssessmentValidationIssue[] = [];
    for (const rule of this.rules.values()) {
      if (!rule.id) {
        issues.push({ code: "rule_definition_invalid", message: "Eine Regel besitzt keine Kennung." });
        continue;
      }
      if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
        issues.push({
          code: "rule_definition_invalid",
          message: `Die Regel „${rule.id}“ besitzt keine Bedingungen.`,
          field: rule.id,
        });
      }
      if (!rule.result || !rule.result.trafficLightContribution) {
        issues.push({
          code: "rule_definition_invalid",
          message: `Die Regel „${rule.id}“ besitzt kein gültiges Ergebnis.`,
          field: rule.id,
        });
      }
      if (!rule.reasonTemplate) {
        issues.push({
          code: "rule_definition_invalid",
          message: `Die Regel „${rule.id}“ besitzt keinen verständlichen Bewertungsgrund.`,
          field: rule.id,
        });
      }
      for (const condition of rule.conditions ?? []) {
        if (!condition.field) {
          issues.push({
            code: "rule_definition_invalid",
            message: `Die Regel „${rule.id}“ enthält eine Bedingung ohne Feld.`,
            field: rule.id,
          });
        }
      }
    }
    return issues;
  }
}
