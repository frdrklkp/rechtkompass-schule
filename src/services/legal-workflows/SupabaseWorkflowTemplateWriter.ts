/**
 * Sprint 4.3D – Redaktioneller Writer für Workflow-Templates.
 *
 * Persistiert ein vollständiges WorkflowTemplate (mit Phasen, Schritten,
 * Abhängigkeiten, Checklisten, Dokumenten, Rollen, Rechtsgrundlagen und Regeln)
 * in die flachen Supabase-Tabellen.
 *
 * Strategie: „Replace children" – die Metadaten des Templates werden per Update
 * geschrieben; sämtliche Kind-Zeilen werden vor dem Neuschreiben gelöscht.
 * Das hält den Writer einfach und garantiert einen konsistenten Zustand.
 *
 * Der Writer schreibt niemals publizierte Templates direkt. Redaktion erfolgt
 * ausschließlich auf `draft` / `in_review` / `approved`. Wer eine bereits
 * publizierte Version anpassen möchte, dupliziert das Template.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { WorkflowError } from "./errors";
import type { WorkflowTemplate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

const EDITABLE_STATUSES = new Set<WorkflowTemplate["workflowStatus"]>([
  "draft",
  "in_review",
  "approved",
]);

export interface CreateTemplateInput {
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  categoryId?: string | null;
  publicationTier?: WorkflowTemplate["publicationTier"];
}

export class SupabaseWorkflowTemplateWriter {
  constructor(private db: LooseClient) {}

  async create(input: CreateTemplateInput): Promise<{ id: string }> {
    if (!input.slug?.trim() || !input.title?.trim()) {
      throw new WorkflowError("invalid_input", "Slug und Titel sind erforderlich.");
    }
    const { data, error } = await this.db
      .from("workflow_templates")
      .insert({
        slug: input.slug.trim(),
        title: input.title.trim(),
        subtitle: input.subtitle ?? null,
        description: input.description ?? null,
        category_id: input.categoryId ?? null,
        publication_tier: input.publicationTier ?? "internal",
        workflow_status: "draft",
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new WorkflowError("invalid_state", error?.message ?? "Konnte Template nicht anlegen.");
    }
    return { id: (data as { id: string }).id };
  }

  async saveDraft(tpl: WorkflowTemplate): Promise<void> {
    if (!EDITABLE_STATUSES.has(tpl.workflowStatus)) {
      throw new WorkflowError(
        "forbidden",
        `Templates im Status ${tpl.workflowStatus} können nicht direkt bearbeitet werden. Bitte duplizieren.`,
      );
    }

    // 1) Template-Metadaten aktualisieren
    const upd = await this.db
      .from("workflow_templates")
      .update({
        slug: tpl.slug,
        title: tpl.title,
        subtitle: tpl.subtitle ?? null,
        description: tpl.description ?? null,
        category_id: tpl.categoryId ?? null,
        publication_tier: tpl.publicationTier,
        workflow_status: tpl.workflowStatus,
      })
      .eq("id", tpl.id);
    if (upd.error) throw new WorkflowError("invalid_state", upd.error.message);

    // 2) Kind-Zeilen löschen (in korrekter Reihenfolge)
    await this.wipeChildren(tpl.id);

    // 3) Kinder neu schreiben
    if (tpl.phases.length) {
      const phaseRows = tpl.phases.map((p, i) => ({
        id: p.id,
        template_id: tpl.id,
        sort_order: i,
        title: p.title,
        description: p.description ?? null,
        is_required: p.isRequired,
        completion_condition: p.completionCondition ?? null,
      }));
      const r = await this.db.from("workflow_phases").insert(phaseRows);
      if (r.error) throw new WorkflowError("invalid_state", r.error.message);
    }

    const allSteps = tpl.phases.flatMap((p) => p.steps);
    if (allSteps.length) {
      const stepRows = tpl.phases.flatMap((p) =>
        p.steps.map((s, i) => ({
          id: s.id,
          template_id: tpl.id,
          phase_id: p.id,
          sort_order: i,
          title: s.title,
          description: s.description ?? null,
          goal: s.goal ?? null,
          step_type: s.stepType,
          priority: s.priority,
          is_required: s.isRequired,
          estimated_minutes: s.estimatedMinutes ?? null,
          primary_role: s.primaryRole ?? null,
          risk_level: s.riskLevel,
        })),
      );
      const r = await this.db.from("workflow_steps").insert(stepRows);
      if (r.error) throw new WorkflowError("invalid_state", r.error.message);

      const depRows = allSteps.flatMap((s) =>
        (s.dependsOn ?? []).map((dep) => ({
          step_id: s.id,
          depends_on_step_id: dep,
        })),
      );
      if (depRows.length) {
        const r2 = await this.db.from("workflow_step_dependencies").insert(depRows);
        if (r2.error) throw new WorkflowError("invalid_state", r2.error.message);
      }

      const checklistRows = allSteps.flatMap((s) =>
        s.checklists.map((c, i) => ({
          id: c.id,
          step_id: s.id,
          sort_order: i,
          title: c.title,
          is_required: c.isRequired,
        })),
      );
      if (checklistRows.length) {
        const r2 = await this.db.from("workflow_step_checklists").insert(checklistRows);
        if (r2.error) throw new WorkflowError("invalid_state", r2.error.message);
      }

      const docRows = allSteps.flatMap((s) =>
        s.documents.map((d) => ({
          id: d.id,
          step_id: s.id,
          template_slug: d.templateSlug,
          title: d.title,
          note: d.note ?? null,
        })),
      );
      if (docRows.length) {
        const r2 = await this.db.from("workflow_step_documents").insert(docRows);
        if (r2.error) throw new WorkflowError("invalid_state", r2.error.message);
      }

      const roleRows = allSteps.flatMap((s) =>
        s.roles.map((r) => ({
          id: r.id,
          step_id: s.id,
          role: r.role,
          can_edit: r.canEdit,
          can_complete: r.canComplete,
        })),
      );
      if (roleRows.length) {
        const r2 = await this.db.from("workflow_step_roles").insert(roleRows);
        if (r2.error) throw new WorkflowError("invalid_state", r2.error.message);
      }

      const sourceRows = allSteps.flatMap((s) =>
        s.sources.map((src) => ({
          id: src.id,
          step_id: s.id,
          legal_section_id: src.legalSectionId ?? null,
          citation_hint: src.citationHint ?? null,
          note: src.note ?? null,
        })),
      );
      if (sourceRows.length) {
        const r2 = await this.db.from("workflow_step_sources").insert(sourceRows);
        if (r2.error) throw new WorkflowError("invalid_state", r2.error.message);
      }
    }

    if (tpl.rules.length) {
      const ruleRows = tpl.rules.map((r) => ({
        id: r.id,
        template_id: tpl.id,
        when_type: r.whenType,
        when_ref: r.whenRef ?? null,
        then_action: r.thenAction,
        then_ref: r.thenRef ?? null,
        priority: r.priority,
      }));
      const r = await this.db.from("workflow_rules").insert(ruleRows);
      if (r.error) throw new WorkflowError("invalid_state", r.error.message);
    }
  }

  async setStatus(
    templateId: string,
    status: WorkflowTemplate["workflowStatus"],
  ): Promise<void> {
    const { error } = await this.db
      .from("workflow_templates")
      .update({ workflow_status: status })
      .eq("id", templateId);
    if (error) throw new WorkflowError("invalid_state", error.message);
  }

  async setCurrentVersion(templateId: string, versionId: string): Promise<void> {
    const { error } = await this.db
      .from("workflow_templates")
      .update({ current_version_id: versionId })
      .eq("id", templateId);
    if (error) throw new WorkflowError("invalid_state", error.message);
  }

  async remove(templateId: string): Promise<void> {
    await this.wipeChildren(templateId);
    const { error } = await this.db.from("workflow_templates").delete().eq("id", templateId);
    if (error) throw new WorkflowError("invalid_state", error.message);
  }

  private async wipeChildren(templateId: string): Promise<void> {
    // Step-IDs für Detail-Wipes ermitteln
    const { data: stepRows, error: stepErr } = await this.db
      .from("workflow_steps")
      .select("id")
      .eq("template_id", templateId);
    if (stepErr) throw new WorkflowError("invalid_state", stepErr.message);
    const stepIds = (stepRows ?? []).map((r) => (r as { id: string }).id);

    if (stepIds.length) {
      for (const t of [
        "workflow_step_dependencies",
        "workflow_step_checklists",
        "workflow_step_documents",
        "workflow_step_roles",
        "workflow_step_sources",
      ]) {
        const { error } = await this.db.from(t).delete().in("step_id", stepIds);
        if (error) throw new WorkflowError("invalid_state", `${t}: ${error.message}`);
      }
    }

    for (const t of ["workflow_steps", "workflow_phases", "workflow_rules"]) {
      const { error } = await this.db.from(t).delete().eq("template_id", templateId);
      if (error) throw new WorkflowError("invalid_state", `${t}: ${error.message}`);
    }
  }
}
