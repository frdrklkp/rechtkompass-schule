/** Aggregierte Statistiken über Sessions und Events – ohne PII. */
import type { WorkflowEvent, WorkflowExecutionSession } from "./types";

export interface WorkflowSessionStats {
  total: number;
  running: number;
  paused: number;
  completed: number;
  cancelled: number;
  averageCompletionMinutes: number;
}

export const WorkflowStatistics = {
  sessions(sessions: WorkflowExecutionSession[]): WorkflowSessionStats {
    let running = 0, paused = 0, completed = 0, cancelled = 0;
    const durations: number[] = [];
    for (const s of sessions) {
      if (s.status === "running") running++;
      else if (s.status === "paused") paused++;
      else if (s.status === "completed") completed++;
      else if (s.status === "cancelled") cancelled++;
      if (s.status === "completed" && s.startedAt && s.completedAt) {
        const d = new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
        if (d > 0) durations.push(d);
      }
    }
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    return {
      total: sessions.length,
      running, paused, completed, cancelled,
      averageCompletionMinutes: Math.round(avg / 60000),
    };
  },

  eventCountsByType(events: WorkflowEvent[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of events) out[e.eventType] = (out[e.eventType] ?? 0) + 1;
    return out;
  },
};
