/** Facade that runs parser → hierarchy → outline → statistics → validation. */
import { parseDocument, parserInfo } from "./parser/DocumentParser";
import { buildHierarchy, buildOutline } from "./HierarchyBuilder";
import { computeStatistics } from "./statistics";
import { validateTree } from "./SectionValidator";
import type { DocumentTree, SectionMetadata } from "./types";

export interface BuildInput {
  text: string;
  sourceId: string | null;
  sourceLabel: string;
  baseMetadata?: Partial<SectionMetadata>;
}

export function buildDocumentTree(input: BuildInput): DocumentTree {
  const parsed = parseDocument(input.text);
  const { root, flat } = buildHierarchy(parsed.events, {
    sourceId: input.sourceId,
    sourceLabel: input.sourceLabel,
    parserMethod: parsed.parserMethod,
    parserVersion: parsed.parserVersion,
    baseMetadata: input.baseMetadata,
  });
  const outline = buildOutline(root);
  const statistics = computeStatistics(root, flat);
  const validation = validateTree(root, flat);

  return {
    sourceId: input.sourceId,
    sourceLabel: input.sourceLabel,
    root,
    flat,
    outline,
    statistics,
    validation,
    parserMethod: parsed.parserMethod,
    parserVersion: parsed.parserVersion,
    createdAt: new Date().toISOString(),
  };
}

export { parserInfo };
