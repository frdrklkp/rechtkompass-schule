import { supabase } from "@/integrations/supabase/client";
import { assertAdminWrite } from "@/lib/adminAuth";

export type TemplateMeta = {
  description: string | null;
  formFields: Array<{ name: string; label: string; type: string; placeholder?: string }>;
};

export type DocTemplate = {
  id: string;
  title: string;
  description: string | null;
  slug: string | null;
  created_at: string;
  meta: {
    type: string;
    body: string;
    caseIds: string[];
    formFields: TemplateMeta["formFields"];
  };
};

function parseFields(fields: unknown): TemplateMeta {
  if (Array.isArray(fields)) {
    return { description: null, formFields: fields as TemplateMeta["formFields"] };
  }
  if (fields && typeof fields === "object") {
    const f = fields as Record<string, unknown>;
    return {
      description: typeof f.description === "string" ? f.description : null,
      formFields: Array.isArray(f.formFields)
        ? (f.formFields as TemplateMeta["formFields"])
        : [],
    };
  }
  return { description: null, formFields: [] };
}

function mapRow(r: any, caseIds: string[] = []): DocTemplate {
  const meta = parseFields(r.fields);
  return {
    id: r.id,
    title: r.title ?? "",
    description: meta.description,
    slug: null,
    created_at: r.created_at,
    meta: {
      type: r.template_type ?? "",
      body: r.body ?? "",
      caseIds,
      formFields: meta.formFields,
    },
  };
}

async function fetchLinksByTemplate(): Promise<Map<string, string[]>> {
  const { data, error } = await (supabase as any).from("case_templates").select("template_id, case_id");
  if (error) throw error;
  const m = new Map<string, string[]>();
  (data ?? []).forEach((r: any) => {
    const list = m.get(r.template_id) ?? [];
    list.push(r.case_id);
    m.set(r.template_id, list);
  });
  return m;
}

export async function listDocTemplates(): Promise<DocTemplate[]> {
  const [rowsRes, links] = await Promise.all([
    supabase.from("document_templates").select("*").order("title"),
    fetchLinksByTemplate(),
  ]);
  if (rowsRes.error) throw rowsRes.error;
  return (rowsRes.data ?? []).map((r: any) => mapRow(r, links.get(r.id) ?? []));
}

export async function listTemplatesForCase(caseId: string): Promise<DocTemplate[]> {
  const { data: linkRows, error: linkErr } = await (supabase as any)
    .from("case_templates")
    .select("template_id")
    .eq("case_id", caseId);

  if (linkErr) throw linkErr;
  const ids = (linkRows ?? []).map((r: any) => r.template_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("document_templates")
    .select("*")
    .in("id", ids)
    .order("title");
  if (error) throw error;
  return (data ?? []).map((r: any) => mapRow(r, [caseId]));
}

export type TemplateInput = {
  title: string;
  description: string | null;
  slug?: string | null;
  type: string;
  body: string;
  caseIds: string[];
};

function buildFields(input: TemplateInput, existing?: TemplateMeta) {
  return {
    description: input.description,
    formFields: existing?.formFields ?? [],
  };
}

async function syncCaseLinks(templateId: string, caseIds: string[]) {
  const { data: existing, error: exErr } = await (supabase as any)
    .from("case_templates")
    .select("id, case_id")
    .eq("template_id", templateId);
  if (exErr) throw exErr;
  const existingIds = new Set((existing ?? []).map((r: any) => r.case_id));
  const desired = new Set(caseIds);

  const toDelete = (existing ?? []).filter((r: any) => !desired.has(r.case_id));
  const toInsert = caseIds.filter((id) => !existingIds.has(id));

  if (toDelete.length) {
    const { error } = await (supabase as any)
      .from("case_templates")
      .delete()
      .in(
        "id",
        toDelete.map((r: any) => r.id),
      );
    if (error) throw error;

  }
  if (toInsert.length) {
    const { error } = await ((supabase as any).from("case_templates") as any).insert(
      toInsert.map((case_id) => ({ template_id: templateId, case_id })),
    );
    if (error) throw error;
  }
}

export async function createDocTemplate(input: TemplateInput): Promise<DocTemplate> {
  assertAdminWrite();
  const payload = {
    title: input.title,
    template_type: input.type || null,
    body: input.body || null,
    fields: buildFields(input),
  };
  if (import.meta.env.DEV) {
    console.log("[templatesRepo] INSERT document_templates", payload);
  }
  const { data, error } = await (supabase.from("document_templates") as any)
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    console.error("[templatesRepo] insert error", error);
    throw error;
  }
  await syncCaseLinks(data.id, input.caseIds);
  return mapRow(data, input.caseIds);
}

export async function updateDocTemplate(id: string, input: TemplateInput): Promise<DocTemplate> {
  assertAdminWrite();
  const existing = await supabase
    .from("document_templates")
    .select("fields")
    .eq("id", id)
    .maybeSingle();
  const existingMeta = parseFields(existing.data?.fields as unknown);
  const payload = {
    title: input.title,
    template_type: input.type || null,
    body: input.body || null,
    fields: buildFields(input, existingMeta),
  };
  if (import.meta.env.DEV) {
    console.log("[templatesRepo] UPDATE document_templates", id, payload);
  }
  const { data, error } = await (supabase.from("document_templates") as any)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("[templatesRepo] update error", error);
    throw error;
  }
  await syncCaseLinks(id, input.caseIds);
  return mapRow(data, input.caseIds);
}

export async function deleteDocTemplate(id: string): Promise<void> {
  assertAdminWrite();
  await (supabase as any).from("case_templates").delete().eq("template_id", id);
  const { error } = await supabase.from("document_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function setTemplateCases(id: string, caseIds: string[]): Promise<void> {
  assertAdminWrite();
  await syncCaseLinks(id, caseIds);
}
