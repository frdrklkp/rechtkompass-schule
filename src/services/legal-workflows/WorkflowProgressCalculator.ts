/** Deterministische Fortschrittsberechnung. */
import type { WorkflowExecutionSession, WorkflowProgress, WorkflowTemplate } from "./types";

export const WorkflowProgressCalculator = {
  compute(tpl: WorkflowTemplate, session: WorkflowExecutionSession): WorkflowProgress {
    const statusById = new Map(session.steps.map((s) => [s.stepId, s.status]));
    let allTotal = 0, allDone = 0, reqOpen = 0, remainingMin = 0;
    const phases: WorkflowProgress["phases"] = [];

    for (const phase of tpl.phases) {
      let total = 0, done = 0, phaseReqOpen = 0;
      for (const step of phase.steps) {
        total++;
        const st = statusById.get(step.id) ?? "open";
        const isTerminal = st === "completed" || st === "skipped";
        if (isTerminal) done++;
        if (!isTerminal && step.isRequired) {
          phaseReqOpen++;
          reqOpen++;
          if (step.estimatedMinutes) remainingMin += step.estimatedMinutes;
        }
      }
      allTotal += total;
      allDone += done;
      phases.push({
        phaseId: phase.id,
        percent: total ? Math.round((done / total) * 100) : 0,
        requiredOpen: phaseReqOpen,
      });
    }

    return {
      workflowPercent: allTotal ? Math.round((allDone / allTotal) * 100) : 0,
      requiredOpenSteps: reqOpen,
      estimatedRemainingMinutes: remainingMin,
      phases,
    };
  },
};
