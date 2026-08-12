/** Row ↔ SectionNode mapping. `legal_sections` is DB source of truth. */
import type { SectionNode, SectionType } from "./types";
import { SECTION_TYPES } from "./types";

export interface LegalSectionRow {
  id: string;
  source_id: string | null;
  parent_id: string | null;
  section_type: string | null;
  depth: number | null;
  order_index: number | null;
  section_number: string | null;
  label: string | null;
  title: string | null;
  full_text: string | null;
  original_text: string | null;
  normalized_text: string | null;
  path: string | null;
  display_path: string | null;
  start_offset: number | null;
  end_offset: number | null;
  stable_hash: string | null;
  parser_method: string | null;
  parser_confidence: number | null;
  metadata: Record<string, unknown> | null;
  summary: string | null;
}

export interface LegalSectionReferenceRow {
  id: string;
  section_id: string;
  raw_text: string;
  ref_type: string;
  ref_value: Record<string, string>;
  resolved_section_id: string | null;
  start_offset: number | null;
  end_offset: number | null;
  confidence: number | null;
}

export function toSectionType(v: string | null | undefined): SectionType {
  if (v && (SECTION_TYPES as readonly string[]).includes(v)) return v as SectionType;
  return "unknown";
}

export interface UpsertSectionPayload {
  source_id: string;
  parent_local_id: string | null;
  local_id: string;
  section_type: SectionType;
  depth: number;
  order_index: number;
  section_number: string | null;
  label: string | null;
  title: string | null;
  full_text: string;
  original_text: string;
  normalized_text: string;
  path: string;
  display_path: string;
  start_offset: number;
  end_offset: number;
  stable_hash: string;
  parser_method: string;
  parser_confidence: number;
  metadata: Record<string, unknown>;
}

export function nodeToUpsertPayload(node: SectionNode, sourceId: string): UpsertSectionPayload {
  return {
    source_id: sourceId,
    parent_local_id: node.parentLocalId,
    local_id: node.localId,
    section_type: node.type,
    depth: node.depth,
    order_index: node.order,
    section_number: node.number,
    label: node.label,
    title: node.title,
    full_text: node.originalText,
    original_text: node.originalText,
    normalized_text: node.normalizedText,
    path: node.path,
    display_path: node.displayPath,
    start_offset: node.startOffset,
    end_offset: node.endOffset,
    stable_hash: node.stableHash,
    parser_method: node.parserMethod,
    parser_confidence: node.confidence,
    metadata: node.metadata,
  };
}
