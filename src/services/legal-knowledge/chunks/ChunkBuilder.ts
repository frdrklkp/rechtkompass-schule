/**
 * ChunkBuilder — produces ChunkNode instances from a SectionNode subtree
 * given a strategy decision. Smart splitting and merging are delegated here.
 */
import type { SectionNode, SectionReference } from "../document/types";
import type {
  ChunkEngineOptions,
  ChunkMetadata,
  ChunkNode,
  ChunkType,
} from "./types";
import { CHUNK_STRATEGY_LABELS } from "./types";
import { buildStableHash, buildChunkId } from "./ChunkHashBuilder";
import { buildChunkMetadata } from "./ChunkMetadataBuilder";
import { buildTokenInfo, estimateTokens, splitSentences } from "./ChunkTokenizer";
import { collectText, decideStrategy } from "./ChunkStrategy";

export interface BuildChunkContext {
  sourceId: string | null;
  order: () => number;
  opts: Required<Omit<ChunkEngineOptions, "baseMetadata">>;
  baseMetadata?: Partial<ChunkMetadata>;
}

/** Produces one or more chunks for a single section, according to the resolved strategy. */
export function buildChunksForNode(node: SectionNode, ctx: BuildChunkContext): ChunkNode[] {
  const decision = decideStrategy(node, ctx.opts);

  if (decision.requiresSplit && decision.chunkType === "split_paragraph_absatz") {
    return buildSplitByAbsatz(node, ctx);
  }

  const text = collectText(node);
  if (decision.chunkType === "meta") {
    return [makeChunk({
      node,
      sections: [node],
      chunkType: "meta",
      title: node.displayTitle,
      content: node.originalText || node.displayTitle,
      references: node.references,
      ctx,
    })];
  }

  // For paragraph-family chunks: also gather references from absatz children.
  const collectedRefs = flattenReferences(node);
  return [makeChunk({
    node,
    sections: [node, ...node.children.filter((c) => ["absatz", "definition"].includes(c.type))],
    chunkType: decision.chunkType,
    title: node.displayTitle,
    content: text,
    references: collectedRefs,
    ctx,
  })];
}

/** Split an oversized paragraph into one chunk per absatz child (legal boundary). */
function buildSplitByAbsatz(node: SectionNode, ctx: BuildChunkContext): ChunkNode[] {
  const absaetze = node.children.filter((c) => c.type === "absatz");
  const chunks: ChunkNode[] = [];
  for (const abs of absaetze) {
    const absText = collectText(abs);
    // If a single absatz is still huge, fall back to sentence-boundary split.
    if (ctx.opts.enableSplitting && estimateTokens(absText) > ctx.opts.splitThresholdTokens) {
      chunks.push(...splitAbsatzBySentence(node, abs, ctx));
      continue;
    }
    chunks.push(makeChunk({
      node,
      sections: [abs],
      chunkType: "split_paragraph_absatz",
      title: `${node.displayTitle} · ${abs.label ?? "Absatz"}`,
      content: absText,
      references: abs.references,
      ctx,
      pathOverride: abs.path,
      breadcrumbOverride: abs.breadcrumb,
    }));
  }
  return chunks;
}

/** Split an absatz body along sentence boundaries. Never mid-sentence. */
function splitAbsatzBySentence(
  parent: SectionNode,
  abs: SectionNode,
  ctx: BuildChunkContext,
): ChunkNode[] {
  const sentences = splitSentences(collectText(abs));
  if (sentences.length <= 1) {
    return [makeChunk({
      node: parent,
      sections: [abs],
      chunkType: "split_paragraph_sentence",
      title: `${parent.displayTitle} · ${abs.label ?? "Absatz"}`,
      content: collectText(abs),
      references: abs.references,
      ctx,
      pathOverride: abs.path,
      breadcrumbOverride: abs.breadcrumb,
    })];
  }
  // Greedy packer over sentences with a soft token budget.
  const budget = ctx.opts.splitThresholdTokens;
  const groups: string[][] = [[]];
  let acc = 0;
  for (const s of sentences) {
    const t = estimateTokens(s);
    if (acc + t > budget && groups[groups.length - 1].length > 0) {
      groups.push([]);
      acc = 0;
    }
    groups[groups.length - 1].push(s);
    acc += t;
  }
  return groups.map((group, i) => makeChunk({
    node: parent,
    sections: [abs],
    chunkType: "split_paragraph_sentence",
    title: `${parent.displayTitle} · ${abs.label ?? "Absatz"} · Teil ${i + 1}`,
    content: group.join(" "),
    references: abs.references,
    ctx,
    pathOverride: `${abs.path}#part-${i + 1}`,
    breadcrumbOverride: [...abs.breadcrumb, `Teil ${i + 1}`],
  }));
}

/** Merge small sibling paragraphs into a single chunk. */
export function mergeSmallSiblings(
  siblings: SectionNode[],
  ctx: BuildChunkContext,
): ChunkNode {
  const primary = siblings[0];
  const content = siblings.map((s) => collectText(s)).filter(Boolean).join("\n\n");
  const references = siblings.flatMap((s) => flattenReferences(s));
  return makeChunk({
    node: primary,
    sections: siblings,
    chunkType: "merged_paragraphs",
    title: siblings.length === 1
      ? primary.displayTitle
      : `${primary.displayTitle} … ${siblings[siblings.length - 1].displayTitle}`,
    content,
    references,
    ctx,
    pathOverride: `${primary.path}+merged-${siblings.length}`,
  });
}

// --- Helpers ----------------------------------------------------------------

interface MakeChunkInput {
  node: SectionNode;
  sections: SectionNode[];
  chunkType: ChunkType;
  title: string;
  content: string;
  references: SectionReference[];
  ctx: BuildChunkContext;
  pathOverride?: string;
  breadcrumbOverride?: string[];
}

function makeChunk(input: MakeChunkInput): ChunkNode {
  const { node, sections, chunkType, title, content, references, ctx } = input;
  const now = new Date().toISOString();
  const path = input.pathOverride ?? node.path;
  const breadcrumb = input.breadcrumbOverride ?? node.breadcrumb;
  const normalizedContent = normalize(content);
  const metadata = buildChunkMetadata({
    sections,
    chunkType,
    baseMetadata: ctx.baseMetadata,
  });
  const stableHash = buildStableHash({
    sourceId: ctx.sourceId,
    path,
    normalizedContent,
    version: metadata.version,
  });
  const order = ctx.order();
  const chunkId = buildChunkId(ctx.sourceId, path, order);

  return {
    localId: stableHash,
    chunkId,
    documentId: null,
    sourceId: ctx.sourceId,
    sectionIds: sections.map((s) => s.localId),
    primarySection: sections[0].localId,
    path,
    displayPath: breadcrumb.join(" › "),
    breadcrumb,
    chunkType,
    strategyLabel: CHUNK_STRATEGY_LABELS[chunkType],
    title,
    displayTitle: title,
    content,
    normalizedContent,
    summary: null,
    metadata,
    stableHash,
    token: buildTokenInfo(content, references),
    order,
    parentChunk: null,
    children: [],
    references,
    confidence: node.confidence,
    createdAt: now,
    updatedAt: now,
  };
}

function normalize(text: string): string {
  return text.replace(/\s+/gu, " ").trim().toLowerCase();
}

function flattenReferences(node: SectionNode): SectionReference[] {
  const out: SectionReference[] = [...node.references];
  const walk = (n: SectionNode) => {
    for (const c of n.children) {
      out.push(...c.references);
      walk(c);
    }
  };
  walk(node);
  return out;
}
