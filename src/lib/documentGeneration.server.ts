/**
 * Sprint 4.5A – Server-Bootstrap für Dokumentgenerierung.
 * Baut Service + Repositories aus einem authenticated Supabase-Client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DocumentGenerationService,
  SupabaseDocumentTemplateRepository,
  SupabaseWorkflowSessionDocumentRepository,
} from "@/services/document-generation";
import { WorkflowContextBuilder, WorkflowError } from "@/services/legal-workflows";
import type { WorkflowRepositoryPort } from "@/services/legal-workflows";
import type { SupabaseWorkflowTemplateRepository } from "@/services/legal-workflows/SupabaseWorkflowTemplateRepository";
import { versionLockedTemplateRepo } from "@/services/legal-workflows/SupabaseWorkflowTemplateRepository";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

export interface DocGenBundle {
  service: DocumentGenerationService;
  documents: SupabaseWorkflowSessionDocumentRepository;
  templates: SupabaseDocumentTemplateRepository;
}

export function buildDocGenBundle(supabase: LooseClient): DocGenBundle {
  const documents = new SupabaseWorkflowSessionDocumentRepository(supabase);
  const templates = new SupabaseDocumentTemplateRepository(supabase);
  const service = new DocumentGenerationService({ documents });
  return { service, documents, templates };
}

/** Lädt Session + versionsgepinnten Template-Snapshot + Runtime-Kontext. */
export async function loadRuntimeForSession(input: {
  sessionId: string;
  userId: string;
  sessions: WorkflowRepositoryPort;
  templateRepo: SupabaseWorkflowTemplateRepository;
}) {
  const session = await input.sessions.getSession(input.sessionId);
  if (!session) throw new WorkflowError("not_found", "Session nicht gefunden.");
  if (session.userId !== input.userId) throw new WorkflowError("forbidden", "Kein Zugriff auf diese Session.");
  const scoped = session.templateVersionId
    ? versionLockedTemplateRepo(input.templateRepo, {
        templateId: session.templateId,
        versionId: session.templateVersionId,
      })
    : input.templateRepo;
  const tpl = await scoped.getById(session.templateId);
  if (!tpl) throw new WorkflowError("not_found", "Workflow-Vorlage nicht gefunden.");
  const runtime = WorkflowContextBuilder.build(tpl, session);
  return { session, template: tpl, runtime };
}
