import { supabase } from "@/integrations/supabase/client";
import { assertAdminWrite } from "@/lib/adminAuth";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";


export type PracticeCase = Tables<"practice_cases">;
export type PracticeCaseInsert = TablesInsert<"practice_cases">;
export type PracticeCaseUpdate = TablesUpdate<"practice_cases">;
export type LegalSource = Tables<"legal_sources">;
export type LegalSection = Tables<"legal_sections">;
export type DocumentTemplate = Tables<"document_templates">;
export type PracticeCategory = Tables<"practice_categories">;
export type Keyword = Tables<"keywords">;
export type CaseLegalLink = Tables<"case_legal_links">;

type QueryFilter = Record<string, unknown>;
type SupabaseLikeError = { message: string; code?: string | null };

export class SupabaseQueryError extends Error {
  table: string;
  filter: QueryFilter;
  code?: string | null;
  rows?: number;

  constructor({
    table,
    filter,
    message,
    code,
    rows,
  }: {
    table: string;
    filter: QueryFilter;
    message: string;
    code?: string | null;
    rows?: number;
  }) {
    super(message);
    this.name = "SupabaseQueryError";
    this.table = table;
    this.filter = filter;
    this.code = code;
    this.rows = rows;
  }
}

function logQuery(table: string, filter: QueryFilter, rows: number, error?: SupabaseLikeError | null) {
  console.debug("[db] supabase query", {
    table,
    filter,
    rows,
    error: error?.message ?? null,
    code: error?.code ?? null,
  });
}

function throwQueryError(
  table: string,
  filter: QueryFilter,
  error: SupabaseLikeError,
  rows?: number,
): never {
  logQuery(table, filter, rows ?? 0, error);
  throw new SupabaseQueryError({
    table,
    filter,
    message: error.message,
    code: error.code,
    rows,
  });
}

function throwRowCountError(
  table: string,
  filter: QueryFilter,
  message: string,
  rows: number,
): never {
  const error = { message, code: "ROW_COUNT_MISMATCH" };
  logQuery(table, filter, rows, error);
  throw new SupabaseQueryError({ table, filter, message, code: error.code, rows });
}

export const AMPEL_LABELS: Record<string, string> = {
  gruen: "Grün",
  gelb: "Gelb",
  rot: "Rot",
};
export const AMPEL_DOT: Record<string, string> = {
  gruen: "bg-emerald-500",
  gelb: "bg-amber-500",
  rot: "bg-rose-500",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  review: "In Prüfung",
  published: "Veröffentlicht",
  archived: "Archiviert",
};
export const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  archived: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

// DB uses `traffic_light` (green/yellow/red); the UI uses `ampel` (gruen/gelb/rot).
// Translate on the way in and out so the rest of the app can keep using `ampel`.
const AMPEL_TO_TL: Record<string, string> = { gruen: "green", gelb: "yellow", rot: "red" };
const TL_TO_AMPEL: Record<string, string> = { green: "gruen", yellow: "gelb", red: "rot" };

function toDbCasePayload<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  const { ampel, ...rest } = payload as Record<string, unknown>;
  if (ampel != null) {
    const key = String(ampel);
    (rest as Record<string, unknown>).traffic_light = AMPEL_TO_TL[key] ?? key;
  }
  return rest;
}

function fromDbCaseRow<T extends Record<string, unknown>>(row: T): T & { ampel: string } {
  const tl = (row as Record<string, unknown>).traffic_light;
  const key = tl == null ? "" : String(tl);
  return { ...row, ampel: TL_TO_AMPEL[key] ?? key ?? "gruen" };
}

export async function listCases() {
  const filter = { order: "created_at.desc" };
  const { data, error } = await supabase
    .from("practice_cases")
    .select("*")
    .order("created_at", { ascending: false });
  const rows = data?.length ?? 0;
  logQuery("practice_cases", filter, rows, error);
  if (error) throwQueryError("practice_cases", filter, error, rows);
  return (data ?? []).map((r) => fromDbCaseRow(r as Record<string, unknown>)) as unknown as Array<
    PracticeCase & { ampel: string }
  >;
}

export async function getCase(id: string) {
  const filter = { id };
  const { data, error } = await supabase.from("practice_cases").select("*").eq("id", id).limit(2);
  const rows = data?.length ?? 0;
  logQuery("practice_cases", filter, rows, error);
  if (error) throwQueryError("practice_cases", filter, error, rows);
  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    throwRowCountError("practice_cases", filter, `Praxisfall ${id} ist nicht eindeutig.`, data.length);
  }
  return fromDbCaseRow(data[0] as Record<string, unknown>) as unknown as PracticeCase & {
    ampel: string;
  };
}

export async function createCase(payload: PracticeCaseInsert) {
  assertAdminWrite();
  const dbPayload = toDbCasePayload(payload as unknown as Record<string, unknown>);
  const filter = {
    title: (dbPayload.title as string) ?? null,
    status: (dbPayload.status as string) ?? null,
  };
  console.debug("[db] insert practice_cases", filter, dbPayload);
  const { data, error } = await (supabase.from("practice_cases") as any)
    .insert(dbPayload)
    .select("*");
  const rows = data?.length ?? 0;
  logQuery("practice_cases", filter, rows, error);
  if (error) throwQueryError("practice_cases", filter, error, rows);
  if (!data || data.length !== 1) {
    throwRowCountError(
      "practice_cases",
      filter,
      "Praxisfall konnte nicht angelegt werden (keine eindeutige Zeile zurückgegeben – evtl. RLS).",
      rows,
    );
  }
  return fromDbCaseRow(data[0] as Record<string, unknown>) as unknown as PracticeCase & {
    ampel: string;
  };
}

export async function updateCase(id: string, payload: PracticeCaseUpdate) {
  assertAdminWrite();
  const dbPayload = toDbCasePayload(payload as unknown as Record<string, unknown>);
  const filter = { id };
  console.debug("[db] update practice_cases", { filter, dbPayload });
  const { data, error } = await (supabase.from("practice_cases") as any)
    .update(dbPayload)
    .eq("id", id)
    .select("*");
  const rows = data?.length ?? 0;
  logQuery("practice_cases", filter, rows, error);
  if (error) throwQueryError("practice_cases", filter, error, rows);
  if (!data || data.length !== 1) {
    throwRowCountError(
      "practice_cases",
      filter,
      `Praxisfall ${id} nicht aktualisiert (${rows} Zeilen – Datensatz existiert nicht, ist nicht eindeutig oder RLS blockiert).`,
      rows,
    );
  }
  return fromDbCaseRow(data[0] as Record<string, unknown>) as unknown as PracticeCase & {
    ampel: string;
  };
}


export async function deleteCase(id: string) {
  assertAdminWrite();
  // Explicit cascade: remove links from join tables first, then the case.
  // (DB FKs use ON DELETE CASCADE, but we run them explicitly for logging.)
  const kw = await supabase.from("case_keywords").delete().eq("case_id", id);
  logQuery("case_keywords", { case_id: id }, (kw.data as unknown as unknown[] | null)?.length ?? 0, kw.error);
  if (kw.error) throwQueryError("case_keywords", { case_id: id }, kw.error);
  const ll = await supabase.from("case_legal_links").delete().eq("case_id", id);
  logQuery("case_legal_links", { case_id: id }, (ll.data as unknown as unknown[] | null)?.length ?? 0, ll.error);
  if (ll.error) throwQueryError("case_legal_links", { case_id: id }, ll.error);
  const { error } = await supabase.from("practice_cases").delete().eq("id", id);
  logQuery("practice_cases", { id, op: "delete" }, 0, error);
  if (error) throwQueryError("practice_cases", { id }, error);
}

export async function listSources() {
  const filter = { order: "name.asc" };
  const { data, error } = await (supabase.from("legal_sources") as any).select("*").order("name");
  const rows = data?.length ?? 0;
  logQuery("legal_sources", filter, rows, error);
  if (error) throwQueryError("legal_sources", filter, error, rows);
  // UI compatibility: expose `short_name` and `title` aliases based on live `name` column.
  return ((data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    ...s,
    short_name: (s.short_name as string) ?? (s.name as string) ?? "",
    title: (s.title as string) ?? (s.name as string) ?? "",
  })) as any;
}

export async function listSections() {
  const filter = { order: "section_number.asc" };
  // PostgREST begrenzt eine einzelne Antwort standardmäßig auf 1000 Zeilen -
  // bei > 1000 Rechtsgrundlagen (Fund beim BASS-Vollimport, 2026-08-13:
  // 17.557 legal_sections) würden sonst stillschweigend nur die ersten 1000
  // geladen, ohne Fehler. Seitenweise nachladen, bis eine Seite < PAGE_SIZE
  // Zeilen liefert.
  const PAGE_SIZE = 1000;
  const all: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await (supabase.from("legal_sections") as any)
      .select("*")
      .order("section_number")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      logQuery("legal_sections", filter, all.length, error);
      throwQueryError("legal_sections", filter, error, all.length);
    }
    all.push(...((data ?? []) as Array<Record<string, unknown>>));
    if (!data || data.length < PAGE_SIZE) break;
  }
  logQuery("legal_sections", filter, all.length, null);
  // Provide `reference` alias for UI compatibility (DB column is `section_number`).
  return all.map((s: Record<string, unknown>) => ({
    ...s,
    reference: (s.section_number as string) ?? (s.reference as string) ?? "",
  })) as any;
}

// ---------------------------------------------------------------------------
// Rechtsquellen-Manager: CRUD für legal_sources & legal_sections + Nutzung
// ---------------------------------------------------------------------------

export type LegalSourceInput = {
  name: string;
  legal_area?: string | null;
  scope?: string | null;
  description?: string | null;
};

const SOURCE_DATE_FIELDS = ["valid_from", "valid_to", "last_reviewed_at"] as const;
const SECTION_DATE_FIELDS = ["valid_from", "valid_to", "last_reviewed_at"] as const;

/**
 * Normalisiert Datumsfelder für Postgres `date`-Spalten:
 * - "" / null / undefined → null
 * - "YYYY-MM-DD" → unverändert (nach Validierung)
 * - "TT.MM.JJJJ" → "YYYY-MM-DD"
 * - ungültige Werte → Fehler „Bitte ein gültiges Datum eingeben oder Feld leer lassen."
 */
export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    const yn = +y, mn = +m, dn = +d;
    const dt = new Date(Date.UTC(yn, mn - 1, dn));
    if (dt.getUTCFullYear() === yn && dt.getUTCMonth() === mn - 1 && dt.getUTCDate() === dn) {
      return s;
    }
  }
  const de = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
  if (de) {
    const [, dd, mm, yy] = de;
    let yn = +yy;
    if (yn < 100) yn += 2000;
    const mn = +mm, dn = +dd;
    const dt = new Date(Date.UTC(yn, mn - 1, dn));
    if (dt.getUTCFullYear() === yn && dt.getUTCMonth() === mn - 1 && dt.getUTCDate() === dn) {
      return `${yn.toString().padStart(4, "0")}-${mn.toString().padStart(2, "0")}-${dn
        .toString()
        .padStart(2, "0")}`;
    }
  }
  throw new Error("Bitte ein gültiges Datum eingeben oder Feld leer lassen.");
}

function normalizeDateFields<T extends Record<string, unknown>>(
  payload: T,
  fields: readonly string[],
): T {
  const out: Record<string, unknown> = { ...payload };
  for (const f of fields) {
    if (f in out) out[f] = normalizeDate(out[f]);
  }
  return out as T;
}

function sanitizeSourcePayload(
  input: Record<string, unknown>,
  { forInsert }: { forInsert: boolean },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") {
      out[k] = null;
      continue;
    }
    out[k] = v;
  }
  if (forInsert && (out.source_type === undefined || out.source_type === null)) {
    out.source_type = "law";
  }
  return out;
}

export async function createSource(payload: LegalSourceInput) {
  assertAdminWrite();
  const normalized = normalizeDateFields(payload as Record<string, unknown>, SOURCE_DATE_FIELDS);
  const clean = sanitizeSourcePayload(normalized, { forInsert: true });
  const filter = { name: clean.name };
  const { data, error } = await (supabase.from("legal_sources") as any)
    .insert(clean)
    .select("*");
  const rows = data?.length ?? 0;
  logQuery("legal_sources", filter, rows, error);
  if (error) throwQueryError("legal_sources", filter, error, rows);
  if (!data || data.length !== 1) {
    throwRowCountError("legal_sources", filter, "Rechtsquelle konnte nicht eindeutig gespeichert werden.", rows);
  }
  return data[0];
}

export async function updateSource(id: string, payload: Partial<LegalSourceInput>) {
  assertAdminWrite();
  const normalized = normalizeDateFields(payload as Record<string, unknown>, SOURCE_DATE_FIELDS);
  const clean = sanitizeSourcePayload(normalized, { forInsert: false });
  const filter = { id };
  const { data, error } = await (supabase.from("legal_sources") as any)
    .update(clean)
    .eq("id", id)
    .select("*");
  const rows = data?.length ?? 0;
  logQuery("legal_sources", filter, rows, error);
  if (error) throwQueryError("legal_sources", filter, error, rows);
  if (!data || data.length !== 1) {
    throwRowCountError("legal_sources", filter, `Rechtsquelle ${id} nicht aktualisiert.`, rows);
  }
  return data[0];
}


export async function deleteSource(id: string) {
  assertAdminWrite();
  const { error } = await supabase.from("legal_sources").delete().eq("id", id);
  logQuery("legal_sources", { id, op: "delete" }, 0, error);
  if (error) throwQueryError("legal_sources", { id }, error);
}

export type LegalSectionInput = {
  source_id: string;
  section_number: string;
  title?: string | null;
  summary?: string | null;
  full_text?: string | null;
  practice_relevance?: string | null;
  recommendation?: string | null;
  common_mistakes?: string | null;
  related_section_ids?: string[] | null;
  official_url?: string | null;
  valid_from?: string | null;
  version_label?: string | null;
  last_reviewed_at?: string | null;
  status?: "draft" | "reviewed" | "published";
  content?: string | null;
  note?: string | null;
};

export const FULL_TEXT_PLACEHOLDER =
  "Volltext im MVP noch nicht hinterlegt. Maßgeblich ist die offizielle Quelle.";

function ensureFullText<T extends Record<string, unknown>>(payload: T): T {
  const out: Record<string, unknown> = { ...payload };
  const raw = out.full_text;
  const value = typeof raw === "string" ? raw.trim() : raw;
  if (value == null || value === "") {
    const summary = typeof out.summary === "string" ? out.summary.trim() : "";
    out.full_text = summary ? summary : FULL_TEXT_PLACEHOLDER;
  } else {
    out.full_text = value;
  }
  return out as T;
}


export async function createSection(payload: LegalSectionInput) {
  assertAdminWrite();
  const dated = normalizeDateFields(payload as Record<string, unknown>, SECTION_DATE_FIELDS);
  const clean = ensureFullText(dated) as LegalSectionInput;
  const filter = { source_id: clean.source_id, section_number: clean.section_number };
  const { data, error } = await (supabase.from("legal_sections") as any)
    .insert(clean)
    .select("*");
  const rows = data?.length ?? 0;
  logQuery("legal_sections", filter, rows, error);
  if (error) throwQueryError("legal_sections", filter, error, rows);
  if (!data || data.length !== 1) {
    throwRowCountError("legal_sections", filter, "Rechtsabschnitt konnte nicht eindeutig gespeichert werden.", rows);
  }
  return data[0];
}

export async function updateSection(id: string, payload: Partial<LegalSectionInput>) {
  assertAdminWrite();
  const dated = normalizeDateFields(payload as Record<string, unknown>, SECTION_DATE_FIELDS);
  // On update we only enforce full_text if the caller touched it (or summary),
  // so partial updates don't overwrite existing full_text with a placeholder.
  const clean =
    "full_text" in dated || "summary" in dated ? ensureFullText(dated) : dated;
  const filter = { id };
  const { data, error } = await (supabase.from("legal_sections") as any)
    .update(clean)
    .eq("id", id)
    .select("*");
  const rows = data?.length ?? 0;
  logQuery("legal_sections", filter, rows, error);
  if (error) throwQueryError("legal_sections", filter, error, rows);
  if (!data || data.length !== 1) {
    throwRowCountError("legal_sections", filter, `Rechtsabschnitt ${id} nicht aktualisiert.`, rows);
  }
  return data[0];
}

export async function deleteSection(id: string) {
  assertAdminWrite();
  // Verknüpfungen zuerst entfernen (FKs sollten kaskadieren, wir loggen explizit).
  const ll = await (supabase.from("case_legal_links") as any).delete().eq("legal_section_id", id);
  if (ll.error) throwQueryError("case_legal_links", { legal_section_id: id }, ll.error);
  const { error } = await supabase.from("legal_sections").delete().eq("id", id);
  logQuery("legal_sections", { id, op: "delete" }, 0, error);
  if (error) throwQueryError("legal_sections", { id }, error);
}

/**
 * Bulk-Import: legt für die ausgewählten importierten Abschnitte
 * jeweils eine neue Zeile in `legal_sections` an (Status = draft).
 * Bereits vorhandene Abschnitte (gleiche source_id + section_number)
 * werden nicht überschrieben – die Redaktion entscheidet manuell,
 * ob sie im Änderungsmodus aktualisiert.
 */
export type ImportSectionDraft = {
  section_number: string;
  title?: string | null;
  full_text: string;
  official_url?: string | null;
  source_hash?: string | null;
  summary?: string | null;
  practice_relevance?: string | null;
  recommendation?: string | null;
  common_mistakes?: string | null;
  version_label?: string | null;
};

export type BulkImportItem = {
  section_number: string;
  title: string;
  section_id: string | null;
  action: "inserted" | "updated" | "skipped";
  source_hash: string | null;
};

export async function bulkImportSections(
  sourceId: string,
  drafts: ImportSectionDraft[],
  importUrl: string,
  jobId?: string | null,
  manifestId?: string | null,
) {
  assertAdminWrite();
  if (!drafts.length)
    return { inserted: 0, updated: 0, skipped: 0, ids: [] as string[], items: [] as BulkImportItem[] };
  const now = new Date().toISOString();

  // Bereits vorhandene Abschnitte laden (idempotenter Import).
  const nums = drafts.map((d) => d.section_number);
  const { data: existingRows, error: exErr } = await (supabase.from("legal_sections") as any)
    .select(
      "id, section_number, full_text, source_hash, status, last_reviewed_at, summary, practice_relevance, recommendation, common_mistakes, version_label",
    )
    .eq("source_id", sourceId)
    .in("section_number", nums);
  if (exErr) throwQueryError("legal_sections", { source_id: sourceId, op: "lookup" }, exErr);
  const existing = new Map<string, any>();
  for (const r of (existingRows ?? []) as any[]) existing.set(String(r.section_number), r);

  const items: BulkImportItem[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const insertedIds: string[] = [];
  let updated = 0;
  let skipped = 0;

  for (const d of drafts) {
    const ex = existing.get(String(d.section_number));
    const hashSame = ex && d.source_hash && ex.source_hash === d.source_hash;
    const textSame = ex && (ex.full_text || "").trim() === (d.full_text || "").trim();
    if (ex && (hashSame || textSame)) {
      skipped++;
      items.push({ section_number: d.section_number, title: d.title ?? "", section_id: ex.id, action: "skipped", source_hash: d.source_hash ?? null });
      continue;
    }
    if (ex) {
      // Update – redaktionelle Felder NIE überschreiben.
      const patch: Record<string, unknown> = {
        full_text: d.full_text,
        official_url: d.official_url ?? importUrl,
        source_hash: d.source_hash ?? null,
        import_url: importUrl,
        imported_at: now,
        version_label: d.version_label ?? ex.version_label ?? null,
      };
      if (jobId) patch.import_job_id = jobId;
      if (manifestId) patch.import_manifest_id = manifestId;
      if (!ex.summary && d.summary) patch.summary = d.summary;
      if (!ex.practice_relevance && d.practice_relevance) patch.practice_relevance = d.practice_relevance;
      if (!ex.recommendation && d.recommendation) patch.recommendation = d.recommendation;
      if (!ex.common_mistakes && d.common_mistakes) patch.common_mistakes = d.common_mistakes;
      const { error: updErr } = await (supabase.from("legal_sections") as any)
        .update(patch)
        .eq("id", ex.id);
      if (updErr) throwQueryError("legal_sections", { id: ex.id, op: "update" }, updErr);
      updated++;
      items.push({ section_number: d.section_number, title: d.title ?? "", section_id: ex.id, action: "updated", source_hash: d.source_hash ?? null });
      continue;
    }
    toInsert.push({
      source_id: sourceId,
      section_number: d.section_number,
      title: d.title ?? null,
      full_text: d.full_text,
      official_url: d.official_url ?? importUrl,
      summary: d.summary ?? null,
      practice_relevance: d.practice_relevance ?? null,
      recommendation: d.recommendation ?? null,
      common_mistakes: d.common_mistakes ?? null,
      version_label: d.version_label ?? null,
      status: "draft" as const,
      import_url: importUrl,
      imported_at: now,
      source_hash: d.source_hash ?? null,
      ...(jobId ? { import_job_id: jobId } : {}),
      ...(manifestId ? { import_manifest_id: manifestId } : {}),
    });
  }

  if (toInsert.length) {
    const filter = { source_id: sourceId, count: toInsert.length };
    const { data, error } = await (supabase.from("legal_sections") as any)
      .insert(toInsert)
      .select("id, section_number");
    const rowsBack = data?.length ?? 0;
    logQuery("legal_sections", filter, rowsBack, error);
    if (error) throwQueryError("legal_sections", filter, error, rowsBack);
    for (const r of (data ?? []) as Array<{ id: string; section_number: string }>) {
      insertedIds.push(r.id);
      const draft = drafts.find((d) => d.section_number === r.section_number);
      items.push({
        section_number: r.section_number,
        title: draft?.title ?? "",
        section_id: r.id,
        action: "inserted",
        source_hash: draft?.source_hash ?? null,
      });
    }
  }

  return { inserted: insertedIds.length, updated, skipped, ids: insertedIds, items };
}


/**
 * Nutzungsstatistik: pro Rechtsabschnitt die Anzahl verknüpfter Praxisfälle
 * inklusive Titel & ID. Aggregiert aus case_legal_links.
 */
export type SectionUsageEntry = {
  count: number;
  cases: Array<{
    link_id: string;
    id: string;
    title: string;
    status?: string;
    relevance?: string | null;
    explanation?: string | null;
    note?: string | null;
  }>;
};

export async function listSectionUsage() {
  const { data, error } = await (supabase.from("case_legal_links") as any)
    .select("id, legal_section_id, explanation, relevance, practice_cases(id,title,status)");
  const rows = data?.length ?? 0;
  logQuery("case_legal_links", { agg: "section_usage" }, rows, error);
  if (error) throwQueryError("case_legal_links", { agg: "section_usage" }, error, rows);
  const map = new Map<string, SectionUsageEntry>();
  for (const row of (data ?? []) as any[]) {
    const sid = row.legal_section_id as string;
    if (!sid) continue;
    const entry = map.get(sid) ?? { count: 0, cases: [] };
    entry.count += 1;
    if (row.practice_cases) {
      entry.cases.push({
        link_id: row.id,
        id: row.practice_cases.id,
        title: row.practice_cases.title,
        status: row.practice_cases.status,
        relevance: row.relevance ?? null,
        explanation: row.explanation ?? null,
        note: row.explanation ?? null,
      });
    }
    map.set(sid, entry);
  }
  return map;
}

export async function listTemplates() {
  const filter = { order: "title.asc" };
  const { data, error } = await supabase.from("document_templates").select("*").order("title");
  const rows = data?.length ?? 0;
  logQuery("document_templates", filter, rows, error);
  if (error) throwQueryError("document_templates", filter, error, rows);
  return data ?? [];
}

export async function listCategories() {
  const filter = { order: "sort_order.asc" };
  const { data, error } = await supabase.from("practice_categories").select("*").order("sort_order");
  const rows = data?.length ?? 0;
  logQuery("practice_categories", filter, rows, error);
  if (error) throwQueryError("practice_categories", filter, error, rows);
  return data ?? [];
}

// NOTE: Live DB column is `keyword`, but generated types still say `name`.
// Cast the client for keyword-related calls until types regenerate.
const kwClient = supabase as unknown as {
  from: (table: string) => ReturnType<typeof supabase.from>;
};

export async function listKeywords() {
  const filter = { order: "keyword.asc" };
  const { data, error } = await (kwClient.from("keywords") as any).select("*").order("keyword");
  const rows = data?.length ?? 0;
  logQuery("keywords", filter, rows, error);
  if (error) throwQueryError("keywords", filter, error, rows);
  return (data ?? []) as Array<{ id: string; keyword: string; created_at: string }>;
}
export async function createKeyword(name: string) {
  assertAdminWrite();
  const filter = { keyword: name };
  console.debug("[db] insert keywords", filter);
  const { data, error } = await (kwClient.from("keywords") as any).insert({ keyword: name }).select("*");
  const rows = data?.length ?? 0;
  logQuery("keywords", filter, rows, error);
  if (error) throwQueryError("keywords", filter, error, rows);
  if (!data || data.length !== 1) {
    throwRowCountError("keywords", filter, "Schlagwort konnte nicht eindeutig gespeichert werden.", rows);
  }

  return data[0] as { id: string; keyword: string; created_at: string };
}
export async function deleteKeyword(id: string) {
  assertAdminWrite();
  const { error } = await supabase.from("keywords").delete().eq("id", id);
  if (error) throwQueryError("keywords", { id }, error);
}

export async function listCaseKeywords(caseId: string) {
  const filter = { case_id: caseId };
  const { data, error } = await supabase
    .from("case_keywords")
    .select("keyword_id, keywords(id, keyword)")
    .eq("case_id", caseId);
  const rows = data?.length ?? 0;
  logQuery("case_keywords", filter, rows, error);
  if (error) throwQueryError("case_keywords", filter, error, rows);
  return (data ?? []) as unknown as Array<{
    keyword_id: string;
    keywords: { id: string; keyword: string } | null;
  }>;
}

export async function linkCaseKeyword(caseId: string, keywordId: string) {
  assertAdminWrite();
  const filter = { case_id: caseId, keyword_id: keywordId };
  const { error } = await supabase
    .from("case_keywords")
    .insert({ case_id: caseId, keyword_id: keywordId });
  if (error && !String(error.message).includes("duplicate")) throwQueryError("case_keywords", filter, error);
}
export async function unlinkCaseKeyword(caseId: string, keywordId: string) {
  assertAdminWrite();
  const filter = { case_id: caseId, keyword_id: keywordId };
  const { error } = await supabase
    .from("case_keywords")
    .delete()
    .eq("case_id", caseId)
    .eq("keyword_id", keywordId);
  if (error) throwQueryError("case_keywords", filter, error);
}

export async function listCaseLegalLinks(caseId?: string) {
  const filter = caseId ? { case_id: caseId } : { all: true };
  let q = (supabase.from("case_legal_links") as any)
    .select("id, case_id, legal_section_id, explanation, relevance, created_at, practice_cases(id,title), legal_sections(id,section_number,title,source_id,legal_sources(name))")
    .order("created_at", { ascending: false });
  if (caseId) q = q.eq("case_id", caseId);
  const { data, error } = await q;
  const rows = data?.length ?? 0;
  logQuery("case_legal_links", filter, rows, error);
  if (error) throwQueryError("case_legal_links", filter, error, rows);
  // UI-Kompat-Aliasse (`note`←explanation, `reference`←section_number, `short_name`←name).
  return ((data ?? []) as any[]).map((l) => {
    l.note = l.explanation ?? null;
    if (l?.legal_sections) {
      l.legal_sections.reference =
        l.legal_sections.section_number ?? l.legal_sections.reference ?? "";
      if (l.legal_sections.legal_sources) {
        l.legal_sections.legal_sources.short_name =
          l.legal_sections.legal_sources.short_name ??
          l.legal_sections.legal_sources.name ??
          "";
      }
    }
    return l;
  }) as any[];
}
export async function createLegalLink(
  caseId: string,
  sectionId: string,
  note?: string,
  relevance?: "low" | "medium" | "high" | null,
) {
  assertAdminWrite();
  const filter = { case_id: caseId, legal_section_id: sectionId };
  console.debug("[db] insert case_legal_links", filter);
  const payload: Record<string, unknown> = {
    case_id: caseId,
    legal_section_id: sectionId,
    explanation: note ?? null,
  };
  if (relevance !== undefined) payload.relevance = relevance;
  const { data, error } = await (supabase.from("case_legal_links") as any)
    .insert(payload)
    .select("*");
  const rows = data?.length ?? 0;
  logQuery("case_legal_links", filter, rows, error);
  if (error) throwQueryError("case_legal_links", filter, error, rows);
  if (!data || data.length !== 1) {
    throwRowCountError("case_legal_links", filter, "Rechtsverknüpfung konnte nicht eindeutig gespeichert werden.", rows);
  }
  return data[0];
}
export async function deleteLegalLink(id: string) {
  assertAdminWrite();
  const { error } = await supabase.from("case_legal_links").delete().eq("id", id);
  if (error) throwQueryError("case_legal_links", { id }, error);
}

export async function updateLegalLink(
  id: string,
  patch: { explanation?: string | null; relevance?: "low" | "medium" | "high" | null },
) {
  assertAdminWrite();
  const payload: Record<string, unknown> = {};
  if (patch.explanation !== undefined) payload.explanation = patch.explanation;
  if (patch.relevance !== undefined) payload.relevance = patch.relevance;
  if (Object.keys(payload).length === 0) return null;
  const { data, error } = await (supabase.from("case_legal_links") as any)
    .update(payload)
    .eq("id", id)
    .select("*");
  if (error) throwQueryError("case_legal_links", { id }, error);
  return (data ?? [])[0] ?? null;
}
