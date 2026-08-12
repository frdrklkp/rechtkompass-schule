// Repository für legal_ingestion_jobs.

import { supabase } from "@/integrations/supabase/client";
import type {
  LegalIngestionJobRow,
  LegalIngestionRequest,
} from "../ingestion/LegalIngestionTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyClient = (): any => supabase as unknown as any;

function toJob(row: Record<string, unknown>): LegalIngestionJobRow {
  return {
    id: String(row.id),
    sourceId: (row.source_id as string | null) ?? null,
    inputType: row.input_type as LegalIngestionJobRow["inputType"],
    inputLocation: (row.input_location as string | null) ?? null,
    status: row.status as LegalIngestionJobRow["status"],
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    warnings: (row.warnings as LegalIngestionJobRow["warnings"]) ?? [],
    extractedMetadata: (row.extracted_metadata as LegalIngestionJobRow["extractedMetadata"]) ?? {},
    contentStats: (row.content_stats as LegalIngestionJobRow["contentStats"]) ?? {},
    checksum: (row.checksum as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export const LegalIngestionRepository = {
  async create(req: LegalIngestionRequest, snapshot: Record<string, unknown>): Promise<LegalIngestionJobRow | null> {
    try {
      const { data, error } = await anyClient()
        .from("legal_ingestion_jobs")
        .insert({
          source_id: req.intendedSourceId ?? null,
          input_type: req.inputType,
          input_location: req.inputLocation ?? null,
          status: snapshot.status ?? "pending",
          raw_input: req.rawInput ?? null,
          normalized_output: snapshot.normalized_output ?? null,
          extracted_metadata: snapshot.extracted_metadata ?? {},
          content_stats: snapshot.content_stats ?? {},
          warnings: snapshot.warnings ?? [],
          checksum: snapshot.checksum ?? null,
          error_code: snapshot.error_code ?? null,
          error_message: snapshot.error_message ?? null,
          started_at: new Date().toISOString(),
          completed_at: snapshot.status === "completed" ? new Date().toISOString() : null,
        })
        .select("*").single();
      if (error) throw error;
      return toJob(data as Record<string, unknown>);
    } catch {
      return null;
    }
  },

  async list(limit = 50): Promise<LegalIngestionJobRow[]> {
    try {
      const { data, error } = await anyClient()
        .from("legal_ingestion_jobs")
        .select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(toJob);
    } catch {
      return [];
    }
  },

  async listForSource(sourceId: string, limit = 20): Promise<LegalIngestionJobRow[]> {
    try {
      const { data, error } = await anyClient()
        .from("legal_ingestion_jobs")
        .select("*").eq("source_id", sourceId)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(toJob);
    } catch {
      return [];
    }
  },
};
