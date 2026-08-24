/**
 * Sprint 4.6M – Persistenz abgeschlossener Fallakten.
 * Reiner Browser-Client (keine Service-Rolle nötig): RLS beschränkt Zugriff
 * auf die eigenen Zeilen der angemeldeten Lehrkraft (owner_id = auth.uid()).
 * Nutzt dieselbe Magic-Link-Anmeldung wie die automatische Fallgenerierung
 * (Sprint 4.6K, src/lib/adminAuth.ts: signInWithMagicLink/useAuthSession).
 */
import { supabase } from "@/integrations/supabase/client";
import type { CaseFileRecord, CreateCaseFileInput } from "./types";

function mapRow(row: Record<string, unknown>): CaseFileRecord {
  return {
    id: row.id as string,
    fileNo: row.file_no as number,
    caseNumber: (row.case_number as string) ?? "",
    title: row.title as string,
    category: (row.category as string | null) ?? null,
    closedAt: row.closed_at as string,
    createdAt: row.created_at as string,
    situationSnapshot: (row.situation_snapshot as Record<string, unknown> | null) ?? null,
    assessmentSnapshot: (row.assessment_snapshot as Record<string, unknown> | null) ?? null,
    actionsSnapshot: (row.actions_snapshot as Record<string, unknown> | null) ?? null,
    legalSnapshot: (row.legal_snapshot as Record<string, unknown> | null) ?? null,
    documentsSnapshot: (row.documents_snapshot as Record<string, unknown> | null) ?? null,
    openPoints: (row.open_points as string[] | null) ?? [],
    practiceCaseId: (row.practice_case_id as string | null) ?? null,
  };
}

export async function createCaseFile(input: CreateCaseFileInput): Promise<CaseFileRecord> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("Nicht angemeldet. Bitte zuerst anmelden.");

  const { data, error } = await (supabase as any)
    .from("case_files")
    .insert({
      owner_id: ownerId,
      title: input.title,
      category: input.category,
      situation_snapshot: input.situationSnapshot,
      assessment_snapshot: input.assessmentSnapshot,
      actions_snapshot: input.actionsSnapshot,
      legal_snapshot: input.legalSnapshot,
      documents_snapshot: input.documentsSnapshot,
      open_points: input.openPoints,
      practice_case_id: input.practiceCaseId,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Fallakte konnte nicht gespeichert werden.");
  }
  return mapRow(data as Record<string, unknown>);
}

export async function listCaseFiles(): Promise<CaseFileRecord[]> {
  const { data, error } = await (supabase as any)
    .from("case_files")
    .select("*")
    .order("closed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

export async function getCaseFile(id: string): Promise<CaseFileRecord | null> {
  const { data, error } = await (supabase as any).from("case_files").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Record<string, unknown>) : null;
}
