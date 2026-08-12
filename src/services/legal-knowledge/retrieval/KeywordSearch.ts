/**
 * Deterministische Keyword-Suche über bereits geladene Chunks.
 * Betrachtet: Titel, Path, Content, Metadata (law, paragraph, article),
 * Referenzen. Score = TF-Anteil pro Feld mit Gewichten.
 */
import type { PersistedChunk } from "../embeddings/repositories/InMemoryRepositories";
import type { KeywordSearchCandidate } from "./types";

const FIELD_WEIGHTS = {
  title: 3.0,
  displayPath: 2.5,
  law: 2.0,
  paragraph: 2.0,
  article: 1.8,
  keywords: 1.5,
  references: 1.2,
  content: 1.0,
};

function normalizeText(v: unknown): string {
  return (v ?? "").toString().toLowerCase();
}

function tokens(v: unknown): string[] {
  return normalizeText(v).split(/[^a-z0-9äöüß\-]+/i).filter((t) => t.length > 1);
}

function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;
  let idx = 0, count = 0;
  const t = term.toLowerCase();
  while ((idx = text.indexOf(t, idx)) !== -1) {
    count++; idx += t.length;
  }
  return count;
}

export interface KeywordSearchOptions {
  topK: number;
  minScore: number;
}

export const KeywordSearch = {
  search(
    chunks: PersistedChunk[],
    keywords: string[],
    opts: KeywordSearchOptions,
  ): KeywordSearchCandidate[] {
    if (keywords.length === 0) return [];
    const kws = keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 1);
    if (kws.length === 0) return [];

    const results: KeywordSearchCandidate[] = [];
    for (const c of chunks) {
      const md = c.metadata ?? {};
      const fields: Array<[keyof typeof FIELD_WEIGHTS, string]> = [
        ["title", normalizeText(c.displayTitle || c.title)],
        ["displayPath", normalizeText(c.displayPath || c.path)],
        ["law", normalizeText(md.law ?? md.sourceLabel)],
        ["paragraph", normalizeText(md.paragraph)],
        ["article", normalizeText(md.article)],
        ["keywords", normalizeText(Array.isArray((md as Record<string, unknown>).keywords)
          ? ((md as Record<string, unknown>).keywords as unknown[]).join(" ")
          : "")],
        ["references", normalizeText(Array.isArray(c.token) ? "" : "")],
        ["content", normalizeText(c.normalizedContent || c.content)],
      ];

      let score = 0;
      const matchedFields = new Set<string>();
      const matchedTerms = new Set<string>();
      for (const kw of kws) {
        for (const [field, text] of fields) {
          if (!text) continue;
          const hits = countOccurrences(text, kw);
          if (hits > 0) {
            const weight = FIELD_WEIGHTS[field];
            // dampen: log(1+hits)
            score += weight * Math.log(1 + hits);
            matchedFields.add(field);
            matchedTerms.add(kw);
          }
        }
      }
      if (score < opts.minScore) continue;
      results.push({
        chunkId: c.id,
        stableHash: c.stableHash,
        score,
        matchedFields: [...matchedFields],
        matchedTerms: [...matchedTerms],
      });
    }

    // Normiere Score in [0..1] anhand des Maximums.
    const maxScore = results.reduce((m, r) => Math.max(m, r.score), 0);
    if (maxScore > 0) {
      for (const r of results) r.score = r.score / maxScore;
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, opts.topK);
  },
};
