/**
 * Sprint 4.5A – Port für Dokumentvorlagen der Workflow-Schritte.
 * Nutzt bestehende `document_templates` + `workflow_step_documents`.
 * KEINE Parallelstruktur, KEIN Seed.
 */
import type { WorkflowRuntimeContext } from "@/services/legal-workflows";
import type { DocumentAiFieldSpec, DocumentTemplateInput } from "./types";

export interface DocumentTemplateRepositoryPort {
  /** Alle im Workflow verlinkten Vorlagen zurückgeben (dedupliziert nach slug). */
  listForRuntime(runtime: WorkflowRuntimeContext): Promise<DocumentTemplateInput[]>;
}

interface RawDocTemplateRow {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  markdown_body: string | null;
  document_type: string | null;
  fields: unknown;
}

function extractAiFields(fields: unknown): DocumentAiFieldSpec[] {
  if (!fields || typeof fields !== "object") return [];
  const obj = fields as Record<string, unknown>;
  const raw = Array.isArray(obj.aiFields)
    ? obj.aiFields
    : Array.isArray(obj.ai_fields)
      ? obj.ai_fields
      : [];
  const out: DocumentAiFieldSpec[] = [];
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const placeholder = typeof r.placeholder === "string" ? r.placeholder : null;
    const prompt = typeof r.prompt === "string" ? r.prompt : null;
    if (!placeholder || !prompt) continue;
    const scope = Array.isArray(r.contextScope)
      ? (r.contextScope.filter((s) => typeof s === "string") as DocumentAiFieldSpec["contextScope"])
      : undefined;
    out.push({ placeholder, prompt, contextScope: scope });
  }
  return out;
}

function mapRow(r: RawDocTemplateRow, sortOrder: number): DocumentTemplateInput {
  return {
    id: r.id,
    slug: r.slug ?? r.id,
    title: r.title,
    description: r.description,
    documentType: r.document_type ?? extractDocumentType(r.fields),
    markdownBody: r.markdown_body ?? extractLegacyBody(r.fields),
    sortOrder,
    aiFields: extractAiFields(r.fields),
  };
}

function extractLegacyBody(fields: unknown): string {
  if (fields && typeof fields === "object") {
    const f = fields as Record<string, unknown>;
    if (typeof f.markdown_body === "string") return f.markdown_body;
    if (typeof f.body === "string") return f.body;
  }
  return "";
}
function extractDocumentType(fields: unknown): string | null {
  if (fields && typeof fields === "object") {
    const f = fields as Record<string, unknown>;
    if (typeof f.document_type === "string") return f.document_type;
    if (typeof f.type === "string") return f.type;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (t: string) => any };

export class SupabaseDocumentTemplateRepository implements DocumentTemplateRepositoryPort {
  constructor(private readonly db: LooseClient) {}

  async listForRuntime(runtime: WorkflowRuntimeContext): Promise<DocumentTemplateInput[]> {
    const slugs = new Set<string>();
    for (const p of runtime.template.phases) {
      for (const s of p.steps) {
        for (const d of s.documents) {
          if (d.templateSlug) slugs.add(d.templateSlug);
        }
      }
    }
    if (slugs.size === 0) return [];
    const list = Array.from(slugs);
    const { data, error } = await this.db
      .from("document_templates")
      .select("id, slug, title, description, markdown_body, document_type, fields")
      .in("slug", list);
    if (error) throw error;
    const bySlug = new Map<string, RawDocTemplateRow>();
    for (const row of (data ?? []) as RawDocTemplateRow[]) {
      if (row.slug) bySlug.set(row.slug, row);
    }
    return list
      .map((slug, i) => {
        const row = bySlug.get(slug);
        if (!row) return null;
        return mapRow(row, i);
      })
      .filter((v): v is DocumentTemplateInput => v !== null);
  }
}

export class InMemoryDocumentTemplateRepository implements DocumentTemplateRepositoryPort {
  constructor(private readonly templates: DocumentTemplateInput[]) {}
  async listForRuntime(runtime: WorkflowRuntimeContext): Promise<DocumentTemplateInput[]> {
    const slugs = new Set<string>();
    for (const p of runtime.template.phases) {
      for (const s of p.steps) {
        for (const d of s.documents) if (d.templateSlug) slugs.add(d.templateSlug);
      }
    }
    return this.templates
      .filter((t) => slugs.has(t.slug))
      .map((t, i) => ({ ...t, sortOrder: i }));
  }
}
