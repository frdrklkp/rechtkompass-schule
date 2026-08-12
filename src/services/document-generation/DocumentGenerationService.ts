/**
 * Sprint 4.5A – Document Generation Service.
 *
 * Orchestriert:
 *   1. Kontext aufbauen (aus vorhandener Runtime)
 *   2. Platzhalter deterministisch auflösen
 *   3. Optional: KI-Slots durch grounded Copilot füllen (nur explizit markiert)
 *   4. Markdown-Dokument versioniert speichern (per Port)
 *
 * Keine Engine-, Runtime-, Designer- oder Copilot-Änderungen.
 */
import { buildDocumentContext } from "./ContextBuilder";
import { PlaceholderResolver } from "./PlaceholderResolver";
import { docGenTelemetry } from "./telemetry";
import type {
  DocumentGenerationRequest,
  DocumentGenerationResult,
  GeneratedDocument,
  MissingPlaceholder,
} from "./types";
import type { WorkflowSessionDocumentRepositoryPort } from "./WorkflowSessionDocumentRepository";

export interface AiFieldResolver {
  /** Liefert Freitext für einen ausdrücklich markierten Slot. Nie Fakten erfinden. */
  resolve(input: {
    placeholder: string;
    prompt: string;
    contextExcerpt: string;
    sessionId: string;
    templateSlug: string;
  }): Promise<{ text: string; usedSources?: string[] } | null>;
}

export interface DocumentGenerationDeps {
  documents: WorkflowSessionDocumentRepositoryPort;
  ai?: AiFieldResolver;
  now?: () => Date;
}

export class DocumentGenerationService {
  constructor(private readonly deps: DocumentGenerationDeps) {}

  /** Erzeugt Markdown + Report OHNE Persistenz. Für Preview. */
  async preview(req: DocumentGenerationRequest): Promise<DocumentGenerationResult> {
    const t0 = Date.now();
    const context = buildDocumentContext({
      session: req.session,
      runtime: req.runtime,
      actor: req.actor,
      actorDisplayName: req.actorDisplayName ?? null,
      school: req.school ?? null,
      now: req.now ?? this.deps.now?.() ?? new Date(),
    });

    const aiValues = await this.resolveAiFields(req, context);

    const { markdown, missing, usedKeys } = PlaceholderResolver.resolve({
      template: req.template.markdownBody,
      context,
      aiValues,
    });

    const status =
      missing.length === 0
        ? "generated"
        : missing.some((m) => m.reason !== "ai_disabled")
          ? "partial"
          : "partial";

    docGenTelemetry.emit({
      event: "document_previewed",
      sessionId: req.session.id,
      templateSlug: req.template.slug,
      durationMs: Date.now() - t0,
      detail: { missing: missing.length, aiFields: Object.keys(aiValues).length },
    });

    return {
      markdown,
      missingPlaceholders: missing,
      usedContext: { keys: usedKeys, aiFields: Object.keys(aiValues) },
      metadata: {
        templateSlug: req.template.slug,
        workflowVersionId: req.session.templateVersionId ?? null,
        generatedAt: new Date().toISOString(),
        aiFieldCount: Object.keys(aiValues).length,
      },
      status,
    };
  }

  /** Erzeugt Markdown und speichert versioniert (neues Dokument). */
  async generate(req: DocumentGenerationRequest): Promise<GeneratedDocument> {
    const t0 = Date.now();
    try {
      const result = await this.preview(req);
      const doc = await this.deps.documents.create({
        sessionId: req.session.id,
        templateId: req.template.id,
        templateSlug: req.template.slug,
        stepId: null,
        title: req.template.title,
        markdown: result.markdown,
        status: result.status,
        workflowVersionId: req.session.templateVersionId ?? null,
        usedContext: result.usedContext,
        missingPlaceholders: result.missingPlaceholders,
        generationMetadata: result.metadata,
        createdBy: req.actor,
      });
      docGenTelemetry.emit({
        event: "document_generated",
        sessionId: req.session.id,
        templateSlug: req.template.slug,
        documentId: doc.id,
        durationMs: Date.now() - t0,
        detail: { missing: result.missingPlaceholders.length },
      });
      return doc;
    } catch (err) {
      docGenTelemetry.emit({
        event: "document_generation_failed",
        sessionId: req.session.id,
        templateSlug: req.template.slug,
        durationMs: Date.now() - t0,
        detail: { message: (err as Error).message },
      });
      throw err;
    }
  }

  /** Regeneriert Markdown für ein bestehendes Dokument. Gepinnte Workflow-Version bleibt. */
  async regenerate(req: DocumentGenerationRequest & { existingDocumentId: string }): Promise<GeneratedDocument> {
    const t0 = Date.now();
    const existing = await this.deps.documents.getById(req.existingDocumentId);
    if (!existing) throw new Error("Dokument nicht gefunden.");
    if (existing.sessionId !== req.session.id) throw new Error("Dokument gehört zu anderer Session.");

    const result = await this.preview(req);
    const updated = await this.deps.documents.update(existing.id, {
      markdown: result.markdown,
      status: "regenerated",
      usedContext: result.usedContext,
      missingPlaceholders: result.missingPlaceholders,
      generationMetadata: {
        ...existing.generationMetadata,
        ...result.metadata,
        regeneratedAt: new Date().toISOString(),
        regenerationCount:
          typeof existing.generationMetadata.regenerationCount === "number"
            ? (existing.generationMetadata.regenerationCount as number) + 1
            : 1,
      },
    });
    docGenTelemetry.emit({
      event: "document_regenerated",
      sessionId: req.session.id,
      templateSlug: req.template.slug,
      documentId: updated.id,
      durationMs: Date.now() - t0,
      detail: { missing: result.missingPlaceholders.length },
    });
    return updated;
  }

  private async resolveAiFields(
    req: DocumentGenerationRequest,
    context: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    if (!req.template.aiFields || req.template.aiFields.length === 0) return {};
    const ai = this.deps.ai;
    if (!ai) {
      // Kein Provider verfügbar: Slots bleiben leer und werden als fehlend markiert.
      for (const f of req.template.aiFields) {
        docGenTelemetry.emit({
          event: "document_ai_field_skipped",
          sessionId: req.session.id,
          templateSlug: req.template.slug,
          detail: { placeholder: f.placeholder, reason: "no_provider" },
        });
      }
      return {};
    }

    const values: Record<string, string> = {};
    const excerpt = summarizeContext(context);
    for (const field of req.template.aiFields) {
      try {
        const out = await ai.resolve({
          placeholder: field.placeholder,
          prompt: field.prompt,
          contextExcerpt: excerpt,
          sessionId: req.session.id,
          templateSlug: req.template.slug,
        });
        if (out && out.text && out.text.trim() !== "") {
          values[field.placeholder] = out.text.trim();
          docGenTelemetry.emit({
            event: "document_ai_field_filled",
            sessionId: req.session.id,
            templateSlug: req.template.slug,
            detail: { placeholder: field.placeholder },
          });
        } else {
          docGenTelemetry.emit({
            event: "document_ai_field_skipped",
            sessionId: req.session.id,
            templateSlug: req.template.slug,
            detail: { placeholder: field.placeholder, reason: "empty" },
          });
        }
      } catch (err) {
        docGenTelemetry.emit({
          event: "document_ai_field_skipped",
          sessionId: req.session.id,
          templateSlug: req.template.slug,
          detail: { placeholder: field.placeholder, reason: (err as Error).message },
        });
      }
    }
    return values;
  }
}

function summarizeContext(ctx: Record<string, unknown>): string {
  const parts: string[] = [];
  const wf = ctx.workflow as { title?: string } | undefined;
  if (wf?.title) parts.push(`Workflow: ${wf.title}`);
  const step = ctx.step as { title?: string; goal?: string } | undefined;
  if (step?.title) parts.push(`Aktueller Schritt: ${step.title}`);
  if (step?.goal) parts.push(`Ziel: ${step.goal}`);
  const notes = ctx.notes as Array<{ step: string; note: string }> | undefined;
  if (notes && notes.length > 0) {
    parts.push("Notizen:");
    for (const n of notes.slice(0, 5)) parts.push(`- ${n.step}: ${n.note}`);
  }
  const sources = ctx.sources as Array<{ citation: string }> | undefined;
  if (sources && sources.length > 0) {
    parts.push("Rechtsgrundlagen:");
    for (const s of sources.slice(0, 10)) parts.push(`- ${s.citation}`);
  }
  return parts.join("\n");
}

export type { MissingPlaceholder };
