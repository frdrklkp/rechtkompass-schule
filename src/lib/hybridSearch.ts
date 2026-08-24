/**
 * Öffentlicher Einstieg für die intelligente Lehrersuche.
 * Kombiniert strukturierte Suche (intelligentSearch.ts) mit semantischer
 * Embedding-Suche über /api/search-embeddings-query.
 *
 * Fallback: bei Netzwerk-/API-Fehlern oder leerem Index wird die strukturierte
 * Suche als Antwort zurückgegeben. Kein Blockieren der Suche.
 */

import type { CaseData } from "@/data/cases";
import {
  searchPublishedPracticeCases,
  type IntelligentSearchResponse,
  type SearchResult,
} from "@/lib/intelligentSearch";
import { combineHybrid, type HybridCandidate, type SemanticHit } from "@/lib/hybridRanking";

export type HybridSearchResponse = IntelligentSearchResponse & {
  usedSemantic: boolean;
  semanticFallbackReason?: string;
};

export type HybridDetailed = HybridSearchResponse & {
  candidates: HybridCandidate[];
  semanticHits: SemanticHit[];
  structuredResults: SearchResult[];
};

function toSearchResult(h: HybridCandidate): SearchResult {
  return {
    case: h.case,
    relevanceScore: Math.round(h.finalScore * 100),
    confidenceLabel: h.confidenceLabel,
    matchedTerms: h.matchedTerms,
    matchedTopics: h.matchedTopics,
    matchReasons: h.matchReasons,
  };
}

async function fetchSemanticHits(query: string, limit: number): Promise<SemanticHit[]> {
  const res = await fetch("/api/search-embeddings-query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) throw new Error(`embedding query ${res.status}`);
  const json = (await res.json()) as { hits?: SemanticHit[] };
  return Array.isArray(json.hits) ? json.hits : [];
}

export async function searchPracticeCasesHybrid(
  query: string,
  cases: CaseData[],
  options?: { limit?: number; semanticCandidates?: number },
): Promise<HybridSearchResponse> {
  const limit = options?.limit ?? 5;
  const semanticCandidates = options?.semanticCandidates ?? 25;

  const structured = searchPublishedPracticeCases(query, cases, { limit: 25 });
  const q = query.trim();

  if (!q || structured.clarificationNeeded) {
    // Bei leerer oder unklarer Anfrage keinen Embedding-Call abfeuern.
    return { ...structured, usedSemantic: false };
  }

  let semanticHits: SemanticHit[] = [];
  let usedSemantic = false;
  let semanticFallbackReason: string | undefined;

  try {
    semanticHits = await fetchSemanticHits(q, semanticCandidates);
    usedSemantic = semanticHits.length > 0;
    if (!usedSemantic) semanticFallbackReason = "Kein Embedding-Treffer";
  } catch (err) {
    semanticFallbackReason = err instanceof Error ? err.message : "Embedding-Dienst nicht erreichbar";
  }

  // Wenn semantische Suche nicht verfügbar oder leer: strukturierte Antwort belassen.
  if (!usedSemantic) {
    return { ...structured, usedSemantic: false, semanticFallbackReason };
  }

  const combined = combineHybrid(structured.results, semanticHits, cases, { query: q }).slice(0, limit);
  const asResults = combined.map(toSearchResult);
  const bestMatch = asResults[0] ?? null;
  const alternatives = asResults.slice(1);
  const confidence = bestMatch ? bestMatch.relevanceScore / 100 : 0;

  return {
    ...structured,
    results: asResults,
    bestMatch,
    alternatives,
    confidence,
    usedSemantic: true,
  };
}

/**
 * Detailed variant that also exposes raw candidates, semantic hits and
 * structured results. Used by /admin/suchtest for the diagnostics view.
 * Same ranking pipeline as searchPracticeCasesHybrid — no behaviour change.
 */
export async function searchPracticeCasesHybridDetailed(
  query: string,
  cases: CaseData[],
  options?: { limit?: number; semanticCandidates?: number },
): Promise<HybridDetailed> {
  const limit = options?.limit ?? 5;
  const semanticCandidates = options?.semanticCandidates ?? 25;

  const structured = searchPublishedPracticeCases(query, cases, { limit: 25 });
  const q = query.trim();

  const emptyBase: HybridDetailed = {
    ...structured,
    usedSemantic: false,
    candidates: [],
    semanticHits: [],
    structuredResults: structured.results,
  };

  if (!q || structured.clarificationNeeded) return emptyBase;

  let semanticHits: SemanticHit[] = [];
  let usedSemantic = false;
  let semanticFallbackReason: string | undefined;
  try {
    semanticHits = await fetchSemanticHits(q, semanticCandidates);
    usedSemantic = semanticHits.length > 0;
    if (!usedSemantic) semanticFallbackReason = "Kein Embedding-Treffer";
  } catch (err) {
    semanticFallbackReason = err instanceof Error ? err.message : "Embedding-Dienst nicht erreichbar";
  }

  if (!usedSemantic) {
    return {
      ...emptyBase,
      semanticFallbackReason,
      semanticHits,
    };
  }

  const candidates = combineHybrid(structured.results, semanticHits, cases, { query: q });
  const top = candidates.slice(0, limit);
  const asResults = top.map(toSearchResult);
  const bestMatch = asResults[0] ?? null;
  const alternatives = asResults.slice(1);
  const confidence = bestMatch ? bestMatch.relevanceScore / 100 : 0;

  return {
    ...structured,
    results: asResults,
    bestMatch,
    alternatives,
    confidence,
    usedSemantic: true,
    candidates,
    semanticHits,
    structuredResults: structured.results,
  };
}
