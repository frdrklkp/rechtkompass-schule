/**
 * Sprint 4.5A – Supabase-Adapter für erzeugte Dokumente pro Session.
 * RLS erzwingt Ownership. Table: public.workflow_session_documents.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateGeneratedDocumentInput,
  UpdateGeneratedDocumentInput,
  WorkflowSessionDocumentRepositoryPort,
} from "./WorkflowSessionDocumentRepository";
import type { GeneratedDocument, MissingPlaceholder, DocumentGenerationStatus } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

const T = "workflow_session_documents";

interface Row {
  id: string;
  session_id: string;
  template_id: string | null;
  template_slug: string;
  step_id: string | null;
  title: string;
  markdown: string;
  status: string;
  workflow_version_id: string | null;
  used_context: Record<string, unknown> | null;
  missing_placeholders: MissingPlaceholder[] | null;
  generation_metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toDoc(r: Row): GeneratedDocument {
  return {
    id: r.id,
    sessionId: r.session_id,
    templateId: r.template_id,
    templateSlug: r.template_slug,
    stepId: r.step_id,
    title: r.title,
    markdown: r.markdown,
    status: (r.status as DocumentGenerationStatus) ?? "draft",
    workflowVersionId: r.workflow_version_id,
    usedContext: r.used_context ?? {},
    missingPlaceholders: Array.isArray(r.missing_placeholders) ? r.missing_placeholders : [],
    generationMetadata: r.generation_metadata ?? {},
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class SupabaseWorkflowSessionDocumentRepository implements WorkflowSessionDocumentRepositoryPort {
  constructor(private readonly db: LooseClient) {}

  async listBySession(sessionId: string): Promise<GeneratedDocument[]> {
    const { data, error } = await this.db
      .from(T)
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as Row[]).map(toDoc);
  }

  async getById(id: string): Promise<GeneratedDocument | null> {
    const { data, error } = await this.db.from(T).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toDoc(data as Row) : null;
  }

  async create(i: CreateGeneratedDocumentInput): Promise<GeneratedDocument> {
    const { data, error } = await this.db
      .from(T)
      .insert({
        session_id: i.sessionId,
        template_id: i.templateId,
        template_slug: i.templateSlug,
        step_id: i.stepId,
        title: i.title,
        markdown: i.markdown,
        status: i.status,
        workflow_version_id: i.workflowVersionId,
        used_context: i.usedContext,
        missing_placeholders: i.missingPlaceholders,
        generation_metadata: i.generationMetadata,
        created_by: i.createdBy,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toDoc(data as Row);
  }

  async update(id: string, i: UpdateGeneratedDocumentInput): Promise<GeneratedDocument> {
    const patch: Record<string, unknown> = {};
    if (i.markdown !== undefined) patch.markdown = i.markdown;
    if (i.status !== undefined) patch.status = i.status;
    if (i.usedContext !== undefined) patch.used_context = i.usedContext;
    if (i.missingPlaceholders !== undefined) patch.missing_placeholders = i.missingPlaceholders;
    if (i.generationMetadata !== undefined) patch.generation_metadata = i.generationMetadata;
    if (i.title !== undefined) patch.title = i.title;
    const { data, error } = await this.db.from(T).update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return toDoc(data as Row);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from(T).delete().eq("id", id);
    if (error) throw error;
  }
}
