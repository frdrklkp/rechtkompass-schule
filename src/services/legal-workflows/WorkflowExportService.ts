/**
 * Export von Templates und Sessions als portables JSON (versionierbar).
 * Keine PII in Session-Exports – nur Ids, Status und Zeitmarken.
 */
import type {
  WorkflowExecutionSession,
  WorkflowTemplate,
} from "./types";

export const WorkflowExportService = {
  exportTemplate(tpl: WorkflowTemplate): string {
    return JSON.stringify({ kind: "workflow_template", version: 1, template: tpl }, null, 2);
  },

  exportSessionAudit(session: WorkflowExecutionSession): string {
    // PII-frei: keine Freitextnotizen exportieren.
    const sanitized: WorkflowExecutionSession = {
      ...session,
      steps: session.steps.map((s) => ({
        ...s,
        note: null,
        checklistState: s.checklistState.map((c) => ({ ...c, note: undefined, by: undefined })),
      })),
    };
    return JSON.stringify({ kind: "workflow_session_audit", version: 1, session: sanitized }, null, 2);
  },
};
