/**
 * Persistence layer for the document tree. Writes into legal_sections and
 * legal_section_references using the browser Supabase client (respects RLS;
 * editor+ can write).
 */
import { supabase } from "@/integrations/supabase/client";
import type { DocumentTree, SectionNode } from "./types";
import { nodeToUpsertPayload } from "./DocumentStructureMapper";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyClient = (): any => supabase as unknown as any;

export interface PersistResult {
  sectionsWritten: number;
  referencesWritten: number;
  localIdToDbId: Record<string, string>;
}

export const SectionRepository = {
  /** Replace all sections+references for a source with the given tree. */
  async replaceForSource(sourceId: string, tree: DocumentTree): Promise<PersistResult> {
    if (!sourceId) throw new Error("sourceId required");

    // 1) Delete existing sections for source (cascade removes references)
    const del = await anyClient()
      .from("legal_sections")
      .delete()
      .eq("source_id", sourceId);
    if (del.error) throw del.error;

    // 2) Insert sections in BFS order so parents exist before children.
    const bfs: SectionNode[] = [];
    const q: SectionNode[] = [tree.root];
    while (q.length) {
      const n = q.shift()!;
      bfs.push(n);
      for (const c of n.children) q.push(c);
    }

    const localIdToDbId: Record<string, string> = {};
    // Insert one-by-one to resolve parent_id via inserted row ids.
    for (const node of bfs) {
      if (node.type === "document") continue; // skip synthetic root
      const payload = nodeToUpsertPayload(node, sourceId);
      const dbParentId = payload.parent_local_id
        ? localIdToDbId[payload.parent_local_id] ?? null
        : null;

      const insert = await anyClient()
        .from("legal_sections")
        .insert({
          source_id: sourceId,
          parent_id: dbParentId,
          section_type: payload.section_type,
          depth: payload.depth,
          order_index: payload.order_index,
          section_number: payload.section_number,
          label: payload.label,
          title: payload.title,
          full_text: payload.full_text,
          original_text: payload.original_text,
          normalized_text: payload.normalized_text,
          path: payload.path,
          display_path: payload.display_path,
          start_offset: payload.start_offset,
          end_offset: payload.end_offset,
          stable_hash: payload.stable_hash,
          parser_method: payload.parser_method,
          parser_confidence: payload.parser_confidence,
          metadata: payload.metadata,
        })
        .select("id")
        .single();
      if (insert.error) throw insert.error;
      localIdToDbId[node.localId] = insert.data.id;
    }

    // 3) Insert references
    let refCount = 0;
    for (const node of tree.flat) {
      if (!node.references.length) continue;
      const dbId = localIdToDbId[node.localId];
      if (!dbId) continue;
      const rows = node.references.map((r) => ({
        section_id: dbId,
        raw_text: r.raw,
        ref_type: r.refType,
        ref_value: r.refValue,
        start_offset: r.startOffset ?? null,
        end_offset: r.endOffset ?? null,
        confidence: r.confidence,
      }));
      const ins = await anyClient().from("legal_section_references").insert(rows);
      if (ins.error) throw ins.error;
      refCount += rows.length;
    }

    return {
      sectionsWritten: bfs.length - 1,
      referencesWritten: refCount,
      localIdToDbId,
    };
  },

  async listForSource(sourceId: string) {
    const { data, error } = await anyClient()
      .from("legal_sections")
      .select("*")
      .eq("source_id", sourceId)
      .order("depth", { ascending: true })
      .order("order_index", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as import("./DocumentStructureMapper").LegalSectionRow[];
  },

  async listReferencesForSource(sourceId: string) {
    const sections = await this.listForSource(sourceId);
    const ids = sections.map((s) => s.id);
    if (!ids.length) return [];
    const { data, error } = await anyClient()
      .from("legal_section_references")
      .select("*")
      .in("section_id", ids);
    if (error) throw error;
    return (data ?? []) as unknown as import("./DocumentStructureMapper").LegalSectionReferenceRow[];
  },
};
