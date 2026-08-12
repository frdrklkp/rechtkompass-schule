/** Sprint 4.5A – React-Query-Hooks für Session-Dokumente. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DocumentGenerationApi } from "@/lib/documentGeneration.api";
import { docGenTelemetry } from "@/services/document-generation";

export const documentKeys = {
  all: ["session-documents"] as const,
  bySession: (id: string) => ["session-documents", id] as const,
};

export function useSessionDocuments(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId ? documentKeys.bySession(sessionId) : ["session-documents", "none"],
    queryFn: async () => (sessionId ? DocumentGenerationApi.list(sessionId) : null),
    enabled: !!sessionId,
    staleTime: 15_000,
  });
}

export function useGenerateDocument(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { templateSlug: string; school?: string; actorDisplayName?: string }) =>
      DocumentGenerationApi.generate(sessionId, input.templateSlug, input.school, input.actorDisplayName),
    onSuccess: async (res, vars) => {
      await qc.invalidateQueries({ queryKey: documentKeys.bySession(sessionId) });
      toast.success(`Dokument „${res.document.title}“ erzeugt.`);
      docGenTelemetry.emit({
        event: "document_generated",
        sessionId, templateSlug: vars.templateSlug,
        documentId: res.document.id,
      });
    },
    onError: (err) => toast.error((err as Error).message || "Erzeugung fehlgeschlagen."),
  });
}

export function useRegenerateDocument(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { docId: string; school?: string; actorDisplayName?: string }) =>
      DocumentGenerationApi.regenerate(sessionId, input.docId, input.school, input.actorDisplayName),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: documentKeys.bySession(sessionId) });
      toast.success("Dokument neu erzeugt.");
      docGenTelemetry.emit({
        event: "document_regenerated",
        sessionId, documentId: res.document.id, templateSlug: res.document.templateSlug,
      });
    },
    onError: (err) => toast.error((err as Error).message || "Regenerierung fehlgeschlagen."),
  });
}

export function useUpdateDocument(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { docId: string; markdown?: string; title?: string; status?: "manual" }) =>
      DocumentGenerationApi.update(sessionId, input.docId, {
        markdown: input.markdown, title: input.title, status: input.status,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: documentKeys.bySession(sessionId) });
    },
    onError: (err) => toast.error((err as Error).message || "Speichern fehlgeschlagen."),
  });
}

export function useDeleteDocument(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => DocumentGenerationApi.remove(sessionId, docId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: documentKeys.bySession(sessionId) });
      toast.success("Dokument entfernt.");
    },
    onError: (err) => toast.error((err as Error).message || "Löschen fehlgeschlagen."),
  });
}
