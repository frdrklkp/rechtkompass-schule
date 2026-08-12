// PII-freier Kontext-Builder. Reduziert einen Fall auf die inhaltlichen
// Textfelder, die der KI übergeben werden dürfen. NIEMALS Autor-IDs,
// Reviewer-IDs, Versions-IDs oder interne Kommentare ausleiten.

import type { EditorialCaseRow } from "../types";
import type { CaseQualityAssessment } from "../quality/types";

export interface AICaseContext {
  id: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  short_description: string | null;
  short_answer?: string | null;
  immediate_actions?: string | null;
  recommendation?: string | null;
  legal_explanation?: string | null;
  responsibilities?: string | null;
  practice_tip?: string | null;
  checklist?: string[];
  documentation?: string[];
  common_mistakes?: string[];
  faq?: Array<{ q: string; a: string }>;
  ampel?: string | null;
}

const TEXT_FIELDS = [
  "short_answer",
  "immediate_actions",
  "recommendation",
  "legal_explanation",
  "responsibilities",
  "practice_tip",
  "ampel",
] as const;

const ARRAY_FIELDS = [
  "checklist",
  "documentation",
  "common_mistakes",
] as const;

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function asFaqArray(v: unknown): Array<{ q: string; a: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ q: string; a: string }> = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const q = typeof rec.q === "string" ? rec.q : "";
    const a = typeof rec.a === "string" ? rec.a : "";
    if (q && a) out.push({ q, a });
  }
  return out;
}

export function buildCaseContext(
  row: EditorialCaseRow & Record<string, unknown>,
): AICaseContext {
  const ctx: AICaseContext = {
    id: row.id,
    title: row.title,
    category: row.category ?? null,
    subcategory: row.subcategory ?? null,
    short_description: row.short_description ?? null,
  };
  const bag = ctx as unknown as Record<string, unknown>;
  for (const f of TEXT_FIELDS) {
    const val = row[f];
    if (typeof val === "string" && val.trim()) {
      bag[f] = val;
    }
  }
  for (const f of ARRAY_FIELDS) {
    const arr = asStringArray(row[f]);
    if (arr.length > 0) bag[f] = arr;
  }
  const faq = asFaqArray(row.faq);
  if (faq.length > 0) ctx.faq = faq;
  return ctx;
}

export interface AIQualityContext {
  score: number;
  percentage: number;
  readinessStatus: string;
  blockers: Array<{ id: string; title: string; field?: string | null }>;
  warnings: Array<{ id: string; title: string; field?: string | null }>;
}

export function buildQualityContext(
  a: CaseQualityAssessment,
): AIQualityContext {
  return {
    score: a.score,
    percentage: a.percentage,
    readinessStatus: a.readinessStatus,
    blockers: a.blockers.map((r) => ({
      id: r.ruleId,
      title: r.title,
      field: r.relatedField ?? null,
    })),
    warnings: a.warnings.map((r) => ({
      id: r.ruleId,
      title: r.title,
      field: r.relatedField ?? null,
    })),
  };
}
