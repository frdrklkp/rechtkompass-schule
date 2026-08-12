/**
 * Sprint 4.3C – Browser-Client für die Workflow-REST-API.
 * Kapselt Bearer-Auth und JSON-Fehlerbehandlung. Keine Businesslogik.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  WorkflowExecutionSession,
  WorkflowEvent,
  WorkflowProgress,
  WorkflowRecommendation,
  WorkflowStepStatus,
  WorkflowTemplate,
} from "@/services/legal-workflows/types";

export interface WorkflowCatalogItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  publicationTier: "internal" | "public";
  currentVersionId: string | null;
  phaseCount: number;
  stepCount: number;
}

export interface WorkflowApiError extends Error {
  status: number;
  code?: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    const err = new Error("Bitte zuerst anmelden.") as WorkflowApiError;
    err.status = 401;
    throw err;
  }
  return { Authorization: `Bearer ${token}` };
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = new Error(
      (body && (body.error as string)) || `Anfrage fehlgeschlagen (${res.status}).`,
    ) as WorkflowApiError;
    err.status = res.status;
    err.code = body?.code;
    throw err;
  }
  return body as T;
}

function safeJson(t: string): { error?: string; code?: string; [k: string]: unknown } | null {
  try { return JSON.parse(t); } catch { return null; }
}

export const WorkflowApi = {
  listTemplates: () => api<{ templates: WorkflowCatalogItem[] }>("/api/workflows"),
  getTemplate: (id: string) => api<{ template: WorkflowTemplate }>(`/api/workflows/${id}`),
  listSessions: () => api<{ sessions: WorkflowExecutionSession[] }>("/api/workflow-sessions"),
  createSession: (input: { templateId?: string; templateSlug?: string; context?: Record<string, unknown> }) =>
    api<{ session: WorkflowExecutionSession }>("/api/workflow-sessions", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getSession: (id: string) =>
    api<{
      session: WorkflowExecutionSession;
      template: WorkflowTemplate;
      progress: WorkflowProgress;
      recommendations: WorkflowRecommendation[];
    }>(`/api/workflow-sessions/${id}`),
  listEvents: (id: string) =>
    api<{ events: WorkflowEvent[] }>(`/api/workflow-sessions/${id}/events`),
  transitionStep: (id: string, stepId: string, to: WorkflowStepStatus, note?: string) =>
    api<{ session: WorkflowExecutionSession }>(`/api/workflow-sessions/${id}/transitions`, {
      method: "POST",
      body: JSON.stringify({ stepId, to, note }),
    }),
  toggleChecklist: (id: string, stepId: string, itemId: string, done: boolean) =>
    api<{ session: WorkflowExecutionSession }>(`/api/workflow-sessions/${id}/checklists`, {
      method: "POST",
      body: JSON.stringify({ stepId, itemId, done }),
    }),
  pause: (id: string) =>
    api<{ session: WorkflowExecutionSession }>(`/api/workflow-sessions/${id}/pause`, { method: "POST" }),
  resume: (id: string) =>
    api<{ session: WorkflowExecutionSession }>(`/api/workflow-sessions/${id}/resume`, { method: "POST" }),
  cancel: (id: string, reason?: string) =>
    api<{ session: WorkflowExecutionSession }>(`/api/workflow-sessions/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? "" }),
    }),
};

export function humanizeApiError(err: unknown): string {
  const e = err as WorkflowApiError | undefined;
  if (!e) return "Unbekannter Fehler.";
  switch (e.status) {
    case 401: return "Bitte melden Sie sich an, um Workflows auszuführen.";
    case 403: return "Sie haben keinen Zugriff auf diese Aktion.";
    case 404: return "Der gewünschte Workflow wurde nicht gefunden.";
    case 409: return e.message || "Diese Aktion ist im aktuellen Zustand nicht möglich.";
    case 503: return "Die Workflow-Plattform ist derzeit deaktiviert.";
    default: return e.message || "Es ist ein Fehler aufgetreten.";
  }
}
