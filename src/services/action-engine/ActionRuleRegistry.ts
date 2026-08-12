/**
 * Sprint 4.6D – Registry der Handlungsregeln.
 * Deterministische Reihenfolge: Priorität, danach Regel-ID.
 */
import { ACTION_PRIORITY_ORDER, type ActionRule } from "./types";
import { djb2, stableStringify } from "@/services/assessment-engine";

export class ActionRuleRegistry {
  private rules: ActionRule[] = [];

  constructor(rules: ActionRule[] = []) {
    for (const rule of rules) this.register(rule);
  }

  register(rule: ActionRule): void {
    if (!rule.id || typeof rule.id !== "string") {
      throw new Error("Eine Handlungsregel benötigt eine eindeutige ID.");
    }
    if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
      throw new Error(`Die Handlungsregel „${rule.id}“ definiert keine Maßnahmen.`);
    }
    if (this.rules.some((r) => r.id === rule.id)) {
      throw new Error(`Die Handlungsregel „${rule.id}“ ist bereits registriert.`);
    }
    this.rules.push(rule);
    this.sort();
  }

  unregister(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  get(ruleId: string): ActionRule | undefined {
    return this.rules.find((r) => r.id === ruleId);
  }

  list(): ActionRule[] {
    return [...this.rules];
  }

  listEnabled(): ActionRule[] {
    return this.rules.filter((r) => r.enabled);
  }

  /** Hash über alle Regeldefinitionen – erkennt geänderte Regelstände. */
  versionHash(): string {
    return djb2(
      stableStringify(
        this.rules.map((r) => ({ id: r.id, version: r.version, enabled: r.enabled, actions: r.actions })),
      ),
    );
  }

  private sort(): void {
    this.rules.sort((a, b) => {
      const p = ACTION_PRIORITY_ORDER[a.priority] - ACTION_PRIORITY_ORDER[b.priority];
      return p !== 0 ? p : a.id.localeCompare(b.id);
    });
  }
}
