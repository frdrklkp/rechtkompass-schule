/**
 * Public API for building, persisting and loading a document tree.
 * All operations are deterministic. No AI, no embeddings.
 */
import { buildDocumentTree } from "./DocumentTreeBuilder";
import { SectionRepository } from "./SectionRepository";
import type { DocumentTree, SectionMetadata } from "./types";

export interface BuildFromSourceInput {
  sourceId: string;
  sourceLabel: string;
  text: string;
  baseMetadata?: Partial<SectionMetadata>;
}

export const DocumentStructureService = {
  build(input: BuildFromSourceInput): DocumentTree {
    return buildDocumentTree({
      text: input.text,
      sourceId: input.sourceId,
      sourceLabel: input.sourceLabel,
      baseMetadata: input.baseMetadata,
    });
  },

  async buildAndPersist(input: BuildFromSourceInput) {
    const tree = this.build(input);
    if (!tree.validation.ok) {
      // Persist anyway if only warnings; block only on errors.
      if (tree.validation.errors.length > 0) {
        return { tree, persisted: null as null | Awaited<ReturnType<typeof SectionRepository.replaceForSource>> };
      }
    }
    const persisted = await SectionRepository.replaceForSource(input.sourceId, tree);
    return { tree, persisted };
  },

  async loadForSource(sourceId: string) {
    const [sections, references] = await Promise.all([
      SectionRepository.listForSource(sourceId),
      SectionRepository.listReferencesForSource(sourceId),
    ]);
    return { sections, references };
  },

  export: {
    json(tree: DocumentTree): string {
      return JSON.stringify(tree, null, 2);
    },
    outline(tree: DocumentTree): string {
      return JSON.stringify(tree.outline, null, 2);
    },
    metadata(tree: DocumentTree): string {
      return JSON.stringify({
        sourceLabel: tree.sourceLabel,
        statistics: tree.statistics,
        parserMethod: tree.parserMethod,
        parserVersion: tree.parserVersion,
        createdAt: tree.createdAt,
      }, null, 2);
    },
    tree(tree: DocumentTree): string {
      const lines: string[] = [];
      const walk = (n: typeof tree.root, indent = 0) => {
        if (n.type !== "document") {
          lines.push(`${"  ".repeat(indent)}${n.displayTitle}`);
        }
        for (const c of n.children) walk(c, indent + 1);
      };
      walk(tree.root);
      return lines.join("\n");
    },
  },
};
