/**
 * Reference resolver stub. Currently only annotates references with
 * candidate lookup targets. Real resolution against persisted sections is
 * deferred to a later sprint (needs global cross-document graph).
 */
import type { DocumentTree, SectionNode } from "./types";

export interface ResolvedReference {
  sourceLocalId: string;
  raw: string;
  refType: string;
  refValue: Record<string, string>;
  candidateLocalId: string | null;
  confidence: number;
}

export function resolveInternalReferences(tree: DocumentTree): ResolvedReference[] {
  const byParagraph = new Map<string, SectionNode>();
  const byArticle = new Map<string, SectionNode>();
  const byAnnex = new Map<string, SectionNode>();

  for (const n of tree.flat) {
    if (n.type === "paragraph" && n.number) byParagraph.set(n.number, n);
    if (n.type === "article" && n.number) byArticle.set(n.number, n);
    if (n.type === "annex" && n.number) byAnnex.set(n.number, n);
  }

  const results: ResolvedReference[] = [];
  for (const n of tree.flat) {
    for (const ref of n.references) {
      let candidate: SectionNode | undefined;
      if (ref.refType === "paragraph" && ref.refValue.paragraph) candidate = byParagraph.get(ref.refValue.paragraph);
      else if (ref.refType === "article" && ref.refValue.article) candidate = byArticle.get(ref.refValue.article);
      else if (ref.refType === "annex" && ref.refValue.annex) candidate = byAnnex.get(ref.refValue.annex);

      results.push({
        sourceLocalId: n.localId,
        raw: ref.raw,
        refType: ref.refType,
        refValue: ref.refValue,
        candidateLocalId: candidate?.localId ?? null,
        confidence: candidate ? ref.confidence : 0,
      });
    }
  }
  return results;
}
