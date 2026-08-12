/**
 * Sprint 4.6H – Zentrale Orchestrierung des Dokumentationsassistenten.
 *
 * Verbindet TemplateResolver, ContextBuilder, ReadinessChecker und
 * StaleChecker zu einem persistierbaren Stand im Navigator-Kontext
 * (context.documentation). Die eigentliche Dokumenterzeugung nutzt den
 * bestehenden PlaceholderResolver der Dokumentengenerierung – es wird keine
 * zweite Dokumenten-Engine gebaut.
 */
import { PlaceholderResolver } from "@/services/document-generation/PlaceholderResolver";
import type { GeneratedDocument } from "@/services/document-generation/types";
import type { ActionPlan } from "@/services/action-engine";
import type { AssessmentResult } from "@/services/assessment-engine";
import type { LegalContextResult } from "@/services/legal-context";
import type { SituationCase } from "@/services/situation-analyzer";
import {
  buildDocumentationContext,
  type DocumentationPracticeCaseRef,
} from "./DocumentationContextBuilder";
import { DocumentationEventBus } from "./DocumentationEventBus";
import {
  checkTemplateReadiness,
  overallReadiness,
} from "./DocumentationReadinessChecker";
import {
  computeDocumentationInputHash,
  isDocumentationStale,
  staleDrafts,
  type DocumentationHashParts,
} from "./DocumentationStaleChecker";
import {
  defaultDocumentationTemplateFetcher,
  resolveDocumentationTemplates,
  type DocumentationTemplateFetcher,
} from "./DocumentationTemplateResolver";
import {
  DOCUMENTATION_SCHEMA_VERSION,
  DOCUMENTATION_STEP_ID,
  type DocumentationContextEntry,
  type DocumentationDraft,
  type DocumentationReadiness,
  type DocumentationSkippedTemplate,
} from "./types";

export class DocumentationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentationError";
  }
}

export interface DocumentationAssistantServiceOptions {
  fetcher?: DocumentationTemplateFetcher;
  events?: DocumentationEventBus;
  now?: () => Date;
  createId?: () => string;
}

export interface DocumentationContextParts {
  navigatorId: string;
  workflowId: string;
  situation: SituationCase | null;
  assessment: AssessmentResult | null;
  actionPlan: ActionPlan | null;
  legalContext: LegalContextResult | null;
  practiceCase: DocumentationPracticeCaseRef | null;
}

export interface DocumentationPrepareInput extends DocumentationContextParts {
  /** Kategorie des Vorgangs (für die Kategorie-Stufe der Auflösung). */
  category: string | null;
  /** Bisheriger Stand – Entwürfe bleiben erhalten. */
  existing?: DocumentationContextEntry | null;
}

export interface DocumentationPrepareResult {
  entry: DocumentationContextEntry;
  skipped: DocumentationSkippedTemplate[];
}

export interface DocumentationRestore {
  entry: DocumentationContextEntry | null;
  error: string | null;
}

let idCounter = 0;
function defaultId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  idCounter += 1;
  return `draft-${Date.now()}-${idCounter}`;
}

export class DocumentationAssistantService {
  private readonly fetcher: DocumentationTemplateFetcher;
  private readonly events: DocumentationEventBus;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(options: DocumentationAssistantServiceOptions = {}) {
    this.fetcher = options.fetcher ?? defaultDocumentationTemplateFetcher;
    this.events = options.events ?? new DocumentationEventBus();
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultId;
  }

  /** Platzhalterkontext aus den aktuellen Falldaten (deterministisch). */
  buildContext(parts: DocumentationContextParts): Record<string, unknown> {
    return buildDocumentationContext({ ...parts, now: this.now() });
  }

  /** Aktueller Eingabe-Hash für die Veraltungserkennung. */
  computeHash(parts: DocumentationHashParts): string {
    return computeDocumentationInputHash(parts);
  }

  isStale(entry: DocumentationContextEntry, currentInputHash: string): boolean {
    return isDocumentationStale(entry, currentInputHash);
  }

  staleDrafts(entry: DocumentationContextEntry, currentInputHash: string): DocumentationDraft[] {
    return staleDrafts(entry, currentInputHash);
  }

  /**
   * Löst Vorlagen auf, prüft die Readiness und legt den Stand im
   * Navigator-Kontext ab. Bestehende Entwürfe bleiben erhalten.
   */
  async prepare(input: DocumentationPrepareInput): Promise<DocumentationPrepareResult> {
    const data = await this.fetcher(input.practiceCase?.id ?? null);
    const { templates, skipped } = resolveDocumentationTemplates(data, input.category);
    const context = this.buildContext(input);
    const hasSituation = Boolean(input.situation);
    const readiness = templates.map((t) => checkTemplateReadiness(t, context, hasSituation));
    const inputHash = this.computeHash({ ...input, templates });
    const nowIso = this.now().toISOString();

    const entry: DocumentationContextEntry = {
      schemaVersion: DOCUMENTATION_SCHEMA_VERSION,
      inputHash,
      caseId: input.practiceCase?.id ?? null,
      templates,
      readiness,
      drafts: input.existing?.drafts ?? [],
      preparedAt: input.existing?.preparedAt ?? nowIso,
      updatedAt: nowIso,
    };
    this.events.emit("DocumentationPrepared", {
      templateCount: templates.length,
      skippedCount: skipped.length,
      readiness: overallReadiness(hasSituation, readiness),
    });
    return { entry, skipped };
  }

  /**
   * Erzeugt einen Entwurf aus einer Vorlage. Fehlende Angaben werden als
   * ⟨fehlend⟩ markiert, niemals ergänzt. Ältere Entwürfe bleiben erhalten.
   */
  generateDraft(
    entry: DocumentationContextEntry,
    templateId: string,
    parts: DocumentationContextParts,
  ): { entry: DocumentationContextEntry; draft: DocumentationDraft } {
    if (!parts.situation) {
      throw new DocumentationError(
        "Ohne erfassten Sachverhalt kann kein Dokument erzeugt werden.",
      );
    }
    const template = entry.templates.find((t) => t.id === templateId);
    if (!template) throw new DocumentationError("Die gewählte Vorlage wurde nicht gefunden.");

    const resolved = PlaceholderResolver.resolve({
      template: template.markdownBody,
      context: this.buildContext(parts),
    });
    const inputHash = this.computeHash({ ...parts, templates: entry.templates });
    const nowIso = this.now().toISOString();

    const draft: DocumentationDraft = {
      id: this.createId(),
      templateId: template.id,
      templateSlug: template.slug,
      title: template.title,
      markdown: resolved.markdown,
      status: "generated",
      inputHash,
      missingPlaceholders: resolved.missing,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const next: DocumentationContextEntry = {
      ...entry,
      inputHash,
      drafts: [...entry.drafts, draft],
      updatedAt: nowIso,
    };
    this.events.emit("DocumentationDraftGenerated", {
      templateId,
      missingCount: resolved.missing.length,
    });
    return { entry: next, draft };
  }

  /**
   * Übernimmt eine manuelle Bearbeitung des Entwurfs. Die Änderung fließt
   * nicht in den SituationCase zurück.
   */
  updateDraft(
    entry: DocumentationContextEntry,
    draftId: string,
    markdown: string,
  ): DocumentationContextEntry {
    const draft = entry.drafts.find((d) => d.id === draftId);
    if (!draft) throw new DocumentationError("Der Entwurf wurde nicht gefunden.");
    const nowIso = this.now().toISOString();
    const next: DocumentationContextEntry = {
      ...entry,
      drafts: entry.drafts.map((d) =>
        d.id === draftId ? { ...d, markdown, status: "edited", updatedAt: nowIso } : d,
      ),
      updatedAt: nowIso,
    };
    this.events.emit("DocumentationDraftUpdated", { draftId });
    return next;
  }

  removeDraft(entry: DocumentationContextEntry, draftId: string): DocumentationContextEntry {
    const next: DocumentationContextEntry = {
      ...entry,
      drafts: entry.drafts.filter((d) => d.id !== draftId),
      updatedAt: this.now().toISOString(),
    };
    this.events.emit("DocumentationDraftRemoved", { draftId });
    return next;
  }

  markExported(draftId: string, format: string): void {
    this.events.emit("DocumentationExported", { draftId, format });
  }

  /** Gesamtstatus der Phase für die Anzeige. */
  readinessOf(entry: DocumentationContextEntry, hasSituation: boolean): DocumentationReadiness {
    return overallReadiness(hasSituation, entry.readiness);
  }

  /** Validiert einen aus dem Navigator-Kontext gelesenen Eintrag. */
  restore(raw: unknown): DocumentationRestore {
    if (raw === undefined || raw === null) return { entry: null, error: null };
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return { entry: null, error: "Der gespeicherte Dokumentationsstand konnte nicht gelesen werden." };
    }
    const candidate = raw as Partial<DocumentationContextEntry>;
    if (
      candidate.schemaVersion !== DOCUMENTATION_SCHEMA_VERSION ||
      typeof candidate.inputHash !== "string" ||
      !Array.isArray(candidate.templates) ||
      !Array.isArray(candidate.readiness) ||
      !Array.isArray(candidate.drafts) ||
      typeof candidate.preparedAt !== "string"
    ) {
      return { entry: null, error: "Der gespeicherte Dokumentationsstand ist nicht mehr gültig." };
    }
    this.events.emit("DocumentationRestored", {
      templateCount: candidate.templates.length,
      draftCount: candidate.drafts.length,
    });
    return { entry: candidate as DocumentationContextEntry, error: null };
  }
}

/**
 * Wandelt einen Entwurf in das GeneratedDocument-Format der bestehenden
 * Export-Registry (Markdown/DOCX/PDF) um. Rechtsgrundlagen des Legal Context
 * werden als Quellenblock durchgereicht.
 */
export function toGeneratedDocument(
  draft: DocumentationDraft,
  input: { navigatorId: string; legalContext: LegalContextResult | null },
): GeneratedDocument {
  const sources = (input.legalContext?.references ?? []).map((r) => ({
    id: r.sectionId,
    citation: `${r.source?.shortName ?? r.source?.name ?? "Rechtsgrundlage"} ${r.reference}`.trim(),
    note: null,
  }));
  return {
    id: draft.id,
    sessionId: input.navigatorId,
    templateId: draft.templateId,
    templateSlug: draft.templateSlug,
    stepId: DOCUMENTATION_STEP_ID,
    title: draft.title,
    markdown: draft.markdown,
    status: "generated",
    workflowVersionId: null,
    usedContext: { sources },
    missingPlaceholders: draft.missingPlaceholders,
    generationMetadata: { origin: "documentation-assistant", draftStatus: draft.status },
    createdBy: null,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

export const defaultDocumentationAssistantService = new DocumentationAssistantService();
