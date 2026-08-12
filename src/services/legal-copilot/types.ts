/**
 * Sprint 4.2 – Grounded Legal Copilot.
 * Antworten ausschließlich auf Basis von Retrieval-Ergebnissen.
 * Keine freie Rechtsberatung. Kein KI-eigenes Wissen.
 */
import type { RetrievalCitation, RetrievalHit, RetrievalResult } from "../legal-knowledge/retrieval/types";

export const COPILOT_DOMAIN_VERSION = "1.0.0";

export type ExplanationMode = "kurz" | "standard" | "ausfuehrlich" | "juristisch" | "einfach";

export type CopilotRole = "system" | "user" | "assistant";

export interface CopilotFilters {
  bundesland?: string | null;
  schulform?: string | null;
  klassenstufe?: string | null;
  falltyp?: string | null;
  sourceIds?: string[];
}

export interface CopilotAskInput {
  question: string;
  sessionId?: string | null;
  mode?: ExplanationMode;
  filters?: CopilotFilters;
  debug?: boolean;
  /** Erzwingt Mock-Provider (Tests). */
  forceMock?: boolean;
}

export interface CopilotFollowUp {
  code: string;
  question: string;
  hint?: string;
}

export interface CopilotChecklistItem {
  id: string;
  label: string;
  role?: string;
}

export interface CopilotConfidence {
  retrieval: number;
  llm: number;
  sourceCoverage: number;
  reviewStatus: number;
  overall: number;
  level: "high" | "medium" | "low";
}

export interface CopilotAnswerSections {
  kurzantwort: string;
  einordnung: string;
  empfohleneHandlung: string[];
  begruendung: string;
  hinweise: string[];
  unsicherheiten: string[];
  typischeFehler: string[];
  naechsteSchritte: string[];
  disclaimer: string;
}

export interface CopilotAnswer {
  answered: boolean;
  reasonUnanswered?: string;
  sections: CopilotAnswerSections;
  citations: RetrievalCitation[];
  checklist: CopilotChecklistItem[];
  followUps: CopilotFollowUp[];
  confidence: CopilotConfidence;
  mode: ExplanationMode;
  promptVersion: string;
  domainVersion: string;
}

export interface CopilotTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface CopilotDebugPayload {
  systemPrompt: string;
  userPrompt: string;
  retrievalHits: Array<{
    chunkId: string;
    score: number;
    confidence: number;
    citation: string;
    excerpt: string;
  }>;
  scoreWeights: unknown;
  grounding: {
    allowedChunkIds: string[];
    droppedChunkIds: string[];
    reasonings: string[];
  };
  hallucinationReport: {
    ok: boolean;
    violations: string[];
  };
}

export interface CopilotStatistics {
  retrievalMs: number;
  llmMs: number;
  totalMs: number;
  candidates: number;
  hits: number;
  usedHits: number;
  tokens?: CopilotTokenUsage;
  providerId: string;
  model: string;
}

export interface CopilotDocumentSuggestion {
  id: string;
  name: string;
  description: string;
  reason: string;
  refIds: string[];
}

export interface CopilotTrustSignal {
  key: string;
  label: string;
  level: "green" | "yellow" | "red";
  value: string;
  hint: string;
}
export interface CopilotTrust {
  level: "green" | "yellow" | "red";
  summary: string;
  signals: CopilotTrustSignal[];
}

export interface CopilotWorkflowRecommendationDto {
  templateId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  categoryId: string | null;
  publicationTier: "internal" | "public";
  relevance: number;
  reason: string;
  estimatedMinutes: number;
  phaseCount: number;
  stepCount: number;
  matchedKeywords: string[];
  matchedRefIds: string[];
}

export interface CopilotResponse {
  sessionId: string;
  question: string;
  mode: ExplanationMode;
  answer: CopilotAnswer;
  templates: CopilotDocumentSuggestion[];
  workflows: CopilotWorkflowRecommendationDto[];
  trust: CopilotTrust;
  retrieval: {
    query: string;
    totalHits: number;
    topScore: number;
    latencyMs: number;
  };
  statistics: CopilotStatistics;
  debug?: CopilotDebugPayload | null;
  createdAt: string;
  domainVersion: string;
}

/** Interne Repräsentation eines Retrieval-Hits als grounded chunk. */
export interface GroundedChunk {
  refId: string; // "R1", "R2" — stabiler kurzer Identifier innerhalb dieser Antwort
  hit: RetrievalHit;
}

export interface CopilotContext {
  input: CopilotAskInput;
  mode: ExplanationMode;
  retrieval: RetrievalResult;
  grounded: GroundedChunk[];
  session: CopilotSessionSnapshot;
}

export interface CopilotSessionSnapshot {
  sessionId: string;
  createdAt: string;
  turns: CopilotSessionTurn[];
}

export interface CopilotSessionTurn {
  role: CopilotRole;
  at: string;
  question?: string;
  answerSummary?: string;
  chunkIds?: string[];
}

export interface CopilotProtocolExport {
  format: "markdown" | "html";
  content: string;
  fileName: string;
}
