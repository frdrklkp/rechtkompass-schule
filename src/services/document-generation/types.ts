/**
 * Sprint 4.5A – Document Generation Core: Domain-Typen.
 * Rein datengetrieben. Keine Kopplung an Supabase.
 */
import type {
  WorkflowExecutionSession,
  WorkflowRuntimeContext,
} from "@/services/legal-workflows";

export type DocumentGenerationStatus =
  | "draft"
  | "generated"
  | "partial"
  | "regenerated"
  | "manual";

export interface DocumentTemplateInput {
  id: string | null;
  slug: string;
  title: string;
  description: string | null;
  documentType: string | null;
  markdownBody: string;
  sortOrder: number;
  aiFields: DocumentAiFieldSpec[];
}

/** Ausdrücklich markierter Freitextbereich für den Grounded Copilot. */
export interface DocumentAiFieldSpec {
  placeholder: string; // z. B. "ai.begruendung"
  prompt: string;
  /** Explizite Sichtbarkeit: welche Kontextteile darf die KI sehen. */
  contextScope?: Array<"workflow" | "step" | "phase" | "notes" | "sources">;
}

export interface MissingPlaceholder {
  key: string;
  reason: "unknown" | "empty" | "ai_disabled";
}

export interface GeneratedDocument {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface DocumentGenerationRequest {
  session: WorkflowExecutionSession;
  runtime: WorkflowRuntimeContext;
  template: DocumentTemplateInput;
  actor: string | null;
  actorDisplayName?: string | null;
  school?: string | null;
  now?: Date;
  /** Optional: bestehendes Dokument neu generieren. */
  existingDocumentId?: string;
}

export interface DocumentGenerationResult {
  markdown: string;
  missingPlaceholders: MissingPlaceholder[];
  usedContext: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: DocumentGenerationStatus;
}

/** Marker für fehlende Werte im Markdown. Nie erfinden. */
export const MISSING_MARK = "⟨fehlend⟩";
