/**
 * Sprint 4.6D – Auflösung von Abhängigkeiten und Voraussetzungen.
 * Erkennt Blockierungen und zyklische Abhängigkeiten.
 */
import type { ActionItem, ActionMissingPrerequisite } from "./types";

export interface DependencyResolution {
  actions: ActionItem[];
  missingPrerequisites: ActionMissingPrerequisite[];
  cycles: string[][];
}

function isDone(status: ActionItem["status"]): boolean {
  return status === "completed" || status === "skipped" || status === "notApplicable";
}

export class ActionDependencyResolver {
  /** Findet zyklische Abhängigkeiten über `dependencies` (actionKey-Referenzen). */
  detectCycles(actions: ActionItem[]): string[][] {
    const byKey = new Map(actions.map((a) => [a.actionKey, a]));
    const cycles: string[][] = [];
    const state = new Map<string, "visiting" | "done">();
    const stack: string[] = [];

    const visit = (key: string): void => {
      const current = state.get(key);
      if (current === "done") return;
      if (current === "visiting") {
        const start = stack.indexOf(key);
        cycles.push([...stack.slice(start), key]);
        return;
      }
      state.set(key, "visiting");
      stack.push(key);
      for (const dep of byKey.get(key)?.dependencies ?? []) {
        if (byKey.has(dep)) visit(dep);
      }
      stack.pop();
      state.set(key, "done");
    };

    for (const action of actions) visit(action.actionKey);
    return cycles;
  }

  /**
   * Setzt Blockierungen, füllt `blocks` und meldet fehlende Voraussetzungen.
   * Erledigte oder bewusst geschlossene Maßnahmen bleiben unverändert.
   */
  resolve(actions: ActionItem[]): DependencyResolution {
    const byKey = new Map(actions.map((a) => [a.actionKey, a]));
    const cycles = this.detectCycles(actions);
    const cyclicKeys = new Set(cycles.flat());
    const missingPrerequisites: ActionMissingPrerequisite[] = [];

    const resolved = actions.map((action) => {
      const next: ActionItem = { ...action, blocks: [], blockedReason: null };
      return next;
    });
    const resolvedByKey = new Map(resolved.map((a) => [a.actionKey, a]));

    for (const action of resolved) {
      for (const dep of action.dependencies) {
        const target = resolvedByKey.get(dep);
        if (target) target.blocks = [...new Set([...target.blocks, action.actionKey])];
      }
    }

    for (const action of resolved) {
      if (cyclicKeys.has(action.actionKey)) {
        action.status = "blocked";
        action.blockedReason =
          "Diese Maßnahme ist Teil einer widersprüchlichen Abhängigkeitskette und kann nicht freigegeben werden.";
        continue;
      }

      const openDependencies = action.dependencies
        .map((key) => byKey.get(key))
        .filter((dep): dep is ActionItem => Boolean(dep) && !isDone(dep!.status));

      const unfulfilledPrerequisites = action.prerequisites.filter((p) => !p.fulfilled);

      for (const prerequisite of unfulfilledPrerequisites) {
        missingPrerequisites.push({
          actionKey: action.actionKey,
          actionTitle: action.title,
          reference: prerequisite.reference,
          label: prerequisite.label,
          reason: `Für „${action.title}“ fehlt noch: ${prerequisite.label}.`,
        });
      }

      if (isDone(action.status) || action.status === "cancelled") continue;

      if (openDependencies.length > 0 || unfulfilledPrerequisites.length > 0) {
        action.status = "blocked";
        const parts: string[] = [];
        if (openDependencies.length > 0) {
          parts.push(
            `Zuerst abzuschließen: ${openDependencies.map((d) => `„${d.title}“`).join(", ")}`,
          );
        }
        if (unfulfilledPrerequisites.length > 0) {
          parts.push(`Fehlende Voraussetzung: ${unfulfilledPrerequisites.map((p) => p.label).join(", ")}`);
        }
        action.blockedReason = parts.join(" · ");
      } else if (action.status === "blocked") {
        action.status = "open";
        action.blockedReason = null;
      }
    }

    return { actions: resolved, missingPrerequisites, cycles };
  }
}
