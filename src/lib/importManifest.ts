/**
 * Import-Manifest (BASS-Komplettimport)
 * -------------------------------------
 * Client-seitige Operationen auf `legal_import_pages`.
 * Läuft über den bestehenden Supabase-Browserclient. RLS des
 * externen Supabase-Projektes ist im Pilotmodus offen (siehe
 * db/2026-07-11_legal_import_pages.sql).
 *
 * Zweck:
 *  - Nachvollziehbarkeit je gecrawlter Seite (BASS-Nummer, Titel,
 *    Abschnittsanzahl, Status, letzter Import, Fehler)
 *  - Fortsetzbarkeit (Chunk-Import / Resume)
 *  - Vollständigkeitsübersicht inkl. Wissenskarten-Abdeckung
 *
 * WICHTIG: Bereits importierte Seiten (`status = 'imported'`) mit
 * gleichem `source_hash` werden NICHT zurückgesetzt. Neue Crawler-Läufe
 * aktualisieren nur `last_seen_at`.
 */

import { supabase } from "@/integrations/supabase/client";
import { assertAdminWrite } from "@/lib/adminAuth";

const db = supabase as unknown as { from: (t: string) => any };

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type ManifestStatus =
  | "discovered"
  | "imported"
  | "partial"
  | "error"
  | "skipped";

export type ImportManifestRow = {
  id: string;
  source_id: string;
  import_job_id: string | null;
  url: string;
  normalized_url: string;
  title: string | null;
  bass_number: string | null;
  crawl_depth: number;
  status: ManifestStatus;
  section_count: number;
  imported_section_count: number;
  knowledge_card_count: number;
  source_hash: string | null;
  last_seen_at: string;
  last_imported_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type CrawlPageInput = {
  url: string;
  title: string | null;
  bass_number: string | null;
  section_count: number;
  crawl_depth?: number;
  source_hash?: string | null;
  status: "candidate" | "empty" | "error";
  error?: string | null;
};

/** Normalisiert URL (Anker weg, Trailing-Slash harmonisiert) – kompatibel mit dem Crawler. */
export function normalizeManifestUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Crawler-Ergebnis ins Manifest übernehmen
// ---------------------------------------------------------------------------

/**
 * Übernimmt Crawler-Seiten in `legal_import_pages`.
 * - Neue URLs → Insert (`status='discovered'`).
 * - Bekannte URLs mit `status='imported'` → nur `last_seen_at` und ggf. `section_count` aktualisieren.
 * - Andere bekannte URLs → Metadaten (Titel, BASS-Nummer, Abschnittszahl) auffrischen.
 * Redaktionelle Felder werden NICHT überschrieben.
 */
export async function upsertCrawlResults(
  sourceId: string,
  pages: CrawlPageInput[],
  importJobId?: string | null,
): Promise<{ inserted: number; updated: number }> {
  assertAdminWrite();
  if (!pages.length) return { inserted: 0, updated: 0 };

  const nowIso = new Date().toISOString();
  const normUrls = pages.map((p) => normalizeManifestUrl(p.url));

  const { data: existingRows, error: exErr } = await db
    .from("legal_import_pages")
    .select("id, normalized_url, status, source_hash")
    .eq("source_id", sourceId)
    .in("normalized_url", normUrls);
  if (exErr) throw new Error(exErr.message);
  const existing = new Map<string, { id: string; status: ManifestStatus; source_hash: string | null }>();
  for (const r of (existingRows ?? []) as any[]) existing.set(String(r.normalized_url), r);

  const toInsert: Record<string, unknown>[] = [];
  let updated = 0;

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const norm = normUrls[i];
    const ex = existing.get(norm);
    if (!ex) {
      toInsert.push({
        source_id: sourceId,
        import_job_id: importJobId ?? null,
        url: p.url,
        normalized_url: norm,
        title: p.title ?? null,
        bass_number: p.bass_number ?? null,
        crawl_depth: p.crawl_depth ?? 0,
        section_count: p.section_count ?? 0,
        source_hash: p.source_hash ?? null,
        status: "discovered" as ManifestStatus,
        last_seen_at: nowIso,
      });
      continue;
    }
    // Bereits importierte Seiten NICHT zurückstufen – nur last_seen_at + section_count aktualisieren.
    const patch: Record<string, unknown> = {
      last_seen_at: nowIso,
      title: p.title ?? null,
      bass_number: p.bass_number ?? null,
      section_count: p.section_count ?? 0,
    };
    // Neuer Inhalt (source_hash ändert sich) → Status auf 'discovered' zurücksetzen,
    // damit die Seite beim nächsten Chunk erneut importiert wird.
    if (
      ex.status === "imported" &&
      p.source_hash &&
      ex.source_hash &&
      p.source_hash !== ex.source_hash
    ) {
      patch.status = "discovered";
      patch.source_hash = p.source_hash;
    }
    const { error: updErr } = await db
      .from("legal_import_pages")
      .update(patch)
      .eq("id", ex.id);
    if (updErr) throw new Error(updErr.message);
    updated++;
  }

  let inserted = 0;
  if (toInsert.length) {
    const { data, error } = await db
      .from("legal_import_pages")
      .insert(toInsert)
      .select("id");
    if (error) throw new Error(error.message);
    inserted = (data ?? []).length;
  }
  return { inserted, updated };
}

// ---------------------------------------------------------------------------
// Nach dem Seiten-Import Manifest fortschreiben
// ---------------------------------------------------------------------------

export async function markManifestImported(input: {
  manifestId: string;
  importJobId: string;
  status: ManifestStatus;
  section_count?: number;
  imported_section_count?: number;
  source_hash?: string | null;
  error_message?: string | null;
}): Promise<void> {
  assertAdminWrite();
  const patch: Record<string, unknown> = {
    status: input.status,
    import_job_id: input.importJobId,
    last_imported_at: new Date().toISOString(),
    error_message: input.error_message ?? null,
  };
  if (typeof input.section_count === "number") patch.section_count = input.section_count;
  if (typeof input.imported_section_count === "number")
    patch.imported_section_count = input.imported_section_count;
  if (input.source_hash !== undefined) patch.source_hash = input.source_hash;
  const { error } = await db
    .from("legal_import_pages")
    .update(patch)
    .eq("id", input.manifestId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Abfragen für die Übersicht
// ---------------------------------------------------------------------------

export async function listManifestPages(sourceId: string): Promise<ImportManifestRow[]> {
  const { data, error } = await db
    .from("legal_import_pages")
    .select("*")
    .eq("source_id", sourceId)
    .order("bass_number", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportManifestRow[];
}

/** Manifest-Zeilen, die noch (oder wieder) importiert werden müssen. */
export async function listResumeCandidates(
  sourceId: string,
  limit = 50,
): Promise<ImportManifestRow[]> {
  const { data, error } = await db
    .from("legal_import_pages")
    .select("*")
    .eq("source_id", sourceId)
    .in("status", ["discovered", "error"])
    .order("last_seen_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportManifestRow[];
}

export type ManifestStats = {
  total: number;
  discovered: number;
  imported: number;
  partial: number;
  error: number;
  skipped: number;
  section_count_total: number;
  imported_section_count_total: number;
  last_imported_at: string | null;
  success_rate: number; // 0..100
};

export async function getManifestStats(sourceId: string): Promise<ManifestStats> {
  const { data, error } = await db
    .from("legal_import_pages")
    .select("status, section_count, imported_section_count, last_imported_at")
    .eq("source_id", sourceId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    status: ManifestStatus;
    section_count: number;
    imported_section_count: number;
    last_imported_at: string | null;
  }>;
  const out: ManifestStats = {
    total: rows.length,
    discovered: 0,
    imported: 0,
    partial: 0,
    error: 0,
    skipped: 0,
    section_count_total: 0,
    imported_section_count_total: 0,
    last_imported_at: null,
    success_rate: 0,
  };
  for (const r of rows) {
    out[r.status] = (out[r.status] ?? 0) + 1;
    out.section_count_total += r.section_count || 0;
    out.imported_section_count_total += r.imported_section_count || 0;
    if (r.last_imported_at && (!out.last_imported_at || r.last_imported_at > out.last_imported_at)) {
      out.last_imported_at = r.last_imported_at;
    }
  }
  const importedish = out.imported + out.partial;
  out.success_rate = out.total ? Math.round((importedish / out.total) * 100) : 0;
  return out;
}

/**
 * Wissenskarten-Abdeckung je Rechtsquelle: wie viele Abschnitte haben
 * mindestens ein redaktionelles Feld (summary/practice_relevance/
 * recommendation/common_mistakes) gesetzt.
 */
export async function getKnowledgeCardCoverage(
  sourceId: string,
): Promise<{ sections_total: number; with_card: number; without_card: number }> {
  const { data, error } = await db
    .from("legal_sections")
    .select("id, summary, practice_relevance, recommendation, common_mistakes")
    .eq("source_id", sourceId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    summary: string | null;
    practice_relevance: string | null;
    recommendation: string | null;
    common_mistakes: string | null;
  }>;
  let withCard = 0;
  for (const r of rows) {
    if (
      (r.summary && r.summary.trim()) ||
      (r.practice_relevance && r.practice_relevance.trim()) ||
      (r.recommendation && r.recommendation.trim()) ||
      (r.common_mistakes && r.common_mistakes.trim())
    ) {
      withCard++;
    }
  }
  return {
    sections_total: rows.length,
    with_card: withCard,
    without_card: rows.length - withCard,
  };
}
