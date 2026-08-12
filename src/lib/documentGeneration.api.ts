/** Sprint 4.5A – Browser-Client für Session-Dokumente. */
import { supabase } from "@/integrations/supabase/client";
import type { DocumentTemplateInput, GeneratedDocument } from "@/services/document-generation";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Bitte zuerst anmelden.");
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
    throw new Error((body && (body.error as string)) || `Fehler ${res.status}`);
  }
  return body as T;
}
function safeJson(t: string) { try { return JSON.parse(t); } catch { return null; } }

export const DocumentGenerationApi = {
  list: (sessionId: string) =>
    api<{ documents: GeneratedDocument[]; templates: DocumentTemplateInput[] }>(
      `/api/workflow-sessions/${sessionId}/documents`,
    ),
  generate: (sessionId: string, templateSlug: string, school?: string, actorDisplayName?: string) =>
    api<{ document: GeneratedDocument }>(`/api/workflow-sessions/${sessionId}/documents`, {
      method: "POST",
      body: JSON.stringify({ templateSlug, school, actorDisplayName }),
    }),
  regenerate: (sessionId: string, docId: string, school?: string, actorDisplayName?: string) =>
    api<{ document: GeneratedDocument }>(`/api/workflow-sessions/${sessionId}/documents/${docId}`, {
      method: "POST",
      body: JSON.stringify({ school, actorDisplayName }),
    }),
  update: (sessionId: string, docId: string, patch: { markdown?: string; title?: string; status?: "manual" }) =>
    api<{ document: GeneratedDocument }>(`/api/workflow-sessions/${sessionId}/documents/${docId}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  remove: (sessionId: string, docId: string) =>
    api<{ ok: boolean }>(`/api/workflow-sessions/${sessionId}/documents/${docId}`, {
      method: "DELETE",
    }),
  async download(sessionId: string, docId: string, format: "md" | "docx" | "pdf") {
    const headers = { ...(await authHeader()) };
    const res = await fetch(
      `/api/workflow-sessions/${sessionId}/documents/${docId}/export?format=${format}`,
      { headers },
    );
    if (!res.ok) {
      const t = await res.text();
      const j = safeJson(t);
      throw new Error((j && (j.error as string)) || `Export fehlgeschlagen (${res.status})`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") ?? "";
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] ?? `dokument.${format}`;
    return { blob, filename };
  },
};
