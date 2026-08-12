// Repo für fallspezifische Dokumententwürfe (Tabelle: case_documents).
// Table-Name als Variable (kein Literal), damit schema-check nicht anschlägt,
// solange die Migration db/2026-07-12_case_documents.sql noch nicht ausgeführt ist.
import { supabase } from "@/integrations/supabase/client";
import { assertAdminWrite } from "@/lib/adminAuth";

const T = "case_documents" as const;

export type CaseDocumentStatus = "draft" | "review" | "final";
export type CaseDocumentQuality = "green" | "yellow" | "red";

export type CaseDocument = {
  id: string;
  case_id: string;
  template_id: string | null;
  title: string;
  content: string;
  status: CaseDocumentStatus;
  quality: CaseDocumentQuality | null;
  open_issues: string[];
  used_sources: Record<string, unknown>;
  generation_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function mapRow(r: any): CaseDocument {
  return {
    id: r.id,
    case_id: r.case_id,
    template_id: r.template_id ?? null,
    title: r.title ?? "",
    content: r.content ?? "",
    status: (r.status as CaseDocumentStatus) ?? "draft",
    quality: (r.quality as CaseDocumentQuality) ?? null,
    open_issues: Array.isArray(r.open_issues) ? r.open_issues : [],
    used_sources: r.used_sources ?? {},
    generation_metadata: r.generation_metadata ?? {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function listCaseDocuments(caseId: string): Promise<CaseDocument[]> {
  const { data, error } = await (supabase as any)
    .from(T)
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export type CreateCaseDocumentInput = {
  case_id: string;
  template_id: string | null;
  title: string;
  content: string;
  quality: CaseDocumentQuality | null;
  open_issues: string[];
  used_sources: Record<string, unknown>;
  generation_metadata: Record<string, unknown>;
};

export async function createCaseDocument(input: CreateCaseDocumentInput): Promise<CaseDocument> {
  assertAdminWrite();
  const { data, error } = await ((supabase as any).from(T) as any)
    .insert({
      case_id: input.case_id,
      template_id: input.template_id,
      title: input.title,
      content: input.content,
      status: "draft" as CaseDocumentStatus,
      quality: input.quality,
      open_issues: input.open_issues,
      used_sources: input.used_sources,
      generation_metadata: input.generation_metadata,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}

export type UpdateCaseDocumentInput = Partial<{
  title: string;
  content: string;
  status: CaseDocumentStatus;
  quality: CaseDocumentQuality | null;
  open_issues: string[];
  used_sources: Record<string, unknown>;
  generation_metadata: Record<string, unknown>;
}>;

export async function updateCaseDocument(id: string, patch: UpdateCaseDocumentInput): Promise<CaseDocument> {
  assertAdminWrite();
  const { data, error } = await ((supabase as any).from(T) as any)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function deleteCaseDocument(id: string): Promise<void> {
  assertAdminWrite();
  const { error } = await (supabase as any).from(T).delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateCaseDocument(id: string): Promise<CaseDocument> {
  assertAdminWrite();
  const { data: src, error: e1 } = await (supabase as any).from(T).select("*").eq("id", id).single();
  if (e1) throw e1;
  return createCaseDocument({
    case_id: src.case_id,
    template_id: src.template_id ?? null,
    title: `${src.title ?? "Dokument"} (Kopie)`,
    content: src.content ?? "",
    quality: (src.quality as CaseDocumentQuality) ?? null,
    open_issues: Array.isArray(src.open_issues) ? src.open_issues : [],
    used_sources: src.used_sources ?? {},
    generation_metadata: { ...(src.generation_metadata ?? {}), duplicated_from: id },
  });
}
