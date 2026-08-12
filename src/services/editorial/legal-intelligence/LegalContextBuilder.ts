// LegalContextBuilder – baut fachlichen Kontext für die Legal Intelligence.
// Keine Autor-/Reviewer-IDs, keine Kommentare, keine Klartext-Nutzer-Daten.
// Enthält Fallinhalte + verknüpfte Rechtsgrundlagen + Legal-Flags + Quality-
// Kontext + Workflow/Aging. Reduziert den Kontext pro Task minimal-invasiv.

import type { AITaskType } from "../ai/types";
import type { EditorialCaseRow } from "../types";
import type { CaseQualityAssessment } from "../quality/types";
import { buildScopedContext } from "../ai/ContextScoping";
import { buildQualityContext } from "../ai/AIContextBuilder";

export interface LegalLinkCtx {
  sectionId: string;
  reference?: string | null;      // z. B. "§ 53 SchulG"
  title?: string | null;
  source?: string | null;
  relevance?: string | null;
  explanation?: string | null;
}
export interface LegalCatalogEntry {
  sectionId: string;
  reference?: string | null;
  title?: string | null;
  source?: string | null;
  summary?: string | null;
}
export interface LegalFlagCtx {
  reason: string | null;
  raisedAt: string;
  resolvedAt: string | null;
}
export interface SimilarCaseCtx {
  caseId: string;
  title: string;
  category?: string | null;
  subcategory?: string | null;
  short_description?: string | null;
  recommendation?: string | null;
}
export interface WorkflowCtx {
  workflow_status: string;
  publication_tier: string | null;
  quality_status: string | null;
  legal_update_required: boolean;
  submitted_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  updated_at: string | null;
  aging?: string | null;
}

export interface LegalIntelligenceContext {
  task: AITaskType;
  case: Record<string, unknown>;
  quality?: Record<string, unknown>;
  legal: {
    linkedSections: LegalLinkCtx[];
    flags: LegalFlagCtx[];
    catalog?: LegalCatalogEntry[];
    similarCases?: SimilarCaseCtx[];
    citationSectionId?: string;
  };
  workflow: WorkflowCtx;
  scope: string[];
  promptVersion: string;
}

export interface BuildLegalContextInput {
  task: AITaskType;
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality?: CaseQualityAssessment | null;
  linkedSections?: LegalLinkCtx[];
  flags?: LegalFlagCtx[];
  catalog?: LegalCatalogEntry[];
  similarCases?: SimilarCaseCtx[];
  citationSectionId?: string;
  promptVersion: string;
}

export function buildLegalContext(input: BuildLegalContextInput): LegalIntelligenceContext {
  const { task, caseRow, quality, linkedSections, flags, catalog, similarCases, citationSectionId, promptVersion } = input;
  const scoped = buildScopedContext(task, caseRow, quality ?? null);
  const workflow: WorkflowCtx = {
    workflow_status: caseRow.workflow_status,
    publication_tier: caseRow.publication_tier ?? null,
    quality_status: caseRow.quality_status ?? null,
    legal_update_required: Boolean(caseRow.legal_update_required),
    submitted_at: caseRow.submitted_at ?? null,
    approved_at: caseRow.approved_at ?? null,
    published_at: caseRow.published_at ?? null,
    updated_at: caseRow.updated_at ?? null,
    aging: quality?.agingLevel ?? null,
  };
  return {
    task,
    case: scoped.case,
    quality: quality ? (buildQualityContext(quality) as unknown as Record<string, unknown>) : undefined,
    legal: {
      linkedSections: linkedSections ?? [],
      flags: flags ?? [],
      catalog: catalog?.slice(0, 200), // hartes Limit gegen Prompt-Bloat
      similarCases: similarCases?.slice(0, 6),
      citationSectionId,
    },
    workflow,
    scope: scoped.scope,
    promptVersion,
  };
}
