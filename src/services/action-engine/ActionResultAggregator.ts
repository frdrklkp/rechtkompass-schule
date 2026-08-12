/**
 * Sprint 4.6D – Deterministische Zusammenführung erzeugter Maßnahmen.
 * Gleiche fachliche IDs werden zusammengeführt: höchste Priorität und früheste
 * Zeitgruppe gewinnen, verpflichtend überstimmt optional, Begründungen bleiben erhalten.
 */
import {
  ACTION_GROUP_ORDER,
  ACTION_PRIORITY_ORDER,
  type ActionItem,
  type ActionGroup,
  type ActionPriority,
} from "./types";

function earliestGroup(a: ActionGroup, b: ActionGroup): ActionGroup {
  return ACTION_GROUP_ORDER.indexOf(a) <= ACTION_GROUP_ORDER.indexOf(b) ? a : b;
}

function highestPriority(a: ActionPriority, b: ActionPriority): ActionPriority {
  return ACTION_PRIORITY_ORDER[a] <= ACTION_PRIORITY_ORDER[b] ? a : b;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export class ActionResultAggregator {
  /** Führt Maßnahmen mit gleicher `actionKey` zusammen. */
  merge(actions: ActionItem[]): ActionItem[] {
    const byKey = new Map<string, ActionItem>();
    const order: string[] = [];

    for (const action of actions) {
      const existing = byKey.get(action.actionKey);
      if (!existing) {
        byKey.set(action.actionKey, { ...action });
        order.push(action.actionKey);
        continue;
      }
      const merged: ActionItem = {
        ...existing,
        group: earliestGroup(existing.group, action.group),
        priority: highestPriority(existing.priority, action.priority),
        required: existing.required || action.required,
        ruleIds: unique([...existing.ruleIds, ...action.ruleIds]),
        reason: [...existing.reason, ...action.reason].filter(
          (r, i, arr) => arr.findIndex((o) => o.ruleId === r.ruleId && o.userFacingText === r.userFacingText) === i,
        ),
        alternativeResponsibleRoles: unique([
          ...existing.alternativeResponsibleRoles,
          ...action.alternativeResponsibleRoles,
          ...(action.responsibleRole !== existing.responsibleRole ? [action.responsibleRole] : []),
        ]),
        dependencies: unique([...existing.dependencies, ...action.dependencies]),
        blocks: unique([...existing.blocks, ...action.blocks]),
        prerequisites: [...existing.prerequisites, ...action.prerequisites].filter(
          (p, i, arr) => arr.findIndex((o) => o.type === p.type && o.reference === p.reference) === i,
        ),
        sourceFields: unique([...existing.sourceFields, ...action.sourceFields]),
        documentationRequired: existing.documentationRequired || action.documentationRequired,
        confirmationRequired: existing.confirmationRequired || action.confirmationRequired,
        allowSkip: existing.allowSkip && action.allowSkip,
        allowNotApplicable: existing.allowNotApplicable && action.allowNotApplicable,
        trigger: {
          ...existing.trigger,
          assessmentRuleIds: unique([
            ...existing.trigger.assessmentRuleIds,
            ...action.trigger.assessmentRuleIds,
          ]),
          assessmentReasonIds: unique([
            ...existing.trigger.assessmentReasonIds,
            ...action.trigger.assessmentReasonIds,
          ]),
          sourceFields: unique([...existing.trigger.sourceFields, ...action.trigger.sourceFields]),
        },
      };
      byKey.set(action.actionKey, merged);
    }

    return order.map((key) => byKey.get(key)!);
  }

  /** Stabile Sortierung: Zeitgruppe, Priorität, Regelreihenfolge, Titel. */
  sort(actions: ActionItem[]): ActionItem[] {
    return [...actions].sort((a, b) => {
      const g = ACTION_GROUP_ORDER.indexOf(a.group) - ACTION_GROUP_ORDER.indexOf(b.group);
      if (g !== 0) return g;
      const p = ACTION_PRIORITY_ORDER[a.priority] - ACTION_PRIORITY_ORDER[b.priority];
      if (p !== 0) return p;
      const r = a.ruleId.localeCompare(b.ruleId);
      if (r !== 0) return r;
      return a.title.localeCompare(b.title, "de");
    });
  }

  aggregate(actions: ActionItem[]): ActionItem[] {
    return this.sort(this.merge(actions));
  }
}
