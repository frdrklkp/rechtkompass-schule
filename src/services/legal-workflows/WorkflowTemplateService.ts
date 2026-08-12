/**
 * Redaktionelle Template-Operationen (Draft → Version). Nutzt die bestehende
 * Editorial-Konvention: Ein Publish schreibt einen immutablen Snapshot in die
 * Version-Tabelle und setzt current_version_id.
 */
import { WorkflowError } from "./errors";
import { WorkflowValidator } from "./WorkflowValidator";
import type { WorkflowTemplateRepositoryPort } from "./WorkflowTemplateRepository";
import type { WorkflowTemplate, WorkflowTemplateVersion } from "./types";

export class WorkflowTemplateService {
  constructor(private repo: WorkflowTemplateRepositoryPort) {}

  async publish(templateId: string): Promise<{ template: WorkflowTemplate; version: WorkflowTemplateVersion }> {
    const tpl = await this.repo.getById(templateId);
    if (!tpl) throw new WorkflowError("not_found", "Template nicht gefunden.");
    const report = WorkflowValidator.validate(tpl);
    if (!report.valid) {
      throw new WorkflowError("validation_failed", `Template nicht valide: ${report.issues[0]?.message ?? "unbekannt"}`);
    }
    const version = await this.repo.createVersion(tpl.id, { ...tpl, workflowStatus: "published" });
    tpl.workflowStatus = "published";
    tpl.currentVersionId = version.id;
    await this.repo.saveDraft(tpl);
    return { template: tpl, version };
  }

  async archive(templateId: string): Promise<WorkflowTemplate> {
    const tpl = await this.repo.getById(templateId);
    if (!tpl) throw new WorkflowError("not_found", "Template nicht gefunden.");
    tpl.workflowStatus = "archived";
    return this.repo.saveDraft(tpl);
  }
}
