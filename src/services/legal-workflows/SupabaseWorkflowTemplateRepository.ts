/**
 * Sprint 4.3B – Supabase-Adapter für Workflow-Templates.
 * Die workflow_* Tabellen sind (noch) nicht in den generierten Supabase-Typen
 * enthalten; wir arbeiten daher mit einem locker getypten Client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { WorkflowError } from "./errors";
import { WorkflowMapper, type FlatTemplateRows } from "./WorkflowMapper";
import type { WorkflowTemplateRepositoryPort } from "./WorkflowTemplateRepository";
import { workflowTelemetry } from "./telemetry";
import type {
  WorkflowTemplate,
  WorkflowTemplateVersion,
} from "./types";

// Workflow-Tabellen liegen außerhalb der generierten Types; Client absichtlich locker getypt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    workflowTelemetry.emit({
      event: "workflow_storage_latency",
      durationMs: Date.now() - t0,
      detail: { op: label },
    });
    return r;
  } catch (err) {
    workflowTelemetry.emit({
      event: "workflow_transaction_failed",
      detail: { op: label, message: (err as Error).message },
    });
    throw err;
  }
}

export class SupabaseWorkflowTemplateRepository implements WorkflowTemplateRepositoryPort {
  private db: LooseClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(supabase: SupabaseClient<any, any, any>) { this.db = supabase; }

  async listPublished(): Promise<WorkflowTemplate[]> {
    return timed("templates.listPublished", async () => {
      const { data, error } = await this.db
        .from("workflow_templates")
        .select("id")
        .eq("workflow_status", "published");
      if (error) throw new WorkflowError("not_found", error.message);
      const out: WorkflowTemplate[] = [];
      for (const row of (data ?? []) as Array<{ id: string }>) {
        const tpl = await this.getById(row.id);
        if (tpl) out.push(tpl);
      }
      return out;
    });
  }

  async listAll(): Promise<WorkflowTemplate[]> {
    return timed("templates.listAll", async () => {
      const { data, error } = await this.db.from("workflow_templates").select("id");
      if (error) throw new WorkflowError("not_found", error.message);
      const out: WorkflowTemplate[] = [];
      for (const row of (data ?? []) as Array<{ id: string }>) {
        const tpl = await this.getById(row.id);
        if (tpl) out.push(tpl);
      }
      return out;
    });
  }

  async getById(id: string): Promise<WorkflowTemplate | null> {
    return timed("templates.getById", async () => {
      const rows = await this.loadFlat({ id });
      if (!rows) return null;
      workflowTelemetry.emit({ event: "workflow_repository_loaded", templateId: id, detail: { source: "flat" } });
      return WorkflowMapper.fromFlat(rows);
    });
  }

  async getBySlug(slug: string): Promise<WorkflowTemplate | null> {
    return timed("templates.getBySlug", async () => {
      const rows = await this.loadFlat({ slug });
      if (!rows) return null;
      workflowTelemetry.emit({
        event: "workflow_repository_loaded",
        templateId: rows.template.id,
        detail: { source: "flat", slug },
      });
      return WorkflowMapper.fromFlat(rows);
    });
  }

  async saveDraft(): Promise<WorkflowTemplate> {
    throw new WorkflowError("forbidden",
      "SupabaseWorkflowTemplateRepository ist read-only. Redaktion erfolgt über den Designer.");
  }

  async createVersion(templateId: string, snapshot: WorkflowTemplate): Promise<WorkflowTemplateVersion> {
    return timed("templates.createVersion", async () => {
      const { data: last } = await this.db
        .from("workflow_template_versions")
        .select("version")
        .eq("template_id", templateId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = ((last as { version?: number } | null)?.version ?? 0) + 1;
      const { data, error } = await this.db
        .from("workflow_template_versions")
        .insert({ template_id: templateId, version: nextVersion, snapshot })
        .select("id, template_id, version, snapshot, created_at")
        .single();
      if (error || !data) throw new WorkflowError("invalid_state", error?.message ?? "createVersion fehlgeschlagen");
      const d = data as { id: string; template_id: string; version: number; snapshot: unknown; created_at: string };
      return {
        id: d.id, templateId: d.template_id, version: d.version,
        snapshot: d.snapshot as WorkflowTemplate, createdAt: d.created_at,
      };
    });
  }

  async listVersions(templateId: string): Promise<WorkflowTemplateVersion[]> {
    return timed("templates.listVersions", async () => {
      const { data, error } = await this.db
        .from("workflow_template_versions")
        .select("id, template_id, version, snapshot, created_at")
        .eq("template_id", templateId)
        .order("version", { ascending: true });
      if (error) throw new WorkflowError("not_found", error.message);
      const rows = (data ?? []) as Array<{ id: string; template_id: string; version: number; snapshot: unknown; created_at: string }>;
      return rows.map((r) => ({
        id: r.id, templateId: r.template_id, version: r.version,
        snapshot: r.snapshot as WorkflowTemplate, createdAt: r.created_at,
      }));
    });
  }

  async getByVersionId(versionId: string): Promise<WorkflowTemplate | null> {
    return timed("templates.getByVersionId", async () => {
      const { data, error } = await this.db
        .from("workflow_template_versions")
        .select("snapshot, template_id")
        .eq("id", versionId)
        .maybeSingle();
      if (error) throw new WorkflowError("not_found", error.message);
      if (!data) return null;
      const d = data as { snapshot: unknown; template_id: string };
      workflowTelemetry.emit({
        event: "workflow_repository_loaded",
        templateId: d.template_id,
        detail: { source: "version_snapshot", versionId },
      });
      return d.snapshot as WorkflowTemplate;
    });
  }

  private async loadFlat(sel: { id?: string; slug?: string }): Promise<FlatTemplateRows | null> {
    const q = this.db.from("workflow_templates").select(
      "id, category_id, slug, title, subtitle, description, workflow_status, publication_tier, current_version_id",
    );
    const { data: tpl, error } = sel.id
      ? await q.eq("id", sel.id).maybeSingle()
      : await q.eq("slug", sel.slug!).maybeSingle();
    if (error) throw new WorkflowError("not_found", error.message);
    if (!tpl) return null;
    const templateId = (tpl as { id: string }).id;

    const [phases, steps, deps, checks, docs, roles, sources, rules] = await Promise.all([
      this.db.from("workflow_phases").select("*").eq("template_id", templateId),
      this.db.from("workflow_steps").select("*").eq("template_id", templateId),
      this.db.from("workflow_step_dependencies")
        .select("step_id, depends_on_step_id, workflow_steps!inner(template_id)")
        .eq("workflow_steps.template_id", templateId),
      this.db.from("workflow_step_checklists")
        .select("id, step_id, sort_order, title, is_required, workflow_steps!inner(template_id)")
        .eq("workflow_steps.template_id", templateId),
      this.db.from("workflow_step_documents")
        .select("id, step_id, template_slug, title, note, workflow_steps!inner(template_id)")
        .eq("workflow_steps.template_id", templateId),
      this.db.from("workflow_step_roles")
        .select("id, step_id, role, can_edit, can_complete, workflow_steps!inner(template_id)")
        .eq("workflow_steps.template_id", templateId),
      this.db.from("workflow_step_sources")
        .select("id, step_id, legal_section_id, citation_hint, note, workflow_steps!inner(template_id)")
        .eq("workflow_steps.template_id", templateId),
      this.db.from("workflow_rules").select("*").eq("template_id", templateId),
    ]);

    const strip = (rows: unknown[] | null): Record<string, unknown>[] =>
      (rows ?? []).map((r) => {
        const { workflow_steps: _ignore, ...rest } = r as Record<string, unknown>;
        return rest;
      });

    return {
      template: tpl as FlatTemplateRows["template"],
      phases: (phases.data ?? []) as FlatTemplateRows["phases"],
      steps: (steps.data ?? []) as FlatTemplateRows["steps"],
      dependencies: strip(deps.data) as FlatTemplateRows["dependencies"],
      checklists: strip(checks.data) as FlatTemplateRows["checklists"],
      documents: strip(docs.data) as FlatTemplateRows["documents"],
      roles: strip(roles.data) as FlatTemplateRows["roles"],
      sources: strip(sources.data) as FlatTemplateRows["sources"],
      rules: (rules.data ?? []) as FlatTemplateRows["rules"],
    };
  }
}

/**
 * Version-Pinning: wrappt ein Template-Repo so, dass `getById(templateId)` den
 * exakten Snapshot der pinned Version zurückgibt. Die Engine bleibt dadurch
 * unverändert; laufende Sessions ignorieren spätere Publish-Vorgänge.
 */
export function versionLockedTemplateRepo(
  base: SupabaseWorkflowTemplateRepository,
  pin: { templateId: string; versionId: string },
): WorkflowTemplateRepositoryPort {
  return {
    listPublished: () => base.listPublished(),
    listAll: () => base.listAll(),
    async getById(id) {
      if (id === pin.templateId) {
        const snap = await base.getByVersionId(pin.versionId);
        if (snap) return snap;
      }
      return base.getById(id);
    },
    getBySlug: (slug) => base.getBySlug(slug),
    saveDraft: () => base.saveDraft(),
    createVersion: (tid, s) => base.createVersion(tid, s),
    listVersions: (tid) => base.listVersions(tid),
  };
}
