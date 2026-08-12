/**
 * Sprint 4.6D – Fortschrittsberechnung des Maßnahmenplans.
 * Nur sichtbare und relevante Maßnahmen werden berücksichtigt.
 */
import type { ActionItem, ActionProgress } from "./types";

const CLOSED: ActionItem["status"][] = ["completed", "skipped", "notApplicable"];

export class ActionProgressCalculator {
  calculate(actions: ActionItem[]): ActionProgress {
    const relevant = actions.filter((a) => a.visible && a.status !== "cancelled");
    const required = relevant.filter((a) => a.required);
    const optional = relevant.filter((a) => !a.required);

    const completed = relevant.filter((a) => a.status === "completed");
    const skipped = relevant.filter((a) => a.status === "skipped" || a.status === "notApplicable");
    const blocked = relevant.filter((a) => a.status === "blocked");
    const open = relevant.filter((a) => a.status === "open" || a.status === "inProgress");

    const requiredClosed = required.filter((a) => CLOSED.includes(a.status));

    const completionPercentage =
      relevant.length === 0
        ? 0
        : Math.round(((completed.length + skipped.length) / relevant.length) * 100);
    const requiredCompletionPercentage =
      required.length === 0 ? 100 : Math.round((requiredClosed.length / required.length) * 100);

    const isComplete =
      relevant.length > 0 &&
      required.every((a) => CLOSED.includes(a.status)) &&
      !required.some((a) => a.status === "blocked");

    return {
      totalActions: relevant.length,
      requiredActions: required.length,
      optionalActions: optional.length,
      completedActions: completed.length,
      openActions: open.length,
      blockedActions: blocked.length,
      skippedActions: skipped.length,
      completionPercentage,
      requiredCompletionPercentage,
      isComplete,
    };
  }

  /** Gründe, die einen Abschluss der Phase verhindern. */
  blockingReasons(actions: ActionItem[]): string[] {
    return actions
      .filter((a) => a.visible && a.required && !CLOSED.includes(a.status) && a.status !== "cancelled")
      .map((a) =>
        a.status === "blocked"
          ? `„${a.title}“ ist blockiert: ${a.blockedReason ?? "Voraussetzung fehlt."}`
          : `„${a.title}“ ist noch offen.`,
      );
  }
}
