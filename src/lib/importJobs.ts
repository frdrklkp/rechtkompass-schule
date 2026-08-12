/**
 * Import-Job-Manager (client-side)
 * ---------------------------------
 * Kapselt alle Datenbank-Operationen rund um `import_jobs` und
 * `import_job_items`. Läuft komplett über den bestehenden
 * Supabase-Browserclient – Admin-Rechte werden über RLS
 * (`has_role(auth.uid(), 'admin')`) durchgesetzt.
 *
 * Sicherheitsregel für Rollback / Reset:
 *   Es werden NUR `legal_sections` gelöscht, die
 *   - `import_job_id IS NOT NULL`               (klar aus Import stammen)
 *   - `status != 'published'`                   (nicht veröffentlicht)
 *   - `last_reviewed_at IS NULL`                (nie redaktionell geprüft)
 *   - keine verknüpften Praxisfälle haben       (kein case_legal_link)
 * Alles andere bleibt unverändert (skipped mit Grund).
 */

import { supabase } from "@/integrations/supabase/client";
import { assertAdminWrite } from "@/lib/adminAuth";

const db = supabase as unknown as {
  from: (t: string) => any;
};

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type ImportJobStatus = "running" | "succeeded" | "failed" | "cancelled";

export type ImportJob = {
  id: string;
  source_id: string | null;
  source_url: string | null;
  status: ImportJobStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  detected_count: number;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  enriched_count: number;
  error_count: number;
  notes: string | null;
  created_at: string;
};

export type ImportJobItemAction =
  | "inserted"
  | "updated"
  | "skipped"
  | "failed"
  | "enriched";

export type ImportJobItem = {
  id: string;
  job_id: string;
  section_number: string | null;
  title: string | null;
  section_id: string | null;
  action: ImportJobItemAction;
  error: string | null;
  source_hash: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function startImportJob(input: {
  source_id: string;
  source_url: string;
  detected_count: number;
  notes?: string;
}): Promise<ImportJob> {
  assertAdminWrite();
  const { data, error } = await db
    .from("import_jobs")
    .insert({
      source_id: input.source_id,
      source_url: input.source_url,
      status: "running" as ImportJobStatus,
      detected_count: input.detected_count,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ImportJob;
}

export async function updateJobCounters(
  jobId: string,
  patch: Partial<
    Pick<
      ImportJob,
      | "imported_count"
      | "updated_count"
      | "skipped_count"
      | "enriched_count"
      | "error_count"
      | "notes"
    >
  >,
): Promise<void> {
  assertAdminWrite();
  const { error } = await db.from("import_jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function finishImportJob(
  jobId: string,
  status: Exclude<ImportJobStatus, "running">,
  extra?: { notes?: string },
): Promise<void> {
  assertAdminWrite();
  const { data: prev, error: readErr } = await db
    .from("import_jobs")
    .select("started_at")
    .eq("id", jobId)
    .single();
  if (readErr) throw new Error(readErr.message);
  const startedAt = new Date((prev as { started_at: string }).started_at).getTime();
  const now = Date.now();
  const { error } = await db
    .from("import_jobs")
    .update({
      status,
      finished_at: new Date(now).toISOString(),
      duration_ms: Math.max(0, now - startedAt),
      notes: extra?.notes ?? undefined,
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function recordJobItem(item: {
  job_id: string;
  section_number?: string | null;
  title?: string | null;
  section_id?: string | null;
  action: ImportJobItemAction;
  error?: string | null;
  source_hash?: string | null;
}): Promise<void> {
  assertAdminWrite();
  const { error } = await db.from("import_job_items").insert(item);
  if (error) throw new Error(error.message);
}

export async function listImportJobs(filters?: {
  sourceId?: string;
}): Promise<Array<ImportJob & { legal_sources?: { name: string } | null }>> {
  let q = db
    .from("import_jobs")
    .select("*, legal_sources(name)")
    .order("started_at", { ascending: false });
  if (filters?.sourceId) q = q.eq("source_id", filters.sourceId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

export async function getImportJob(
  jobId: string,
): Promise<{
  job: ImportJob & { legal_sources?: { name: string } | null };
  items: ImportJobItem[];
}> {
  const [jobRes, itemsRes] = await Promise.all([
    db
      .from("import_jobs")
      .select("*, legal_sources(name)")
      .eq("id", jobId)
      .single(),
    db
      .from("import_job_items")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),
  ]);
  if (jobRes.error) throw new Error(jobRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  return { job: jobRes.data as any, items: (itemsRes.data ?? []) as ImportJobItem[] };
}

// ---------------------------------------------------------------------------
// Rollback / Reset – sicherheitsgeprüfte Löschung
// ---------------------------------------------------------------------------

export type RollbackReport = {
  deleted: number;
  skipped: Array<{ section_number: string; id: string; reason: string }>;
};

/**
 * Löscht die durch `jobId` importierten Rechtsabschnitte, wenn sie
 * die Sicherheitsregeln erfüllen. Praxisfälle, Vorlagen, Schlagwörter
 * werden nicht angefasst.
 */
export async function rollbackImportJob(jobId: string): Promise<RollbackReport> {
  assertAdminWrite();

  // Kandidaten laden
  const { data: candidates, error } = await db
    .from("legal_sections")
    .select("id, section_number, status, last_reviewed_at")
    .eq("import_job_id", jobId);
  if (error) throw new Error(error.message);

  const skipped: RollbackReport["skipped"] = [];
  const deletableIds: string[] = [];

  for (const c of (candidates ?? []) as Array<{
    id: string;
    section_number: string;
    status: string | null;
    last_reviewed_at: string | null;
  }>) {
    if (c.status === "published") {
      skipped.push({ id: c.id, section_number: c.section_number, reason: "veröffentlicht" });
      continue;
    }
    if (c.last_reviewed_at) {
      skipped.push({ id: c.id, section_number: c.section_number, reason: "redaktionell geprüft" });
      continue;
    }
    // Auf verknüpfte Praxisfälle prüfen
    const { count } = await db
      .from("case_legal_links")
      .select("id", { count: "exact", head: true })
      .eq("legal_section_id", c.id);
    if ((count ?? 0) > 0) {
      skipped.push({
        id: c.id,
        section_number: c.section_number,
        reason: `${count} Praxisfall-Verknüpfung(en)`,
      });
      continue;
    }
    deletableIds.push(c.id);
  }

  let deleted = 0;
  if (deletableIds.length) {
    const { error: delErr, count } = await db
      .from("legal_sections")
      .delete({ count: "exact" })
      .in("id", deletableIds);
    if (delErr) throw new Error(delErr.message);
    deleted = count ?? deletableIds.length;
  }

  // Job als cancelled markieren, damit erneuter Import unblockiert ist
  await db
    .from("import_jobs")
    .update({
      status: "cancelled" as ImportJobStatus,
      finished_at: new Date().toISOString(),
      notes: `Rollback: ${deleted} gelöscht, ${skipped.length} übersprungen.`,
    })
    .eq("id", jobId);

  return { deleted, skipped };
}

/**
 * Setzt alle Importe einer Rechtsquelle zurück (Aggregat aller Jobs).
 * Rechtsquelle selbst und manuell gepflegte Abschnitte bleiben erhalten.
 */
export async function resetSourceImports(sourceId: string): Promise<RollbackReport> {
  assertAdminWrite();
  const { data: jobs, error } = await db
    .from("import_jobs")
    .select("id")
    .eq("source_id", sourceId);
  if (error) throw new Error(error.message);

  const total: RollbackReport = { deleted: 0, skipped: [] };
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    const r = await rollbackImportJob(j.id);
    total.deleted += r.deleted;
    total.skipped.push(...r.skipped);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Dashboard-Aggregat
// ---------------------------------------------------------------------------

export async function importDashboardStats() {
  const [jobs, sources] = await Promise.all([
    db.from("import_jobs").select("id,status,source_id,enriched_count,error_count"),
    db.from("legal_sources").select("id"),
  ]);
  if (jobs.error) throw new Error(jobs.error.message);
  if (sources.error) throw new Error(sources.error.message);

  const jobRows = (jobs.data ?? []) as Array<Pick<ImportJob, "status" | "enriched_count" | "error_count"> & { source_id: string | null }>;
  const successful = jobRows.filter((j) => j.status === "succeeded").length;
  const failed = jobRows.filter((j) => j.status === "failed").length;
  const running = jobRows.filter((j) => j.status === "running").length;
  const totalEnriched = jobRows.reduce((a, r) => a + (r.enriched_count ?? 0), 0);
  const totalErrors = jobRows.reduce((a, r) => a + (r.error_count ?? 0), 0);
  const importedSourceIds = new Set(jobRows.filter((j) => j.status === "succeeded").map((j) => j.source_id).filter(Boolean));
  const successRate = jobRows.length ? Math.round((successful / jobRows.length) * 100) : 0;

  return {
    totalJobs: jobRows.length,
    successful,
    failed,
    running,
    sourcesImported: importedSourceIds.size,
    sourcesTotal: (sources.data ?? []).length,
    enrichedCards: totalEnriched,
    errors: totalErrors,
    successRate,
  };
}
