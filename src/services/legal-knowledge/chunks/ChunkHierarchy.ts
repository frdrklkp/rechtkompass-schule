/**
 * ChunkHierarchy — links produced chunks by walking the section tree and
 * assigning parent/children/sibling relationships based on section paths.
 */
import type { SectionNode } from "../document/types";
import type { ChunkNode } from "./types";

export interface HierarchyIndex {
  bySection: Map<string, ChunkNode[]>;
  byLocalId: Map<string, ChunkNode>;
}

export function indexChunks(chunks: ChunkNode[]): HierarchyIndex {
  const bySection = new Map<string, ChunkNode[]>();
  const byLocalId = new Map<string, ChunkNode>();
  for (const chunk of chunks) {
    byLocalId.set(chunk.localId, chunk);
    for (const sectionId of chunk.sectionIds) {
      const bucket = bySection.get(sectionId);
      if (bucket) bucket.push(chunk);
      else bySection.set(sectionId, [chunk]);
    }
  }
  return { bySection, byLocalId };
}

/** Wires parent/child references between chunks derived from a section tree. */
export function linkChunkHierarchy(root: SectionNode, chunks: ChunkNode[]): void {
  const index = indexChunks(chunks);

  const walk = (node: SectionNode, ancestorChunk: ChunkNode | null) => {
    const own = index.bySection.get(node.localId) ?? [];
    // The section's "primary" chunk is the first one whose primarySection matches.
    const primary = own.find((c) => c.primarySection === node.localId) ?? own[0] ?? ancestorChunk;

    for (const c of own) {
      if (c === primary) continue;
      c.parentChunk = primary?.localId ?? null;
      if (primary && !primary.children.includes(c.localId)) primary.children.push(c.localId);
    }
    if (primary && ancestorChunk && primary.parentChunk == null && primary !== ancestorChunk) {
      primary.parentChunk = ancestorChunk.localId;
      if (!ancestorChunk.children.includes(primary.localId)) {
        ancestorChunk.children.push(primary.localId);
      }
    }

    for (const child of node.children) walk(child, primary ?? ancestorChunk);
  };
  walk(root, null);
}

export function findRoots(chunks: ChunkNode[]): ChunkNode[] {
  return chunks.filter((c) => c.parentChunk == null);
}

export function siblingsOf(chunk: ChunkNode, all: ChunkNode[]): ChunkNode[] {
  return all.filter(
    (c) => c.localId !== chunk.localId && c.parentChunk === chunk.parentChunk,
  );
}
