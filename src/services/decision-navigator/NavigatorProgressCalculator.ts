/**
 * Sprint 4.6A – Fortschrittsberechnung des Decision Navigators.
 */
import type { NavigatorProgress, NavigatorStepDefinition } from "./types";

export class NavigatorProgressCalculator {
  static calculate(
    steps: NavigatorStepDefinition[],
    processedIds: Set<string>,
    currentStep: string | null,
  ): NavigatorProgress {
    const visible = steps.filter((s) => s.visible !== false);
    const total = visible.length;
    const processed = visible.filter((s) => processedIds.has(s.id)).length;
    return {
      totalSteps: total,
      processedSteps: processed,
      openSteps: Math.max(0, total - processed),
      percent: total === 0 ? 0 : Math.round((processed / total) * 100),
      currentStep,
      lastStep: total > 0 ? visible[total - 1].id : null,
    };
  }
}
