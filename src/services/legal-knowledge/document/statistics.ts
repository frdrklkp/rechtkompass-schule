/** Deterministic statistics over a SectionNode tree. */
import type { DocumentStatistics, SectionNode } from "./types";

export function computeStatistics(root: SectionNode, flat: SectionNode[]): DocumentStatistics {
  const stats: DocumentStatistics = {
    chapters: 0,
    paragraphs: 0,
    articles: 0,
    absaetze: 0,
    sentences: 0,
    numbers: 0,
    definitions: 0,
    tables: 0,
    references: 0,
    annexes: 0,
    characters: 0,
    tokensEstimated: 0,
    parserConfidence: 0,
    averageDepth: 0,
    maxDepth: 0,
    sectionsTotal: 0,
  };

  let depthSum = 0;
  let confSum = 0;
  let counted = 0;

  for (const node of flat) {
    if (node.type === "document") continue;
    stats.sectionsTotal += 1;
    depthSum += node.depth;
    confSum += node.confidence;
    counted += 1;
    if (node.depth > stats.maxDepth) stats.maxDepth = node.depth;
    stats.characters += node.originalText.length;
    stats.references += node.references.length;

    switch (node.type) {
      case "chapter": case "subchapter": stats.chapters += 1; break;
      case "paragraph": stats.paragraphs += 1; break;
      case "article": stats.articles += 1; break;
      case "absatz": stats.absaetze += 1; break;
      case "sentence": stats.sentences += 1; break;
      case "number": stats.numbers += 1; break;
      case "definition": stats.definitions += 1; break;
      case "table": stats.tables += 1; break;
      case "annex": stats.annexes += 1; break;
      default: break;
    }
  }

  stats.averageDepth = counted ? Math.round((depthSum / counted) * 100) / 100 : 0;
  stats.parserConfidence = counted ? Math.round((confSum / counted) * 1000) / 1000 : 0;
  stats.tokensEstimated = Math.ceil(stats.characters / 4);
  // root is not counted above; include for sectionsTotal? keep excluded to reflect real content
  void root;
  return stats;
}
