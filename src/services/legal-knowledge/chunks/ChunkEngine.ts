/**
 * ChunkEngine — orchestrates chunk generation from a DocumentTree.
 * Deterministic, idempotent, incrementally invocable per section subtree.
 * No embeddings, no AI. Sprint 4.1C.
 */
import type { DocumentTree, SectionNode } from "../document/types";
import type {
  ChunkCollection,
  ChunkEngineOptions,
  ChunkNode,
  ChunkMetadata,
} from "./types";
import { CHUNK_ENGINE_VERSION, DEFAULT_CHUNK_ENGINE_OPTIONS } from "./types";
import { decideStrategy } from "./ChunkStrategy";
import { buildChunksForNode, mergeSmallSiblings, type BuildChunkContext } from "./ChunkBuilder";
import { linkChunkHierarchy } from "./ChunkHierarchy";
import { computeChunkStatistics } from "./ChunkStatistics";
import { validateChunks } from "./ChunkValidator";
import { estimateTokens } from "./ChunkTokenizer";
import { collectText } from "./ChunkStrategy";

export interface RunChunkEngineInput {
  tree: DocumentTree;
  options?: ChunkEngineOptions;
}

export const ChunkEngine = {
  version: CHUNK_ENGINE_VERSION,

  run(input: RunChunkEngineInput): ChunkCollection {
    const opts = { ...DEFAULT_CHUNK_ENGINE_OPTIONS, ...input.options };
    const baseMetadata: Partial<ChunkMetadata> = input.options?.baseMetadata ?? {};
    let counter = 0;
    const ctx: BuildChunkContext = {
      sourceId: input.tree.sourceId,
      order: () => counter++,
      opts,
      baseMetadata,
    };

    const chunks: ChunkNode[] = [];
    walk(input.tree.root, ctx, opts, chunks);

    linkChunkHierarchy(input.tree.root, chunks);

    const sectionsTotal = input.tree.flat.filter((s) => s.type !== "document").length;
    const statistics = computeChunkStatistics(chunks, sectionsTotal);
    const validation = validateChunks({ sourceId: input.tree.sourceId, chunks, opts });

    return {
      sourceId: input.tree.sourceId,
      sourceLabel: input.tree.sourceLabel,
      chunks,
      statistics,
      validation,
      engineVersion: CHUNK_ENGINE_VERSION,
      createdAt: new Date().toISOString(),
    };
  },
};

function walk(
  node: SectionNode,
  ctx: BuildChunkContext,
  opts: Required<Omit<ChunkEngineOptions, "baseMetadata">>,
  out: ChunkNode[],
): void {
  if (node.type === "document") {
    // Try merge-run of small paragraph siblings at top level and each level.
    processChildren(node, ctx, opts, out);
    return;
  }

  const decision = decideStrategy(node, ctx.opts);

  // Emit chunks for this node unless we are strictly a container that has
  // descendants worth chunking as absaetze/definitions already captured inside.
  if (decision.chunkType === "meta") {
    // Meta chunk only if this node has actual title/preamble text.
    if (opts.includeMetaChunks && node.originalText.trim()) {
      out.push(...buildChunksForNode(node, ctx));
    }
    processChildren(node, ctx, opts, out);
    return;
  }

  // For paragraph-family, absatz/definition are folded into the parent chunk.
  // Do not walk into them again.
  const foldChildren = ["paragraph", "paragraph_with_absaetze", "paragraph_with_definitions", "article", "annex", "definition", "table", "split_paragraph_absatz", "split_paragraph_sentence"].includes(decision.chunkType);

  out.push(...buildChunksForNode(node, ctx));

  if (!foldChildren) {
    processChildren(node, ctx, opts, out);
  }
}

/** Process a container's children, applying merging when siblings are tiny. */
function processChildren(
  parent: SectionNode,
  ctx: BuildChunkContext,
  opts: Required<Omit<ChunkEngineOptions, "baseMetadata">>,
  out: ChunkNode[],
): void {
  if (!opts.enableMerging) {
    for (const child of parent.children) walk(child, ctx, opts, out);
    return;
  }

  const pending: SectionNode[] = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    if (pending.length === 1) {
      // Single small sibling: emit normally.
      walk(pending[0], ctx, opts, out);
    } else {
      out.push(mergeSmallSiblings(pending, ctx));
    }
    pending.length = 0;
  };

  for (const child of parent.children) {
    if (isMergeCandidate(child, opts)) {
      pending.push(child);
      continue;
    }
    flushPending();
    walk(child, ctx, opts, out);
  }
  flushPending();
}

function isMergeCandidate(
  node: SectionNode,
  opts: Required<Omit<ChunkEngineOptions, "baseMetadata">>,
): boolean {
  if (node.type !== "paragraph") return false;
  if (node.children.length > 0) return false; // paragraphs with structure keep their identity
  const tokens = estimateTokens(collectText(node));
  return tokens < opts.mergeThresholdTokens;
}
