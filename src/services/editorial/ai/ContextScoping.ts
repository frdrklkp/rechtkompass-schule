// Task-spezifische Kontextreduktion. Ziel: der KI immer nur das mitgeben,
// was sie für die konkrete Aufgabe braucht. Reduziert Tokens deutlich und
// verhindert, dass Modelle in irrelevante Felder driften.

import type { EditorialCaseRow } from "../types";
import type { CaseQualityAssessment } from "../quality/types";
import type { AITaskType } from "./types";
import { buildCaseContext, buildQualityContext } from "./AIContextBuilder";

type Row = EditorialCaseRow & Record<string, unknown>;

interface ScopedContext {
  case: Record<string, unknown>;
  quality?: unknown;
  scope: string[]; // Namen der übertragenen Felder – für Debug/Telemetry.
}

function pick(row: Row, fields: string[]): Record<string, unknown> {
  const full = buildCaseContext(row) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { id: full.id, title: full.title };
  for (const f of fields) {
    if (full[f] !== undefined) out[f] = full[f];
  }
  return out;
}

const TASK_FIELDS: Record<AITaskType, string[]> = {
  "improve.title": ["short_description", "category", "subcategory"],
  "improve.shortDescription": ["short_description", "category", "subcategory", "immediate_actions"],
  "improve.recommendation": [
    "short_description",
    "recommendation",
    "legal_explanation",
    "responsibilities",
  ],
  "improve.legalExplanation": [
    "short_description",
    "recommendation",
    "legal_explanation",
    "responsibilities",
  ],
  "generate.checklist": [
    "short_description",
    "recommendation",
    "responsibilities",
    "immediate_actions",
  ],
  "generate.faq": [
    "short_description",
    "recommendation",
    "legal_explanation",
    "checklist",
    "common_mistakes",
  ],
  "generate.documentation": [
    "short_description",
    "recommendation",
    "responsibilities",
  ],
  "generate.practiceTips": [
    "short_description",
    "recommendation",
    "checklist",
    "common_mistakes",
  ],
  "generate.decisionTree": [
    "short_description",
    "recommendation",
    "legal_explanation",
    "immediate_actions",
    "responsibilities",
  ],
  "summarize.changes": [], // alle bekannten Textfelder liefert der Aufrufer via extra
  "detect.duplicates": ["short_description", "category", "subcategory"],
  "quality.improve": [
    "short_description",
    "recommendation",
    "legal_explanation",
    "checklist",
    "faq",
    "documentation",
    "practice_tip",
  ],
  "review.readiness": [
    "short_description",
    "recommendation",
    "legal_explanation",
    "responsibilities",
    "immediate_actions",
    "practice_tip",
    "checklist",
    "faq",
    "documentation",
    "common_mistakes",
  ],
  // Legal Intelligence – nutzt reichhaltigen Kontext inkl. Rechtsfeldern.
  "legal.analyzeCompleteness": [
    "short_description", "recommendation", "legal_explanation",
    "responsibilities", "immediate_actions", "practice_tip",
    "checklist", "documentation", "faq", "common_mistakes",
  ],
  "legal.suggestSources": [
    "short_description", "recommendation", "legal_explanation",
    "immediate_actions", "responsibilities",
  ],
  "legal.checkConsistency": [
    "short_description", "recommendation", "legal_explanation",
    "immediate_actions", "responsibilities", "checklist", "faq", "documentation",
  ],
  "legal.checkDocumentation": [
    "short_description", "recommendation", "documentation",
    "responsibilities", "immediate_actions",
  ],
  "legal.compareCases": [
    "short_description", "recommendation", "legal_explanation", "category", "subcategory",
  ],
  "legal.explainCitation": [
    "short_description", "recommendation", "legal_explanation",
  ],
  "legal.riskIndicators": [
    "short_description", "recommendation", "legal_explanation",
    "responsibilities", "documentation", "checklist",
  ],
  "legal.summarize": [
    "short_description", "recommendation", "legal_explanation",
  ],
};

/**
 * Baut den minimal ausreichenden Kontext für die gewünschte Task-Art.
 * Für `review.readiness` und `quality.improve` wird immer der Quality-
 * Kontext mitgesendet, sonst nur, wenn der Aufrufer ihn liefert.
 */
export function buildScopedContext(
  task: AITaskType,
  row: Row,
  quality?: CaseQualityAssessment | null,
): ScopedContext {
  const fields = TASK_FIELDS[task] ?? [];
  const caseCtx =
    fields.length === 0
      ? (buildCaseContext(row) as unknown as Record<string, unknown>)
      : pick(row, fields);
  const includeQuality =
    task === "review.readiness" ||
    task === "quality.improve" ||
    (!!quality && quality.blockers.length + quality.warnings.length > 0);
  return {
    case: caseCtx as Record<string, unknown>,
    quality: includeQuality && quality ? buildQualityContext(quality) : undefined,
    scope: Object.keys(caseCtx),
  };
}
