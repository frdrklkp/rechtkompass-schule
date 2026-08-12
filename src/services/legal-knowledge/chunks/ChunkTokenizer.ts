/**
 * Deterministic, embedding-agnostic token/word/sentence estimator.
 * Heuristic: 1 token ≈ 4 characters (matches OpenAI/Gemini order of magnitude).
 */
import type { ChunkTokenInfo, SectionReference } from "./types";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).length;
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-ZÄÖÜ])/u;

export function splitSentences(text: string): string[] {
  if (!text.trim()) return [];
  return text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
}

export function buildTokenInfo(text: string, references: SectionReference[] = []): ChunkTokenInfo {
  const characterCount = text.length;
  const wordCount = countWords(text);
  const sentences = splitSentences(text);
  const sentenceCount = sentences.length;
  const averageSentenceLength = sentenceCount
    ? Math.round((wordCount / sentenceCount) * 100) / 100
    : 0;
  return {
    characterCount,
    wordCount,
    tokenEstimate: estimateTokens(text),
    sentenceCount,
    averageSentenceLength,
    referenceCount: references.length,
  };
}
