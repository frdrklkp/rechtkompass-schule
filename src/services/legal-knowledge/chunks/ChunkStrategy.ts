/**
 * ChunkStrategy — decides which chunking strategy applies to a SectionNode.
 * Legal structure has priority over character length.
 */
import type { SectionNode } from "../document/types";
import type { ChunkEngineOptions, ChunkType } from "./types";
import { estimateTokens } from "./ChunkTokenizer";

export interface StrategyDecision {
  chunkType: ChunkType;
  reason: string;
  requiresSplit: boolean;
  requiresMergeCandidate: boolean;
}

export function decideStrategy(
  node: SectionNode,
  opts: Required<Omit<ChunkEngineOptions, "baseMetadata">>,
): StrategyDecision {
  const contentText = collectFullText(node);
  const tokens = estimateTokens(contentText);

  const absaetze = node.children.filter((c) => c.type === "absatz");
  const definitions = node.children.filter((c) => c.type === "definition");
  const isTable = node.type === "table" || node.children.some((c) => c.type === "table");

  if (node.type === "annex") {
    return { chunkType: "annex", reason: "Anlage – als Einheit belassen", requiresSplit: false, requiresMergeCandidate: false };
  }
  if (node.type === "article") {
    return { chunkType: "article", reason: "Artikel – als Einheit belassen", requiresSplit: false, requiresMergeCandidate: false };
  }
  if (node.type === "definition") {
    return { chunkType: "definition", reason: "Legaldefinition", requiresSplit: false, requiresMergeCandidate: false };
  }
  if (node.type === "table" || isTable) {
    return { chunkType: "table", reason: "Tabellenstruktur – nicht aufteilen", requiresSplit: false, requiresMergeCandidate: false };
  }

  if (node.type === "paragraph") {
    if (definitions.length > 0) {
      return {
        chunkType: "paragraph_with_definitions",
        reason: "Paragraph enthält Legaldefinitionen",
        requiresSplit: false,
        requiresMergeCandidate: false,
      };
    }
    const oversized = opts.enableSplitting && tokens > opts.splitThresholdTokens && absaetze.length > 1;
    if (oversized) {
      return {
        chunkType: "split_paragraph_absatz",
        reason: `Paragraph groß (~${tokens} Tokens) – Aufteilung an Absätzen`,
        requiresSplit: true,
        requiresMergeCandidate: false,
      };
    }
    if (absaetze.length > 0) {
      return {
        chunkType: "paragraph_with_absaetze",
        reason: "Paragraph mit gegliederten Absätzen",
        requiresSplit: false,
        requiresMergeCandidate: false,
      };
    }
    return {
      chunkType: "paragraph",
      reason: "Einzelparagraph",
      requiresSplit: false,
      requiresMergeCandidate: tokens < opts.mergeThresholdTokens,
    };
  }

  // Structural nodes (chapter, section, subsection, book, title, part, subchapter)
  return {
    chunkType: "meta",
    reason: "Struktureller Knoten – Meta-Chunk (Titel + Präambel)",
    requiresSplit: false,
    requiresMergeCandidate: false,
  };
}

export function collectText(node: SectionNode): string {
  if (node.originalText.trim()) return node.originalText;
  // For paragraphs where content lives in absatz children, concatenate.
  const parts: string[] = [];
  const walk = (n: SectionNode) => {
    if (n.originalText.trim()) parts.push(n.originalText.trim());
    for (const c of n.children) walk(c);
  };
  for (const c of node.children) walk(c);
  return parts.join("\n\n");
}

/** Full subtree text (own + all descendants), used for size-based decisions. */
export function collectFullText(node: SectionNode): string {
  const parts: string[] = [];
  const walk = (n: SectionNode) => {
    if (n.originalText.trim()) parts.push(n.originalText.trim());
    for (const c of n.children) walk(c);
  };
  walk(node);
  return parts.join("\n\n");
}
