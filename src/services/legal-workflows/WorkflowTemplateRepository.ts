/**
 * Template-Persistenz-Port + In-Memory-Referenz.
 * Versionierung folgt der Editorial-Konvention (immutable snapshots).
 */
import type { WorkflowTemplate, WorkflowTemplateVersion } from "./types";

export interface WorkflowTemplateRepositoryPort {
  listPublished(): Promise<WorkflowTemplate[]>;
  listAll(): Promise<WorkflowTemplate[]>;
  getById(id: string): Promise<WorkflowTemplate | null>;
  getBySlug(slug: string): Promise<WorkflowTemplate | null>;
  saveDraft(tpl: WorkflowTemplate): Promise<WorkflowTemplate>;
  createVersion(templateId: string, snapshot: WorkflowTemplate): Promise<WorkflowTemplateVersion>;
  listVersions(templateId: string): Promise<WorkflowTemplateVersion[]>;
}

export class InMemoryTemplateRepository implements WorkflowTemplateRepositoryPort {
  private tpls = new Map<string, WorkflowTemplate>();
  private versions = new Map<string, WorkflowTemplateVersion[]>();

  seed(tpls: WorkflowTemplate[]) {
    for (const t of tpls) this.tpls.set(t.id, structuredClone(t));
  }

  async listPublished() {
    return [...this.tpls.values()].filter((t) => t.workflowStatus === "published");
  }
  async listAll() { return [...this.tpls.values()]; }
  async getById(id: string) { return this.tpls.get(id) ?? null; }
  async getBySlug(slug: string) {
    return [...this.tpls.values()].find((t) => t.slug === slug) ?? null;
  }
  async saveDraft(tpl: WorkflowTemplate) {
    this.tpls.set(tpl.id, structuredClone(tpl));
    return this.tpls.get(tpl.id)!;
  }
  async createVersion(templateId: string, snapshot: WorkflowTemplate) {
    const list = this.versions.get(templateId) ?? [];
    const version: WorkflowTemplateVersion = {
      id: `${templateId}-v${list.length + 1}`,
      templateId,
      version: list.length + 1,
      snapshot: structuredClone(snapshot),
      createdAt: new Date().toISOString(),
    };
    list.push(version);
    this.versions.set(templateId, list);
    return version;
  }
  async listVersions(templateId: string) {
    return [...(this.versions.get(templateId) ?? [])];
  }
}
