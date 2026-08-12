// Zentrale Typen für den AI Editorial Assistant (Sprint 3.5).
// Keine Persistenz. Alle Vorschläge sind ephemer und Session-scoped.

export type AITaskType =
  | "improve.title"
  | "improve.shortDescription"
  | "improve.recommendation"
  | "improve.legalExplanation"
  | "generate.checklist"
  | "generate.faq"
  | "generate.documentation"
  | "generate.practiceTips"
  | "generate.decisionTree"
  | "summarize.changes"
  | "detect.duplicates"
  | "quality.improve"
  | "review.readiness"
  // Sprint 4.0 – Legal Intelligence Tasks (nur Empfehlungen, keine Persistenz)
  | "legal.analyzeCompleteness"
  | "legal.suggestSources"
  | "legal.checkConsistency"
  | "legal.checkDocumentation"
  | "legal.compareCases"
  | "legal.explainCitation"
  | "legal.riskIndicators"
  | "legal.summarize";

export type AISuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired";

export type AIEditorialField =
  | "title"
  | "short_description"
  | "recommendation"
  | "legal_explanation"
  | "immediate_actions"
  | "responsibilities"
  | "practice_tip"
  | "checklist"
  | "documentation"
  | "common_mistakes"
  | "faq"
  | "decision_tree";

export interface AISuggestion<T = unknown> {
  id: string;
  type: AITaskType;
  title: string;
  description: string;
  affectedField: AIEditorialField | null;
  originalContent: T | null;
  suggestedContent: T;
  reason: string;
  confidence: "low" | "medium" | "high";
  createdAt: string;
  status: AISuggestionStatus;
}

export interface ReviewReadinessReport {
  positives: string[];
  risks: string[];
  improvements: string[];
  recommendations: string[];
  createdAt: string;
}

export interface DuplicateCandidate {
  caseId: string;
  title: string;
  similarity: number; // 0..1
  differences: string[];
  overlap: string[];
}

export interface AIErrorPayload {
  code:
    | "rate_limited"
    | "credits_exhausted"
    | "invalid_response"
    | "network"
    | "aborted"
    | "server_error"
    | "unauthorized"
    | "bad_request";
  status?: number;
  userMessage: string;
  detail?: string;
}

export class AIError extends Error {
  code: AIErrorPayload["code"];
  status?: number;
  userMessage: string;
  detail?: string;
  constructor(p: AIErrorPayload) {
    super(p.userMessage);
    this.code = p.code;
    this.status = p.status;
    this.userMessage = p.userMessage;
    this.detail = p.detail;
  }
}
