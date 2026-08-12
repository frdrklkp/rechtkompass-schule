/**
 * Sprint 4.6D – Konflikterkennung im Maßnahmenplan.
 * Konflikte werden sichtbar gemacht und nicht stillschweigend aufgelöst.
 */
import type {
  ActionConflict,
  ActionInput,
  ActionItem,
} from "./types";

export class ActionConflictDetector {
  detect(
    actions: ActionItem[],
    rawActions: ActionItem[],
    cycles: string[][],
    input: ActionInput,
  ): ActionConflict[] {
    const conflicts: ActionConflict[] = [];

    for (const cycle of cycles) {
      conflicts.push({
        id: `conflict_cycle_${cycle.join("_")}`,
        type: "dependency_cycle",
        description: `Die Maßnahmen bilden eine zyklische Abhängigkeit: ${cycle.join(" → ")}. Es kann keine sinnvolle Reihenfolge bestimmt werden.`,
        actionKeys: cycle,
        ruleIds: [],
        blocksPlan: true,
      });
    }

    // Doppelte Maßnahmen mit abweichender Priorität oder Zeitgruppe.
    const grouped = new Map<string, ActionItem[]>();
    for (const action of rawActions) {
      grouped.set(action.actionKey, [...(grouped.get(action.actionKey) ?? []), action]);
    }
    for (const [key, items] of grouped) {
      if (items.length < 2) continue;
      const priorities = new Set(items.map((i) => i.priority));
      const groups = new Set(items.map((i) => i.group));
      if (priorities.size > 1 || groups.size > 1) {
        conflicts.push({
          id: `conflict_duplicate_${key}`,
          type: "duplicate_priority_mismatch",
          description: `Mehrere Regeln schlagen „${items[0].title}“ mit unterschiedlicher Priorität oder Zeitgruppe vor. Übernommen wurde die höchste Priorität und die früheste Zeitgruppe.`,
          actionKeys: [key],
          ruleIds: [...new Set(items.map((i) => i.ruleId))],
          blocksPlan: false,
        });
      }
    }

    for (const action of actions) {
      // Verpflichtend und gleichzeitig als nicht zutreffend geführt.
      if (action.required && action.status === "notApplicable" && !action.completionData.justification) {
        conflicts.push({
          id: `conflict_required_na_${action.actionKey}`,
          type: "required_and_not_applicable",
          description: `„${action.title}“ ist als verpflichtend vorgesehen, wurde aber ohne Begründung als nicht zutreffend markiert.`,
          actionKeys: [action.actionKey],
          ruleIds: action.ruleIds,
          blocksPlan: false,
        });
      }

      // Zuständigkeitskonflikt: mehrere gleichrangige Rollen ohne führende Rolle.
      if (action.responsibleRole === "unknown" && action.alternativeResponsibleRoles.length > 1) {
        conflicts.push({
          id: `conflict_role_${action.actionKey}`,
          type: "responsibility_conflict",
          description: `Für „${action.title}“ kommen mehrere Rollen infrage. Die Zuständigkeit muss schulintern geklärt werden.`,
          actionKeys: [action.actionKey],
          ruleIds: action.ruleIds,
          blocksPlan: false,
        });
      }

      // Maßnahme verweist auf einen Bewertungsgrund, den es nicht gibt.
      const unknownReasonIds = action.trigger.assessmentReasonIds.filter(
        (id) => !input.assessment.reasons.some((r) => r.id === id || r.ruleId === id),
      );
      if (unknownReasonIds.length > 0) {
        conflicts.push({
          id: `conflict_reason_${action.actionKey}`,
          type: "missing_assessment_reason",
          description: `„${action.title}“ verweist auf einen Bewertungsgrund, der in der aktuellen Bewertung nicht vorhanden ist.`,
          actionKeys: [action.actionKey],
          ruleIds: action.ruleIds,
          blocksPlan: false,
        });
      }
    }

    // Widersprüchliche Maßnahmen: als „nicht zutreffend“ und gleichzeitig offen verpflichtend
    // aus derselben Regel erzeugte Gegensätze werden über Metadaten markiert.
    for (const action of actions) {
      const contradicts = (action.metadata.contradicts as string[] | undefined) ?? [];
      for (const other of contradicts) {
        if (actions.some((a) => a.actionKey === other)) {
          conflicts.push({
            id: `conflict_contradiction_${action.actionKey}_${other}`,
            type: "contradictory_actions",
            description: `„${action.title}“ und eine weitere vorgeschlagene Maßnahme schließen sich gegenseitig aus.`,
            actionKeys: [action.actionKey, other],
            ruleIds: action.ruleIds,
            blocksPlan: true,
          });
        }
      }
    }

    return conflicts;
  }
}
