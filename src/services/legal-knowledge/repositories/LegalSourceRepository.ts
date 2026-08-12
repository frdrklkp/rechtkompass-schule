// Repository für legal_sources: reine Supabase-Zugriffe.
// Toleriert (noch) fehlende neue Spalten via `select("*")`.

import { supabase } from "@/integrations/supabase/client";
import { toDomain, toReviewEvent } from "../registry/LegalSourceRegistryMapper";
import type {
  LegalSourceDomain,
  LegalSourceListFilter,
  LegalSourceReviewEvent,
  LegalSourceLifecycle,
} from "../registry/LegalSourceRegistryTypes";
import {
  LegalSourceNotFoundError,
} from "../runtime/ingestionErrors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyClient = (): any => supabase as unknown as any;

export const LegalSourceRepository = {
  async list(filter?: LegalSourceListFilter): Promise<LegalSourceDomain[]> {
    // Legacy-Spalte heißt `name`; neuer Domain-Feldname ist `title` (siehe Mapper).
    let q = anyClient().from("legal_sources").select("*").order("name", { ascending: true });
    if (filter?.lifecycle && filter.lifecycle !== "all")
      q = q.eq("lifecycle_status", filter.lifecycle);
    if (filter?.verification && filter.verification !== "all")
      q = q.eq("verification_status", filter.verification);
    if (filter?.type && filter.type !== "all")
      q = q.eq("source_type_v2", filter.type);
    if (filter?.jurisdiction && filter.jurisdiction !== "all")
      q = q.eq("jurisdiction", filter.jurisdiction);
    if (filter?.onlyOfficial) q = q.eq("official_source", true);
    const { data, error } = await q;
    if (error) throw error;
    let rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(toDomain);
    if (filter?.search) {
      const s = filter.search.toLowerCase();
      rows = rows.filter((r) =>
        r.title.toLowerCase().includes(s) ||
        (r.shortName ?? "").toLowerCase().includes(s) ||
        (r.description ?? "").toLowerCase().includes(s) ||
        (r.authority ?? "").toLowerCase().includes(s));
    }
    return rows;
  },

  async get(id: string): Promise<LegalSourceDomain> {
    const { data, error } = await anyClient()
      .from("legal_sources").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new LegalSourceNotFoundError(id);
    return toDomain(data as Record<string, unknown>);
  },

  async versionsOf(id: string): Promise<LegalSourceDomain[]> {
    const { data, error } = await anyClient()
      .from("legal_sources")
      .select("*")
      .or(`supersedes_source_id.eq.${id},replaced_by_source_id.eq.${id},id.eq.${id}`);
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toDomain);
  },

  async insert(patch: Record<string, unknown>): Promise<LegalSourceDomain> {
    const { data, error } = await anyClient()
      .from("legal_sources").insert(patch).select("*").single();
    if (error) throw error;
    return toDomain(data as Record<string, unknown>);
  },

  async update(id: string, patch: Record<string, unknown>): Promise<LegalSourceDomain> {
    const { data, error } = await anyClient()
      .from("legal_sources").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return toDomain(data as Record<string, unknown>);
  },

  async logReviewEvent(
    sourceId: string,
    from: LegalSourceLifecycle | null,
    to: LegalSourceLifecycle,
    note: string | null,
  ): Promise<void> {
    // Silent fail wenn Tabelle noch nicht existiert – Migration ist Voraussetzung.
    try {
      await anyClient().from("legal_source_review_events").insert({
        source_id: sourceId, from_status: from, to_status: to, note,
      });
    } catch {
      // ignore
    }
  },

  async reviewEvents(sourceId: string): Promise<LegalSourceReviewEvent[]> {
    try {
      const { data, error } = await anyClient()
        .from("legal_source_review_events")
        .select("*").eq("source_id", sourceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(toReviewEvent);
    } catch {
      return [];
    }
  },
};
