// AIEditorialService – ruft die konsolidierte Server-Route auf, mappt
// Ergebnisse in AISuggestion-Objekte. Keine direkte Persistenz.

import type { CaseQualityAssessment } from "../quality/types";
import type { EditorialCaseRow } from "../types";
import { buildCaseContext, buildQualityContext } from "./AIContextBuilder";
import { mapHttpError, mapNetworkError } from "./AIErrorMapper";
import { enqueue } from "./AIRequestQueue";
import type {
  AIEditorialField,
  AISuggestion,
  AITaskType,
  DuplicateCandidate,
  ReviewReadinessReport,
} from "./types";

const ENDPOINT = "/api/ai-editorial-suggest";

const TASK_TO_FIELD: Partial<Record<AITaskType, AIEditorialField>> = {
  "improve.title": "title",
  "improve.shortDescription": "short_description",
  "improve.recommendation": "recommendation",
  "improve.legalExplanation": "legal_explanation",
  "generate.checklist": "checklist",
  "generate.faq": "faq",
  "generate.documentation": "documentation",
  "generate.practiceTips": "practice_tip",
  "generate.decisionTree": "decision_tree",
};

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto)
      return crypto.randomUUID();
  } catch {
    /* noop */
  }
  return `sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function postSuggest(body: Record<string, unknown>, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw mapNetworkError(err);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw mapHttpError(res.status, text);
  }
  return (await res.json()) as {
    value: unknown;
    reason?: string;
    confidence?: "low" | "medium" | "high";
  };
}

function originalFor(
  task: AITaskType,
  row: EditorialCaseRow & Record<string, unknown>,
): unknown {
  const field = TASK_TO_FIELD[task];
  if (!field) return null;
  return row[field] ?? null;
}

interface SuggestOptions {
  task: AITaskType;
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality?: CaseQualityAssessment | null;
  extra?: Record<string, unknown>;
  hint?: string;
  signal?: AbortSignal;
}

const TASK_TITLES: Record<AITaskType, string> = {
  "improve.title": "Titel verbessern",
  "improve.shortDescription": "Sachverhaltsbeschreibung erweitern",
  "improve.recommendation": "Handlungsempfehlung verbessern",
  "improve.legalExplanation": "Rechtliche Einordnung verbessern",
  "generate.checklist": "Checkliste generieren",
  "generate.faq": "FAQ generieren",
  "generate.documentation": "Dokumentationsschritte generieren",
  "generate.practiceTips": "Do's generieren",
  "generate.decisionTree": "Entscheidungsbaum entwerfen",
  "summarize.changes": "Änderungen zusammenfassen",
  "detect.duplicates": "Duplikate erkennen",
  "quality.improve": "Qualitätsprobleme adressieren",
  "review.readiness": "Review-Readiness-Report",
  "legal.analyzeCompleteness": "Juristische Vollständigkeit prüfen",
  "legal.suggestSources": "Rechtsgrundlagen vorschlagen",
  "legal.checkConsistency": "Konsistenz prüfen",
  "legal.checkDocumentation": "Dokumentation prüfen",
  "legal.compareCases": "Praxisfall vergleichen",
  "legal.explainCitation": "Zitationsbegründung",
  "legal.riskIndicators": "Redaktionelle Risiken",
  "legal.summarize": "Fachliche Zusammenfassung",
};

export const AIEditorialService = {
  async suggest<T = unknown>(opts: SuggestOptions): Promise<AISuggestion<T>> {
    const { task, caseRow, quality, extra, hint, signal } = opts;
    const key = `${caseRow.id}:${task}`;
    return enqueue(key, async () => {
      const payload = {
        task,
        case: buildCaseContext(caseRow),
        quality: quality ? buildQualityContext(quality) : null,
        hint: hint ?? null,
        extra: extra ?? null,
      };
      const res = await postSuggest(payload, signal);
      const field = TASK_TO_FIELD[task] ?? null;
      const suggestion: AISuggestion<T> = {
        id: newId(),
        type: task,
        title: TASK_TITLES[task],
        description: res.reason ?? "",
        affectedField: field,
        originalContent: field ? (originalFor(task, caseRow) as T) : null,
        suggestedContent: res.value as T,
        reason: res.reason ?? "",
        confidence: res.confidence ?? "medium",
        createdAt: new Date().toISOString(),
        status: "pending",
      };
      return suggestion;
    });
  },

  async detectDuplicates(
    caseRow: EditorialCaseRow & Record<string, unknown>,
    candidates: Array<{ id: string; title: string; short_description?: string | null; category?: string | null }>,
    signal?: AbortSignal,
  ): Promise<AISuggestion<DuplicateCandidate[]>> {
    return this.suggest<DuplicateCandidate[]>({
      task: "detect.duplicates",
      caseRow,
      extra: { candidates },
      signal,
    });
  },

  async summarizeChanges(
    caseRow: EditorialCaseRow & Record<string, unknown>,
    previous: Record<string, unknown>,
    current: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<AISuggestion<string[]>> {
    return this.suggest<string[]>({
      task: "summarize.changes",
      caseRow,
      extra: { previous, current },
      signal,
    });
  },

  async reviewReadiness(
    caseRow: EditorialCaseRow & Record<string, unknown>,
    quality: CaseQualityAssessment | null,
    signal?: AbortSignal,
  ): Promise<AISuggestion<ReviewReadinessReport>> {
    return this.suggest<ReviewReadinessReport>({
      task: "review.readiness",
      caseRow,
      quality,
      signal,
    });
  },
};

export type AIEditorialServiceType = typeof AIEditorialService;
