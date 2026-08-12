/**
 * Sprint 4.6H – React-Anbindung des Dokumentationsassistenten.
 * Der Hook spiegelt ausschließlich Service-Ergebnisse; Fachlogik verbleibt
 * in src/services/documentation-assistant. Persistenz über den
 * Navigator-Kontext (context.documentation) – reload-fest.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ACTION_CONTEXT_KEY,
  type ActionContextEntry,
} from "@/services/action-engine";
import {
  ASSISTANT_SELECTED_CASE_KEY,
  type AssistantSelectedCaseContext,
} from "@/services/assistant";
import {
  ASSESSMENT_CONTEXT_KEY,
  type AssessmentContextEntry,
} from "@/services/assessment-engine";
import {
  defaultDocumentationAssistantService,
  defaultDocumentationTemplateFetcher,
  DOCUMENTATION_CONTEXT_KEY,
  resolveDocumentationTemplates,
  toGeneratedDocument,
  type DocumentationAssistantService,
  type DocumentationContextEntry,
  type DocumentationDraft,
  type DocumentationReadiness,
} from "@/services/documentation-assistant";
import {
  defaultLegalContextService,
  LEGAL_CONTEXT_KEY,
} from "@/services/legal-context";
import { SITUATION_CONTEXT_KEY, type SituationCase } from "@/services/situation-analyzer";

export interface UseDocumentationOptions {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
  /** Injizierbar für Tests/Sonderfälle. */
  service?: DocumentationAssistantService;
}

function readSelectedCase(raw: unknown): AssistantSelectedCaseContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as Partial<AssistantSelectedCaseContext>;
  return typeof candidate.caseId === "string" && candidate.caseId.length > 0
    ? (candidate as AssistantSelectedCaseContext)
    : null;
}

export function useDocumentation(options: UseDocumentationOptions) {
  const { navigatorId, workflowId, context, onPatchContext } = options;
  const service = options.service ?? defaultDocumentationAssistantService;

  const situation = (context[SITUATION_CONTEXT_KEY] ?? null) as SituationCase | null;
  const assessment =
    ((context[ASSESSMENT_CONTEXT_KEY] ?? null) as AssessmentContextEntry | null)?.result ?? null;
  const actionPlan =
    ((context[ACTION_CONTEXT_KEY] ?? null) as ActionContextEntry | null)?.plan ?? null;
  const legalContext = useMemo(
    () => defaultLegalContextService.restore(context[LEGAL_CONTEXT_KEY]).entry,
    [context],
  );
  const selectedCase = useMemo(
    () => readSelectedCase(context[ASSISTANT_SELECTED_CASE_KEY]),
    [context],
  );
  const practiceCase = selectedCase
    ? { id: selectedCase.caseId, title: selectedCase.title, version: selectedCase.version }
    : null;
  const category = situation?.category?.trim() || null;

  const stored = useMemo(
    () => service.restore(context[DOCUMENTATION_CONTEXT_KEY]),
    [service, context],
  );
  const entry = stored.entry;

  /* Frisch aufgelöste Vorlagen für die Veraltungserkennung (geteilter Cache). */
  const templatesQ = useQuery({
    queryKey: ["documentation-templates", practiceCase?.id ?? null, category],
    queryFn: async () => {
      const data = await defaultDocumentationTemplateFetcher(practiceCase?.id ?? null);
      return resolveDocumentationTemplates(data, category).templates;
    },
    staleTime: 60_000,
  });

  const parts = useMemo(
    () => ({ navigatorId, workflowId, situation, assessment, actionPlan, legalContext, practiceCase }),
    [navigatorId, workflowId, situation, assessment, actionPlan, legalContext, practiceCase],
  );

  const currentHash = useMemo(
    () =>
      service.computeHash({
        ...parts,
        templates: templatesQ.data ?? entry?.templates ?? [],
      }),
    [service, parts, templatesQ.data, entry],
  );

  const isStale = Boolean(entry && service.isStale(entry, currentHash));
  const staleDraftIds = useMemo(
    () => new Set(entry ? service.staleDrafts(entry, currentHash).map((d) => d.id) : []),
    [entry, service, currentHash],
  );

  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(stored.error);

  /** Bereitet die Phase vor bzw. übernimmt den aktuellen Stand (Entwürfe bleiben erhalten). */
  const prepare = useCallback(async () => {
    setPreparing(true);
    try {
      const { entry: next } = await service.prepare({
        ...parts,
        category,
        existing: entry ?? undefined,
      });
      onPatchContext({ [DOCUMENTATION_CONTEXT_KEY]: next });
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Die Dokumentvorlagen konnten nicht geladen werden.",
      );
    } finally {
      setPreparing(false);
    }
  }, [service, parts, category, entry, onPatchContext]);

  /* Erstbefüllung beim Öffnen der Phase (nur mit erfasstem Sachverhalt). */
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (entry || attemptedRef.current || !situation) return;
    attemptedRef.current = true;
    void prepare();
  }, [entry, situation, prepare]);

  const generate = useCallback(
    (templateId: string) => {
      if (!entry) return;
      try {
        const { entry: next } = service.generateDraft(entry, templateId, parts);
        onPatchContext({ [DOCUMENTATION_CONTEXT_KEY]: next });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Der Entwurf konnte nicht erzeugt werden.");
      }
    },
    [entry, service, parts, onPatchContext],
  );

  const updateDraft = useCallback(
    (draftId: string, markdown: string) => {
      if (!entry) return;
      try {
        onPatchContext({
          [DOCUMENTATION_CONTEXT_KEY]: service.updateDraft(entry, draftId, markdown),
        });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Der Entwurf konnte nicht gespeichert werden.");
      }
    },
    [entry, service, onPatchContext],
  );

  const removeDraft = useCallback(
    (draftId: string) => {
      if (!entry) return;
      onPatchContext({ [DOCUMENTATION_CONTEXT_KEY]: service.removeDraft(entry, draftId) });
    },
    [entry, service, onPatchContext],
  );

  /** Export über die bestehende Export-Registry (Adapter dynamisch geladen). */
  const exportDraft = useCallback(
    async (draftId: string, format: "md" | "docx" | "pdf") => {
      const draft = entry?.drafts.find((d) => d.id === draftId);
      if (!draft || !entry) return;
      try {
        const { getExportAdapter } = await import("@/services/document-generation/export");
        const adapter = getExportAdapter(format);
        const result = await adapter.export(
          toGeneratedDocument(draft, { navigatorId, legalContext }),
        );
        const bytes = result.bytes;
        const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: result.contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        service.markExported(draftId, format);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Der Export ist fehlgeschlagen.");
      }
    },
    [entry, navigatorId, legalContext, service],
  );

  const readinessByTemplate = useMemo(() => {
    const map = new Map<string, DocumentationReadiness>();
    for (const r of entry?.readiness ?? []) map.set(r.templateId, r.readiness);
    return map;
  }, [entry]);

  return {
    entry,
    templates: entry?.templates ?? [],
    readinessByTemplate,
    drafts: (entry?.drafts ?? []) as DocumentationDraft[],
    hasSituation: Boolean(situation),
    overall: service.readinessOf(
      entry ?? {
        schemaVersion: 1,
        inputHash: "",
        caseId: null,
        templates: [],
        readiness: [],
        drafts: [],
        preparedAt: "",
        updatedAt: "",
      },
      Boolean(situation),
    ),
    preparing,
    loading: !entry && preparing,
    error,
    isStale,
    staleDraftIds,
    refresh: prepare,
    generate,
    updateDraft,
    removeDraft,
    exportDraft,
  };
}

export type DocumentationController = ReturnType<typeof useDocumentation>;
