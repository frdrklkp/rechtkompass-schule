/**
 * Diagnose-Pipeline für die Praxisfall-Suche.
 * Rein auswertend — verändert weder Ranking noch Suche.
 *
 * v3:
 *  - Zentrale Evaluationsfunktion (Single Source of Truth) auf caseId-Basis.
 *  - Titel-Fragmente dienen nur zur Auflösung, wenn keine expectedCaseIds gesetzt sind,
 *    und liefern sonst nur Diagnose-Kontext — NIE Accuracy.
 *  - Neue Fehlerklassen: NEAR_MISS, GROUND_TRUTH_CASE_MISSING.
 *  - Konsistenz-Assertions garantieren: isTop1 ⇔ expectedRank===1.
 */

import type { CaseData } from "@/data/cases";
import {
  searchPublishedPracticeCases,
  type IntelligentSearchResponse,
  type SearchResult,
} from "@/lib/intelligentSearch";
import { expandSearch } from "@/lib/synonyms";
import {
  combineHybrid,
  HYBRID_WEIGHT_VARIANTS,
  type HybridCandidate,
  type HybridWeights,
  type SemanticHit,
} from "@/lib/hybridRanking";
import { extractQuerySignals, type CaseSignals } from "@/lib/searchSignals";
import type { SearchTestCase } from "@/lib/searchTestSet";

export const DIAGNOSTIC_VERSION = "v3";

export type ErrorClass =
  | "OK"
  | "NEAR_MISS"
  | "CONTENT_GAP"
  | "AMBIGUOUS"
  | "GROUND_TRUTH_CASE_MISSING"
  | "SEARCH_DOCUMENT_WEAK"
  | "TOPIC_DETECTION_WRONG"
  | "SEMANTIC_FALSE_POSITIVE"
  | "STRUCTURED_SCORE_TOO_STRONG"
  | "LEGAL_CONTEXT_WRONG"
  | "SIGNAL_MISMATCH"
  | "DUPLICATE_OR_OVERLAPPING_CASES";

export const ERROR_CLASS_LABEL: Record<ErrorClass, string> = {
  OK: "OK (Top-1)",
  NEAR_MISS: "Near-Miss (Top-3)",
  CONTENT_GAP: "Content Gap (redaktionell)",
  AMBIGUOUS: "Mehrdeutig (redaktionell)",
  GROUND_TRUTH_CASE_MISSING: "Ground-Truth-Fall fehlt im Korpus",
  SEARCH_DOCUMENT_WEAK: "Search Document schwach",
  TOPIC_DETECTION_WRONG: "Thema falsch erkannt",
  SEMANTIC_FALSE_POSITIVE: "Semantik-Fehlpass",
  STRUCTURED_SCORE_TOO_STRONG: "Strukturscore zu stark",
  LEGAL_CONTEXT_WRONG: "Rechts-Kontext verzerrt",
  SIGNAL_MISMATCH: "Signal-Mismatch",
  DUPLICATE_OR_OVERLAPPING_CASES: "Fälle inhaltlich zu ähnlich",
};

// ─── Ground-Truth-Auflösung ───────────────────────────────────────────────

export type GroundTruth = {
  /** Alle akzeptierten caseIds (expected + acceptable). Leer ⇒ nicht bewertbar. */
  acceptedCaseIds: string[];
  /** Wie wurde die GT bestimmt? */
  resolution: "explicit" | "title-fragment" | "none";
  /** IDs die explizit im Testset stehen, aber im Korpus nicht existieren. */
  missingCaseIds: string[];
};

function resolveGroundTruth(t: SearchTestCase, cases: CaseData[]): GroundTruth {
  const explicit = [...(t.expectedCaseIds ?? []), ...(t.acceptableCaseIds ?? [])];
  if (explicit.length > 0) {
    const known = new Set(cases.map((c) => c.id));
    const present = explicit.filter((id) => known.has(id));
    const missing = explicit.filter((id) => !known.has(id));
    return {
      acceptedCaseIds: present,
      resolution: "explicit",
      missingCaseIds: missing,
    };
  }
  // Fallback: Titel-/Tag-Fragmente. Wir sammeln ALLE passenden Fälle
  // (nicht nur den ersten) — sonst kollidieren Badge und Rang.
  const fragments = [
    ...t.expectedTopMatchTitleContains,
    ...(t.acceptableAlternativesTitleContains ?? []),
  ].map((f) => f.toLowerCase());
  if (fragments.length === 0) {
    return { acceptedCaseIds: [], resolution: "none", missingCaseIds: [] };
  }
  const matched: string[] = [];
  for (const c of cases) {
    const title = (c.title ?? "").toLowerCase();
    const tags = (c.tags ?? []).map((t) => t.toLowerCase());
    if (
      fragments.some((f) => title.includes(f) || tags.some((tg) => tg.includes(f)))
    ) {
      matched.push(c.id);
    }
  }
  return {
    acceptedCaseIds: matched,
    resolution: matched.length ? "title-fragment" : "none",
    missingCaseIds: [],
  };
}

// ─── Single Source of Truth: Evaluation ───────────────────────────────────

export type EvaluationStatus =
  | "TOP_1"
  | "TOP_3"
  | "MISS"
  | "CONTENT_GAP"
  | "AMBIGUOUS"
  | "GROUND_TRUTH_MISSING";

export type Evaluation = {
  evaluable: boolean;
  status: EvaluationStatus;
  isTop1: boolean;
  isTop3: boolean;
  expectedRank: number | null;
  matchedCaseId: string | null;
  acceptedCaseIds: string[];
  resolution: GroundTruth["resolution"];
  missingCaseIds: string[];
};

/**
 * Zentrale Bewertungsfunktion. ALLES (Badge, Rang, Aggregat, Fehlerklasse)
 * MUSS diese Funktion verwenden.
 */
export function evaluateSearchResult(
  test: SearchTestCase,
  rankedCaseIds: string[],
  cases: CaseData[],
): Evaluation {
  const gt = resolveGroundTruth(test, cases);

  if (test.audit === "CONTENT_GAP") {
    return {
      evaluable: false,
      status: "CONTENT_GAP",
      isTop1: false,
      isTop3: false,
      expectedRank: null,
      matchedCaseId: null,
      acceptedCaseIds: gt.acceptedCaseIds,
      resolution: gt.resolution,
      missingCaseIds: gt.missingCaseIds,
    };
  }
  if (test.audit === "AMBIGUOUS_EXPECTATION") {
    return {
      evaluable: false,
      status: "AMBIGUOUS",
      isTop1: false,
      isTop3: false,
      expectedRank: null,
      matchedCaseId: null,
      acceptedCaseIds: gt.acceptedCaseIds,
      resolution: gt.resolution,
      missingCaseIds: gt.missingCaseIds,
    };
  }
  if (gt.acceptedCaseIds.length === 0) {
    return {
      evaluable: false,
      status: "GROUND_TRUTH_MISSING",
      isTop1: false,
      isTop3: false,
      expectedRank: null,
      matchedCaseId: null,
      acceptedCaseIds: [],
      resolution: gt.resolution,
      missingCaseIds: gt.missingCaseIds,
    };
  }

  const accepted = new Set(gt.acceptedCaseIds);
  let expectedRank: number | null = null;
  let matched: string | null = null;
  for (let i = 0; i < rankedCaseIds.length; i++) {
    if (accepted.has(rankedCaseIds[i])) {
      expectedRank = i + 1;
      matched = rankedCaseIds[i];
      break;
    }
  }
  const isTop1 = expectedRank === 1;
  const isTop3 = expectedRank !== null && expectedRank <= 3;
  const status: EvaluationStatus = isTop1 ? "TOP_1" : isTop3 ? "TOP_3" : "MISS";

  // Konsistenz-Assertion (defensiv; wirft nur in Dev).
  if (isTop1 && expectedRank !== 1) {
    throw new Error(`Evaluation inkonsistent: isTop1=true aber expectedRank=${expectedRank}`);
  }
  if (isTop3 && (expectedRank === null || expectedRank > 3)) {
    throw new Error(`Evaluation inkonsistent: isTop3=true aber expectedRank=${expectedRank}`);
  }

  return {
    evaluable: true,
    status,
    isTop1,
    isTop3,
    expectedRank,
    matchedCaseId: matched,
    acceptedCaseIds: gt.acceptedCaseIds,
    resolution: gt.resolution,
    missingCaseIds: gt.missingCaseIds,
  };
}

// ─── Diagnose-Typen ───────────────────────────────────────────────────────

export type CandidateDiag = {
  caseId: string;
  title: string;
  category?: string;
  semantic: number;
  structured: number;
  topics: number;
  legal: number;
  quality: number;
  intentScore: number;
  participantScore: number;
  situationScore: number;
  actionScore: number;
  signalScore: number;
  negativeMismatchPenalty: number;
  baseScore: number;
  finalScore: number;
  matchedTerms: string[];
  matchedTopics: string[];
  matchReasons: string[];
  penaltyReasons: string[];
  isAccepted: boolean;
};

export type BaselineDiag = {
  caseId: string;
  title: string;
  relevanceScore: number;
  isAccepted: boolean;
};

export type VariantDiag = {
  variantId: string;
  variantLabel: string;
  weights: HybridWeights;
  hybridTop5: CandidateDiag[];
  evaluation: Evaluation;
  gapTop1Top2: number;
};

export type TestDiagnosis = {
  test: SearchTestCase;
  querySignals: CaseSignals;
  detectedTopics: string[];
  detectedKeywords: string[];
  expandedTerms: string[];
  // Referenz-Variante A:
  hybridTop5: CandidateDiag[];
  structuredTop5: BaselineDiag[];
  evaluation: Evaluation; // Single Source of Truth (Variante A)
  structuredEvaluation: Evaluation;
  gapTop1Top2Hybrid: number;
  gapTop1Top2Structured: number;
  hybridNoResult: boolean;
  structuredNoResult: boolean;
  usedSemantic: boolean;
  errorClass: ErrorClass;
  errorReason: string;
  variants: VariantDiag[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function toCandidateDiag(c: HybridCandidate, accepted: Set<string>): CandidateDiag {
  return {
    caseId: c.case.id,
    title: c.case.title,
    category: c.case.category,
    semantic: c.semantic,
    structured: c.structured,
    topics: c.topics,
    legal: c.legal,
    quality: c.quality,
    intentScore: c.intentScore,
    participantScore: c.participantScore,
    situationScore: c.situationScore,
    actionScore: c.actionScore,
    signalScore: c.signalScore,
    negativeMismatchPenalty: c.negativeMismatchPenalty,
    baseScore: c.baseScore,
    finalScore: c.finalScore,
    matchedTerms: c.matchedTerms,
    matchedTopics: c.matchedTopics,
    matchReasons: c.matchReasons,
    penaltyReasons: c.penaltyReasons,
    isAccepted: accepted.has(c.case.id),
  };
}

function toBaselineDiag(r: SearchResult, accepted: Set<string>): BaselineDiag {
  return {
    caseId: r.case.id,
    title: r.case.title,
    relevanceScore: r.relevanceScore,
    isAccepted: accepted.has(r.case.id),
  };
}

async function fetchSemanticHits(query: string, limit: number): Promise<SemanticHit[]> {
  try {
    const res = await fetch("/api/search-embeddings-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { hits?: SemanticHit[] };
    return Array.isArray(json.hits) ? json.hits : [];
  } catch {
    return [];
  }
}

function evalVariant(
  test: SearchTestCase,
  cases: CaseData[],
  structured: IntelligentSearchResponse,
  semanticHits: SemanticHit[],
  variant: { id: string; label: string; weights: HybridWeights },
): VariantDiag {
  const candidates = combineHybrid(structured.results, semanticHits, cases, {
    weights: variant.weights,
    query: test.query,
    applyNegativePenalty: true,
  });
  const rankedIds = candidates.map((c) => c.case.id);
  const evaluation = evaluateSearchResult(test, rankedIds, cases);
  const accepted = new Set(evaluation.acceptedCaseIds);
  const top5 = candidates.slice(0, 5).map((c) => toCandidateDiag(c, accepted));
  const gap = top5.length >= 2 ? top5[0].finalScore - top5[1].finalScore : 0;

  return {
    variantId: variant.id,
    variantLabel: variant.label,
    weights: variant.weights,
    hybridTop5: top5,
    evaluation,
    gapTop1Top2: Math.round(gap * 1000) / 1000,
  };
}

function classifyError(input: {
  test: SearchTestCase;
  variantA: VariantDiag;
  structured: IntelligentSearchResponse;
  semanticHits: SemanticHit[];
  cases: CaseData[];
}): { errorClass: ErrorClass; reason: string } {
  const { test, variantA, structured, semanticHits, cases } = input;
  const ev = variantA.evaluation;

  if (ev.status === "CONTENT_GAP")
    return { errorClass: "CONTENT_GAP", reason: "Redaktionell als Content-Gap markiert." };
  if (ev.status === "AMBIGUOUS")
    return { errorClass: "AMBIGUOUS", reason: "Redaktionell als mehrdeutig markiert." };
  if (ev.status === "GROUND_TRUTH_MISSING") {
    const detail = ev.missingCaseIds.length
      ? `Referenzierte caseIds nicht im Korpus: ${ev.missingCaseIds.slice(0, 3).join(", ")}.`
      : "Keine caseIds hinterlegt und Titel-Fragmente lösen keinen Fall auf.";
    return { errorClass: "GROUND_TRUTH_CASE_MISSING", reason: detail };
  }
  if (ev.isTop1) return { errorClass: "OK", reason: "Top-1 passt." };
  if (ev.isTop3) return { errorClass: "NEAR_MISS", reason: `Erwarteter Fall auf Rang ${ev.expectedRank}.` };

  // MISS — jetzt Ursachenanalyse
  const accepted = new Set(ev.acceptedCaseIds);
  const inSemantic = semanticHits.some((h) => accepted.has(h.caseId));
  const inStructured = structured.results.some((r) => accepted.has(r.case.id));
  if (!inSemantic && !inStructured) {
    return {
      errorClass: "SEARCH_DOCUMENT_WEAK",
      reason: "Kein akzeptierter Fall in Top-Semantik ODER Top-Struktur.",
    };
  }
  if (!inSemantic && inStructured) {
    return {
      errorClass: "SEARCH_DOCUMENT_WEAK",
      reason: "Akzeptierte Fälle nur in Struktur-Suche, nicht in Semantik-Top.",
    };
  }

  const top1 = variantA.hybridTop5[0];
  const expected = variantA.hybridTop5.find((c) => c.isAccepted) ?? null;
  if (top1 && expected) {
    const delta = top1.finalScore - expected.finalScore;
    if (top1.semantic > expected.semantic + 0.15 && top1.structured < 0.2) {
      const topicOverlap = top1.matchedTopics.some((t) => expected.matchedTopics.includes(t));
      if (!topicOverlap) {
        return {
          errorClass: "SEMANTIC_FALSE_POSITIVE",
          reason: `Falscher Top-1 gewinnt fast nur semantisch (Δ ${delta.toFixed(3)}).`,
        };
      }
    }
    if (top1.structured > expected.structured + 0.3 && top1.semantic < expected.semantic) {
      return {
        errorClass: "STRUCTURED_SCORE_TOO_STRONG",
        reason: `Falscher Top-1 gewinnt durch Keyword-Score (struct ${top1.structured.toFixed(2)} vs. ${expected.structured.toFixed(2)}).`,
      };
    }
    if (top1.signalScore > expected.signalScore + 0.2) {
      return {
        errorClass: "SIGNAL_MISMATCH",
        reason: `Signal-Score des falschen Top-1 dominiert (${top1.signalScore.toFixed(2)} vs. ${expected.signalScore.toFixed(2)}).`,
      };
    }
    if (delta < 0.03 && top1.category === expected.category) {
      return {
        errorClass: "DUPLICATE_OR_OVERLAPPING_CASES",
        reason: `Sehr enger Score-Abstand (${delta.toFixed(3)}) und gleiche Kategorie.`,
      };
    }
  }

  const expectedCase = cases.find((c) => accepted.has(c.id));
  if (expectedCase && structured.detectedTopics.length > 0) {
    const expectedCat = (expectedCase.category ?? "").toLowerCase();
    const detected = structured.detectedTopics.map((t) => t.toLowerCase());
    const overlap = detected.some((t) => expectedCat.includes(t) || t.includes(expectedCat));
    if (!overlap) {
      return {
        errorClass: "TOPIC_DETECTION_WRONG",
        reason: `Erkannte Themen [${structured.detectedTopics.join(", ")}] passen nicht zur Kategorie „${expectedCase.category}".`,
      };
    }
  }

  return { errorClass: "SEMANTIC_FALSE_POSITIVE", reason: "Ranking-Ursache nicht eindeutig." };
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function diagnoseTest(
  t: SearchTestCase,
  cases: CaseData[],
): Promise<TestDiagnosis> {
  const structured = searchPublishedPracticeCases(t.query, cases, { limit: 25 });
  const semanticHits =
    !t.query.trim() || structured.clarificationNeeded
      ? []
      : await fetchSemanticHits(t.query, 25);
  const usedSemantic = semanticHits.length > 0;

  const variants = HYBRID_WEIGHT_VARIANTS.map((v) =>
    evalVariant(t, cases, structured, semanticHits, v),
  );
  const variantA = variants[0];

  const structuredRankedIds = structured.results.map((r) => r.case.id);
  const structuredEvaluation = evaluateSearchResult(t, structuredRankedIds, cases);
  const acceptedSet = new Set(variantA.evaluation.acceptedCaseIds);
  const structuredTop5 = structured.results.slice(0, 5).map((r) => toBaselineDiag(r, acceptedSet));
  const gapStruct =
    structuredTop5.length >= 2 ? structuredTop5[0].relevanceScore - structuredTop5[1].relevanceScore : 0;

  const { errorClass, reason } = classifyError({
    test: t,
    variantA,
    structured,
    semanticHits,
    cases,
  });

  const tokens = structured.detectedKeywords;
  const expanded = Array.from(new Set(tokens.flatMap((tok) => expandSearch(tok))));

  return {
    test: t,
    querySignals: extractQuerySignals(t.query),
    detectedTopics: structured.detectedTopics,
    detectedKeywords: tokens,
    expandedTerms: expanded,
    hybridTop5: variantA.hybridTop5,
    structuredTop5,
    evaluation: variantA.evaluation,
    structuredEvaluation,
    gapTop1Top2Hybrid: variantA.gapTop1Top2,
    gapTop1Top2Structured: Math.round(gapStruct * 10) / 10,
    hybridNoResult: variantA.hybridTop5.length === 0,
    structuredNoResult: structuredTop5.length === 0,
    usedSemantic,
    errorClass,
    errorReason: reason,
    variants,
  };
}

// ─── Aggregate ────────────────────────────────────────────────────────────

export type VariantMetrics = {
  variantId: string;
  variantLabel: string;
  weights: HybridWeights;
  evaluableCount: number;
  top1Pct: number;
  top3Pct: number;
  wrongTop1: number;
  avgGap: number;
  topicRobustness: number;
};

export type AggregateMetrics = {
  n: number;
  nEvaluable: number;
  hybridTop1Pct: number;
  hybridTop3Pct: number;
  structuredTop1Pct: number;
  structuredTop3Pct: number;
  hybridNoRes: number;
  structuredNoRes: number;
  avgGapHybrid: number;
  avgGapStructured: number;
  contentGaps: number;
  ambiguous: number;
  groundTruthMissing: number;
  errorClassCounts: Record<ErrorClass, number>;
  variants: VariantMetrics[];
  winnerVariantId: string | null;
};

function categoryTop1Min(diags: TestDiagnosis[], variantIdx: number): number {
  const perCat = new Map<string, { ok: number; total: number }>();
  for (const d of diags) {
    const v = d.variants[variantIdx];
    if (!v?.evaluation.evaluable) continue;
    const cat = d.test.category ?? "?";
    const cur = perCat.get(cat) ?? { ok: 0, total: 0 };
    cur.total += 1;
    if (v.evaluation.isTop1) cur.ok += 1;
    perCat.set(cat, cur);
  }
  if (perCat.size === 0) return 0;
  let min = 1;
  for (const { ok, total } of perCat.values()) {
    const q = total > 0 ? ok / total : 0;
    if (q < min) min = q;
  }
  return Math.round(min * 100) / 100;
}

export function aggregateDiagnoses(diags: TestDiagnosis[]): AggregateMetrics {
  const n = diags.length;
  const evaluable = diags.filter((d) => d.evaluation.evaluable);
  const nE = evaluable.length || 1;

  const counts: Record<ErrorClass, number> = {
    OK: 0, NEAR_MISS: 0, CONTENT_GAP: 0, AMBIGUOUS: 0, GROUND_TRUTH_CASE_MISSING: 0,
    SEARCH_DOCUMENT_WEAK: 0, TOPIC_DETECTION_WRONG: 0, SEMANTIC_FALSE_POSITIVE: 0,
    STRUCTURED_SCORE_TOO_STRONG: 0, LEGAL_CONTEXT_WRONG: 0, SIGNAL_MISMATCH: 0,
    DUPLICATE_OR_OVERLAPPING_CASES: 0,
  };
  for (const d of diags) counts[d.errorClass]++;

  const pct = (x: number) => Math.round((x / nE) * 100);

  const variants: VariantMetrics[] = HYBRID_WEIGHT_VARIANTS.map((v, idx) => {
    const rows = diags.map((d) => d.variants[idx]).filter((r) => r?.evaluation.evaluable);
    const top1 = rows.filter((r) => r.evaluation.isTop1).length;
    const top3 = rows.filter((r) => r.evaluation.isTop3).length;
    const wrongTop1 = rows.length - top1;
    const avgGap =
      Math.round(
        (rows.reduce((a, r) => a + r.gapTop1Top2, 0) / Math.max(1, rows.length)) * 1000,
      ) / 1000;
    return {
      variantId: v.id,
      variantLabel: v.label,
      weights: v.weights,
      evaluableCount: rows.length,
      top1Pct: rows.length ? Math.round((top1 / rows.length) * 100) : 0,
      top3Pct: rows.length ? Math.round((top3 / rows.length) * 100) : 0,
      wrongTop1,
      avgGap,
      topicRobustness: categoryTop1Min(diags, idx),
    };
  });

  const referenceTop3 = variants[0]?.top3Pct ?? 0;
  const eligible = variants.filter((v) => v.top3Pct >= referenceTop3 - 10);
  const winner = eligible
    .map((v) => ({
      v,
      score: v.top1Pct * 2 + v.top3Pct + v.topicRobustness * 20 - v.wrongTop1,
    }))
    .sort((a, b) => b.score - a.score)[0];

  return {
    n,
    nEvaluable: evaluable.length,
    hybridTop1Pct: pct(evaluable.filter((d) => d.evaluation.isTop1).length),
    hybridTop3Pct: pct(evaluable.filter((d) => d.evaluation.isTop3).length),
    structuredTop1Pct: pct(evaluable.filter((d) => d.structuredEvaluation.isTop1).length),
    structuredTop3Pct: pct(evaluable.filter((d) => d.structuredEvaluation.isTop3).length),
    hybridNoRes: diags.filter((d) => d.hybridNoResult).length,
    structuredNoRes: diags.filter((d) => d.structuredNoResult).length,
    avgGapHybrid:
      Math.round(
        (diags.reduce((a, d) => a + d.gapTop1Top2Hybrid, 0) / Math.max(1, n)) * 1000,
      ) / 1000,
    avgGapStructured:
      Math.round(
        (diags.reduce((a, d) => a + d.gapTop1Top2Structured, 0) / Math.max(1, n)) * 10,
      ) / 10,
    contentGaps: diags.filter((d) => d.evaluation.status === "CONTENT_GAP").length,
    ambiguous: diags.filter((d) => d.evaluation.status === "AMBIGUOUS").length,
    groundTruthMissing: diags.filter((d) => d.evaluation.status === "GROUND_TRUTH_MISSING").length,
    errorClassCounts: counts,
    variants,
    winnerVariantId: winner?.v.variantId ?? null,
  };
}
