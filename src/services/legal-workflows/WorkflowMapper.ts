/**
 * Reine Mapping-Utilities zwischen flachen DB-Zeilen und dem verschachtelten
 * WorkflowTemplate-Objekt. Keine Persistenz. Getrennt vom Repository, damit
 * eine Supabase-Implementierung später denselben Mapper nutzt.
 */
import type {
  WorkflowPhase,
  WorkflowStep,
  WorkflowTemplate,
} from "./types";

export interface FlatTemplateRows {
  template: {
    id: string; category_id: string | null; slug: string; title: string;
    subtitle: string | null; description: string | null;
    workflow_status: WorkflowTemplate["workflowStatus"];
    publication_tier: WorkflowTemplate["publicationTier"];
    current_version_id: string | null;
    created_at?: string; updated_at?: string;
  };
  phases: Array<{
    id: string; template_id: string; sort_order: number; title: string;
    description: string | null; is_required: boolean;
    completion_condition: string | null;
  }>;
  steps: Array<{
    id: string; template_id: string; phase_id: string; sort_order: number;
    title: string; description: string | null; goal: string | null;
    step_type: WorkflowStep["stepType"]; priority: WorkflowStep["priority"];
    is_required: boolean; estimated_minutes: number | null;
    primary_role: WorkflowStep["primaryRole"] | null;
    risk_level: WorkflowStep["riskLevel"];
  }>;
  dependencies: Array<{ step_id: string; depends_on_step_id: string }>;
  checklists: Array<{ id: string; step_id: string; sort_order: number; title: string; is_required: boolean }>;
  documents: Array<{ id: string; step_id: string; template_slug: string; title: string; note: string | null }>;
  roles: Array<{ id: string; step_id: string; role: NonNullable<WorkflowStep["primaryRole"]>; can_edit: boolean; can_complete: boolean }>;
  sources: Array<{ id: string; step_id: string; legal_section_id: string | null; citation_hint: string | null; note: string | null }>;
  rules: Array<{
    id: string; template_id: string; when_type: string; when_ref: string | null;
    then_action: string; then_ref: string | null; priority: number;
  }>;
}

export const WorkflowMapper = {
  fromFlat(rows: FlatTemplateRows): WorkflowTemplate {
    const depsByStep = new Map<string, string[]>();
    for (const d of rows.dependencies) {
      const arr = depsByStep.get(d.step_id) ?? [];
      arr.push(d.depends_on_step_id);
      depsByStep.set(d.step_id, arr);
    }
    const stepIndex = new Map<string, WorkflowStep>();
    for (const s of rows.steps) {
      stepIndex.set(s.id, {
        id: s.id, templateId: s.template_id, phaseId: s.phase_id,
        sortOrder: s.sort_order, title: s.title, description: s.description,
        goal: s.goal, stepType: s.step_type, priority: s.priority,
        isRequired: s.is_required, estimatedMinutes: s.estimated_minutes,
        primaryRole: s.primary_role, riskLevel: s.risk_level,
        dependsOn: depsByStep.get(s.id) ?? [],
        checklists: [], documents: [], roles: [], sources: [],
      });
    }
    for (const c of rows.checklists.sort((a, b) => a.sort_order - b.sort_order)) {
      stepIndex.get(c.step_id)?.checklists.push({
        id: c.id, sortOrder: c.sort_order, title: c.title, isRequired: c.is_required,
      });
    }
    for (const d of rows.documents) {
      stepIndex.get(d.step_id)?.documents.push({
        id: d.id, templateSlug: d.template_slug, title: d.title, note: d.note,
      });
    }
    for (const r of rows.roles) {
      stepIndex.get(r.step_id)?.roles.push({
        id: r.id, role: r.role, canEdit: r.can_edit, canComplete: r.can_complete,
      });
    }
    for (const s of rows.sources) {
      stepIndex.get(s.step_id)?.sources.push({
        id: s.id, legalSectionId: s.legal_section_id, citationHint: s.citation_hint, note: s.note,
      });
    }

    const phases: WorkflowPhase[] = rows.phases
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        id: p.id, templateId: p.template_id, sortOrder: p.sort_order,
        title: p.title, description: p.description, isRequired: p.is_required,
        completionCondition: p.completion_condition,
        steps: rows.steps
          .filter((s) => s.phase_id === p.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => stepIndex.get(s.id)!)
          .filter(Boolean),
      }));

    return {
      id: rows.template.id,
      categoryId: rows.template.category_id,
      slug: rows.template.slug,
      title: rows.template.title,
      subtitle: rows.template.subtitle,
      description: rows.template.description,
      workflowStatus: rows.template.workflow_status,
      publicationTier: rows.template.publication_tier,
      currentVersionId: rows.template.current_version_id,
      createdAt: rows.template.created_at,
      updatedAt: rows.template.updated_at,
      phases,
      rules: rows.rules.map((r) => ({
        id: r.id, templateId: r.template_id, whenType: r.when_type,
        whenRef: r.when_ref, thenAction: r.then_action, thenRef: r.then_ref,
        priority: r.priority,
      })),
    };
  },
};
