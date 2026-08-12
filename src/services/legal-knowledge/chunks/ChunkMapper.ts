/**
 * ChunkMapper — normalizes chunks to/from plain records for storage/transport.
 * Symmetric: fromRecord(toRecord(chunk)) === chunk.
 */
import type { ChunkNode } from "./types";

export interface ChunkRecord {
  local_id: string;
  chunk_id: string;
  document_id: string | null;
  source_id: string | null;
  section_ids: string[];
  primary_section: string;
  path: string;
  display_path: string;
  breadcrumb: string[];
  chunk_type: string;
  strategy_label: string;
  title: string;
  display_title: string;
  content: string;
  normalized_content: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  stable_hash: string;
  token: ChunkNode["token"];
  order: number;
  parent_chunk: string | null;
  children: string[];
  references: ChunkNode["references"];
  confidence: number;
  created_at: string;
  updated_at: string;
}

export function toRecord(chunk: ChunkNode): ChunkRecord {
  return {
    local_id: chunk.localId,
    chunk_id: chunk.chunkId,
    document_id: chunk.documentId,
    source_id: chunk.sourceId,
    section_ids: chunk.sectionIds,
    primary_section: chunk.primarySection,
    path: chunk.path,
    display_path: chunk.displayPath,
    breadcrumb: chunk.breadcrumb,
    chunk_type: chunk.chunkType,
    strategy_label: chunk.strategyLabel,
    title: chunk.title,
    display_title: chunk.displayTitle,
    content: chunk.content,
    normalized_content: chunk.normalizedContent,
    summary: chunk.summary,
    metadata: { ...chunk.metadata },
    stable_hash: chunk.stableHash,
    token: chunk.token,
    order: chunk.order,
    parent_chunk: chunk.parentChunk,
    children: chunk.children,
    references: chunk.references,
    confidence: chunk.confidence,
    created_at: chunk.createdAt,
    updated_at: chunk.updatedAt,
  };
}

export function fromRecord(record: ChunkRecord): ChunkNode {
  return {
    localId: record.local_id,
    chunkId: record.chunk_id,
    documentId: record.document_id,
    sourceId: record.source_id,
    sectionIds: record.section_ids,
    primarySection: record.primary_section,
    path: record.path,
    displayPath: record.display_path,
    breadcrumb: record.breadcrumb,
    chunkType: record.chunk_type as ChunkNode["chunkType"],
    strategyLabel: record.strategy_label,
    title: record.title,
    displayTitle: record.display_title,
    content: record.content,
    normalizedContent: record.normalized_content,
    summary: record.summary,
    metadata: record.metadata as ChunkNode["metadata"],
    stableHash: record.stable_hash,
    token: record.token,
    order: record.order,
    parentChunk: record.parent_chunk,
    children: record.children,
    references: record.references,
    confidence: record.confidence,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
