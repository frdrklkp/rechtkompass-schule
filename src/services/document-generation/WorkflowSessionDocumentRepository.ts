/**
 * Sprint 4.5A – Port + In-Memory-Adapter für erzeugte Dokumente pro Session.
 */
import type { GeneratedDocument, MissingPlaceholder, DocumentGenerationStatus } from "./types";

export interface CreateGeneratedDocumentInput {
  sessionId: string;
  templateId: string | null;
  templateSlug: string;
  stepId: string | null;
  title: string;
  markdown: string;
  status: DocumentGenerationStatus;
  workflowVersionId: string | null;
  usedContext: Record<string, unknown>;
  missingPlaceholders: MissingPlaceholder[];
  generationMetadata: Record<string, unknown>;
  createdBy: string | null;
}

export interface UpdateGeneratedDocumentInput {
  markdown?: string;
  status?: DocumentGenerationStatus;
  usedContext?: Record<string, unknown>;
  missingPlaceholders?: MissingPlaceholder[];
  generationMetadata?: Record<string, unknown>;
  title?: string;
}

export interface WorkflowSessionDocumentRepositoryPort {
  listBySession(sessionId: string): Promise<GeneratedDocument[]>;
  getById(id: string): Promise<GeneratedDocument | null>;
  create(input: CreateGeneratedDocumentInput): Promise<GeneratedDocument>;
  update(id: string, input: UpdateGeneratedDocumentInput): Promise<GeneratedDocument>;
  delete(id: string): Promise<void>;
}

export class InMemoryWorkflowSessionDocumentRepository implements WorkflowSessionDocumentRepositoryPort {
  private byId = new Map<string, GeneratedDocument>();
  private counter = 0;
  private now = () => new Date().toISOString();

  async listBySession(sessionId: string): Promise<GeneratedDocument[]> {
    return [...this.byId.values()]
      .filter((d) => d.sessionId === sessionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getById(id: string): Promise<GeneratedDocument | null> {
    return this.byId.get(id) ?? null;
  }
  async create(i: CreateGeneratedDocumentInput): Promise<GeneratedDocument> {
    const id = `doc_${++this.counter}`;
    const now = this.now();
    const doc: GeneratedDocument = {
      id,
      sessionId: i.sessionId,
      templateId: i.templateId,
      templateSlug: i.templateSlug,
      stepId: i.stepId,
      title: i.title,
      markdown: i.markdown,
      status: i.status,
      workflowVersionId: i.workflowVersionId,
      usedContext: i.usedContext,
      missingPlaceholders: i.missingPlaceholders,
      generationMetadata: i.generationMetadata,
      createdBy: i.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(id, doc);
    return doc;
  }
  async update(id: string, i: UpdateGeneratedDocumentInput): Promise<GeneratedDocument> {
    const existing = this.byId.get(id);
    if (!existing) throw new Error("Not found");
    const next: GeneratedDocument = {
      ...existing,
      ...i,
      updatedAt: this.now(),
    };
    this.byId.set(id, next);
    return next;
  }
  async delete(id: string): Promise<void> {
    this.byId.delete(id);
  }
}
