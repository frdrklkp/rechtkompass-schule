/**
 * Sprint 4.3C – React-Query-Hooks für die Workflow-Runtime.
 * Halten Cache-Invalidierung, Toasts und Telemetrie zentral.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WorkflowApi, humanizeApiError } from "@/lib/workflowApi";
import { workflowTelemetry } from "@/services/legal-workflows/telemetry";
import type { WorkflowStepStatus } from "@/services/legal-workflows/types";

export const workflowKeys = {
  all: ["workflows"] as const,
  catalog: () => [...workflowKeys.all, "catalog"] as const,
  template: (id: string) => [...workflowKeys.all, "template", id] as const,
  sessions: () => [...workflowKeys.all, "sessions"] as const,
  session: (id: string) => [...workflowKeys.all, "session", id] as const,
  events: (id: string) => [...workflowKeys.all, "events", id] as const,
};

export function useWorkflowCatalog() {
  return useQuery({
    queryKey: workflowKeys.catalog(),
    queryFn: async () => {
      const r = await WorkflowApi.listTemplates();
      workflowTelemetry.emit({ event: "workflow_catalog_loaded", detail: { count: r.templates.length } });
      return r.templates;
    },
    staleTime: 30_000,
  });
}

export function useWorkflowTemplate(id: string | undefined) {
  return useQuery({
    queryKey: id ? workflowKeys.template(id) : ["workflow", "template", "none"],
    queryFn: async () => {
      if (!id) return null;
      const r = await WorkflowApi.getTemplate(id);
      workflowTelemetry.emit({ event: "workflow_detail_loaded", templateId: id });
      return r.template;
    },
    enabled: !!id,
  });
}

export function useWorkflowSessions() {
  return useQuery({
    queryKey: workflowKeys.sessions(),
    queryFn: async () => (await WorkflowApi.listSessions()).sessions,
  });
}

export function useWorkflowSession(id: string | undefined) {
  return useQuery({
    queryKey: id ? workflowKeys.session(id) : ["workflow", "session", "none"],
    queryFn: async () => {
      if (!id) return null;
      const r = await WorkflowApi.getSession(id);
      workflowTelemetry.emit({ event: "workflow_runtime_opened", sessionId: id });
      return r;
    },
    enabled: !!id,
    refetchOnWindowFocus: false,
  });
}

export function useWorkflowEvents(id: string | undefined) {
  return useQuery({
    queryKey: id ? workflowKeys.events(id) : ["workflow", "events", "none"],
    queryFn: async () => (id ? (await WorkflowApi.listEvents(id)).events : []),
    enabled: !!id,
  });
}

function useInvalidateSession() {
  const qc = useQueryClient();
  return async (id: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: workflowKeys.session(id) }),
      qc.invalidateQueries({ queryKey: workflowKeys.events(id) }),
      qc.invalidateQueries({ queryKey: workflowKeys.sessions() }),
    ]);
  };
}

function handleErr(err: unknown, fallback: string) {
  const msg = humanizeApiError(err) || fallback;
  toast.error(msg);
  workflowTelemetry.emit({ event: "workflow_runtime_error", detail: { message: msg } });
}

export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { templateId?: string; templateSlug?: string; context?: Record<string, unknown> }) =>
      WorkflowApi.createSession(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: workflowKeys.sessions() });
      toast.success("Workflow gestartet.");
    },
    onError: (err) => handleErr(err, "Start fehlgeschlagen."),
  });
}

export function useTransitionStep(sessionId: string) {
  const invalidate = useInvalidateSession();
  return useMutation({
    mutationFn: (input: { stepId: string; to: WorkflowStepStatus; note?: string }) =>
      WorkflowApi.transitionStep(sessionId, input.stepId, input.to, input.note),
    onSuccess: async () => {
      await invalidate(sessionId);
    },
    onError: (err) => handleErr(err, "Statusänderung fehlgeschlagen."),
  });
}

export function useToggleChecklist(sessionId: string) {
  const invalidate = useInvalidateSession();
  return useMutation({
    mutationFn: (input: { stepId: string; itemId: string; done: boolean }) =>
      WorkflowApi.toggleChecklist(sessionId, input.stepId, input.itemId, input.done),
    onSuccess: async () => {
      await invalidate(sessionId);
    },
    onError: (err) => handleErr(err, "Checkliste konnte nicht aktualisiert werden."),
  });
}

export function usePauseSession(sessionId: string) {
  const invalidate = useInvalidateSession();
  return useMutation({
    mutationFn: () => WorkflowApi.pause(sessionId),
    onSuccess: async () => { await invalidate(sessionId); toast.success("Workflow pausiert."); },
    onError: (err) => handleErr(err, "Pausieren fehlgeschlagen."),
  });
}

export function useResumeSession(sessionId: string) {
  const invalidate = useInvalidateSession();
  return useMutation({
    mutationFn: () => WorkflowApi.resume(sessionId),
    onSuccess: async () => { await invalidate(sessionId); toast.success("Workflow fortgesetzt."); },
    onError: (err) => handleErr(err, "Fortsetzen fehlgeschlagen."),
  });
}

export function useCancelSession(sessionId: string) {
  const invalidate = useInvalidateSession();
  return useMutation({
    mutationFn: (reason?: string) => WorkflowApi.cancel(sessionId, reason),
    onSuccess: async () => { await invalidate(sessionId); toast.success("Workflow beendet."); },
    onError: (err) => handleErr(err, "Beenden fehlgeschlagen."),
  });
}
