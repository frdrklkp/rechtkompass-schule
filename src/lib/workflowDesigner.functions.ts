/**
 * Sprint 4.3D – Redaktionelle Server-Funktionen für den Workflow Designer.
 *
 * Alle Aufrufe laufen unter `requireSupabaseAuth`; die RLS-Policies
 * (`is_editor()`) gewährleisten, dass nur berechtigte Rollen schreiben.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SupabaseWorkflowTemplateRepository,
} from "@/services/legal-workflows/SupabaseWorkflowTemplateRepository";
import { SupabaseWorkflowTemplateWriter } from "@/services/legal-workflows/SupabaseWorkflowTemplateWriter";
import { WorkflowValidator, WorkflowError } from "@/services/legal-workflows";
import type { WorkflowTemplate, WorkflowTemplateVersion, WorkflowValidationReport } from "@/services/legal-workflows/types";

export const listAllTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ templates: WorkflowTemplate[] }> => {
    const repo = new SupabaseWorkflowTemplateRepository(context.supabase);
    const templates = await repo.listAll();
    return { templates };
  });

export const getTemplateForDesigner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ template: WorkflowTemplate }> => {
    const repo = new SupabaseWorkflowTemplateRepository(context.supabase);
    const tpl = await repo.getById(data.id);
    if (!tpl) throw new WorkflowError("not_found", "Template nicht gefunden.");
    return { template: tpl };
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    slug: string; title: string; subtitle?: string | null;
    description?: string | null; categoryId?: string | null;
    publicationTier?: "internal" | "public";
  }) => data)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const writer = new SupabaseWorkflowTemplateWriter(context.supabase);
    return writer.create(data);
  });

export const saveTemplateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { template: WorkflowTemplate }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const writer = new SupabaseWorkflowTemplateWriter(context.supabase);
    await writer.saveDraft(data.template);
    return { ok: true };
  });

export const validateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ report: WorkflowValidationReport }> => {
    const repo = new SupabaseWorkflowTemplateRepository(context.supabase);
    const tpl = await repo.getById(data.id);
    if (!tpl) throw new WorkflowError("not_found", "Template nicht gefunden.");
    return { report: WorkflowValidator.validate(tpl) };
  });

export const publishTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ versionId: string; version: number }> => {
    const repo = new SupabaseWorkflowTemplateRepository(context.supabase);
    const writer = new SupabaseWorkflowTemplateWriter(context.supabase);
    const tpl = await repo.getById(data.id);
    if (!tpl) throw new WorkflowError("not_found", "Template nicht gefunden.");
    const report = WorkflowValidator.validate(tpl);
    if (!report.valid) {
      throw new WorkflowError(
        "validation_failed",
        `Template nicht valide: ${report.issues[0]?.message ?? "unbekannt"}`,
      );
    }
    const snapshot: WorkflowTemplate = { ...tpl, workflowStatus: "published" };
    const version = await repo.createVersion(tpl.id, snapshot);
    await writer.setCurrentVersion(tpl.id, version.id);
    await writer.setStatus(tpl.id, "published");
    return { versionId: version.id, version: version.version };
  });

export const archiveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const writer = new SupabaseWorkflowTemplateWriter(context.supabase);
    await writer.setStatus(data.id, "archived");
    return { ok: true };
  });

export const reactivateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const writer = new SupabaseWorkflowTemplateWriter(context.supabase);
    await writer.setStatus(data.id, "draft");
    return { ok: true };
  });

export const duplicateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; newSlug: string; newTitle: string }) => data)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const repo = new SupabaseWorkflowTemplateRepository(context.supabase);
    const writer = new SupabaseWorkflowTemplateWriter(context.supabase);
    const src = await repo.getById(data.id);
    if (!src) throw new WorkflowError("not_found", "Template nicht gefunden.");
    const { id: newId } = await writer.create({
      slug: data.newSlug,
      title: data.newTitle,
      subtitle: src.subtitle,
      description: src.description,
      categoryId: src.categoryId,
      publicationTier: src.publicationTier,
    });
    const clone = deepCloneWithNewIds(src, newId);
    await writer.saveDraft(clone);
    return { id: newId };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const repo = new SupabaseWorkflowTemplateRepository(context.supabase);
    const writer = new SupabaseWorkflowTemplateWriter(context.supabase);
    const tpl = await repo.getById(data.id);
    if (!tpl) throw new WorkflowError("not_found", "Template nicht gefunden.");
    if (tpl.workflowStatus === "published") {
      throw new WorkflowError(
        "forbidden",
        "Publizierte Templates können nicht gelöscht werden. Bitte zuerst archivieren.",
      );
    }
    await writer.remove(data.id);
    return { ok: true };
  });

export const listTemplateVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ versions: WorkflowTemplateVersion[] }> => {
    const repo = new SupabaseWorkflowTemplateRepository(context.supabase);
    const versions = await repo.listVersions(data.id);
    return { versions };
  });

export const importTemplateJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { json: string }) => data)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    let parsed: unknown;
    try { parsed = JSON.parse(data.json); }
    catch { throw new WorkflowError("invalid_input", "Ungültiges JSON."); }
    const container = parsed as { template?: WorkflowTemplate };
    const tpl = container.template ?? (parsed as WorkflowTemplate);
    if (!tpl?.title || !Array.isArray(tpl.phases)) {
      throw new WorkflowError("invalid_input", "Kein gültiges Workflow-Template.");
    }
    const writer = new SupabaseWorkflowTemplateWriter(context.supabase);
    const suffix = Math.random().toString(36).slice(2, 7);
    const { id: newId } = await writer.create({
      slug: `${tpl.slug ?? "workflow"}-${suffix}`,
      title: tpl.title,
      subtitle: tpl.subtitle,
      description: tpl.description,
      categoryId: tpl.categoryId ?? null,
      publicationTier: tpl.publicationTier ?? "internal",
    });
    const clone = deepCloneWithNewIds(tpl, newId);
    await writer.saveDraft(clone);
    return { id: newId };
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newId(): string {
  return (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`);
}

function deepCloneWithNewIds(src: WorkflowTemplate, newTemplateId: string): WorkflowTemplate {
  const stepIdMap = new Map<string, string>();
  const phases = src.phases.map((p) => {
    const newPhaseId = newId();
    const steps = p.steps.map((s) => {
      const newStepId = newId();
      stepIdMap.set(s.id, newStepId);
      return { ...s, id: newStepId, templateId: newTemplateId, phaseId: newPhaseId };
    });
    // dependsOn IDs remappen + neue Child-IDs
    for (const s of steps) {
      s.dependsOn = (s.dependsOn ?? []).map((d) => stepIdMap.get(d) ?? d);
      s.checklists = s.checklists.map((c) => ({ ...c, id: newId() }));
      s.documents = s.documents.map((d) => ({ ...d, id: newId() }));
      s.roles = s.roles.map((r) => ({ ...r, id: newId() }));
      s.sources = s.sources.map((sr) => ({ ...sr, id: newId() }));
    }
    return { ...p, id: newPhaseId, templateId: newTemplateId, steps };
  });
  return {
    ...src,
    id: newTemplateId,
    phases,
    rules: src.rules.map((r) => ({ ...r, id: newId(), templateId: newTemplateId })),
    workflowStatus: "draft",
    currentVersionId: null,
  };
}
