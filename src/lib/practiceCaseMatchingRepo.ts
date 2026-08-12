/**
 * Sprint 4.6E – Datenzugriff für die Matching-Grundlage.
 *
 * Übersetzt die Supabase-Struktur (practice_cases, case_keywords,
 * case_legal_links, faq.meta) in den neutralen `PracticeCaseSource`.
 * Die Matching-Schicht selbst bleibt datenquellenfrei.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  MatchingProfile,
  PracticeCaseSource,
  PracticeCaseStatus,
} from "@/services/practice-case-matching/types";

const TL_TO_AMPEL: Record<string, "gruen" | "gelb" | "rot"> = {
  green: "gruen",
  yellow: "gelb",
  red: "rot",
  gruen: "gruen",
  gelb: "gelb",
  rot: "rot",
};

type CaseRow = Record<string, unknown>;

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)).filter((v) => v.trim().length > 0) : [];
}

function metaOf(faq: unknown): Record<string, unknown> {
  if (faq && typeof faq === "object" && !Array.isArray(faq)) {
    const meta = (faq as { meta?: unknown }).meta;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta as Record<string, unknown>;
  }
  return {};
}

function hasDecisionTree(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const nodes = (value as { nodes?: unknown }).nodes;
  if (Array.isArray(nodes)) return nodes.length > 0;
  if (nodes && typeof nodes === "object") return Object.keys(nodes).length > 0;
  return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
}

/** Eine Datenbankzeile plus Verknüpfungen in einen Match-Quelldatensatz übersetzen. */
export function toPracticeCaseSource(
  row: CaseRow,
  keywords: string[],
  legalSectionIds: string[],
): PracticeCaseSource {
  const meta = metaOf(row.faq);
  const curated = meta.matching_profile;
  const rawAmpel = String(row.ampel ?? row.traffic_light ?? "gruen");

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    status: (String(row.status ?? "draft") as PracticeCaseStatus) ?? "draft",
    ampel: TL_TO_AMPEL[rawAmpel] ?? "gruen",
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    shortDescription: (row.short_description as string | null) ?? null,
    shortAnswer: (row.short_answer as string | null) ?? (row.immediate_actions as string | null) ?? null,
    recommendation: (row.recommendation as string | null) ?? null,
    responsibilities: (row.responsibilities as string | null) ?? null,
    legalExplanation: (row.legal_explanation as string | null) ?? null,
    checklist: strArray(row.checklist),
    documentation: strArray(row.documentation),
    keywords,
    legalSectionIds,
    templateIds: strArray(meta.template_ids),
    hasDecisionTree: hasDecisionTree(row.decision_tree),
    updatedAt: (row.updated_at as string | null) ?? null,
    curatedProfile:
      curated && typeof curated === "object" && !Array.isArray(curated)
        ? (curated as Partial<MatchingProfile>)
        : null,
  };
}

/** Seitengröße für PostgREST-Abfragen (Serverlimit liegt bei 1000 Zeilen). */
export const REPO_PAGE_SIZE = 1000;

type RangeSelect = {
  select: (columns: string) => {
    order: (column: string, options?: { ascending?: boolean }) => {
      range: (from: number, to: number) => Promise<{ data: CaseRow[] | null; error: { message: string } | null }>;
    };
  };
};

/**
 * PRE-FLIGHT 1 – Alle Zeilen einer Tabelle seitenweise laden.
 *
 * PostgREST liefert höchstens 1000 Zeilen pro Anfrage. Verknüpfungstabellen
 * (`case_keywords`, `case_legal_links`) überschreiten dieses Limit deutlich,
 * weshalb ohne Paginierung Schlagwörter und Rechtsverknüpfungen stillschweigend
 * fehlen würden. Die Sortierung nach einer stabilen Spalte hält die Seiten
 * überschneidungsfrei und das Ergebnis reproduzierbar.
 */
export async function fetchAllRows(
  table: string,
  columns = "*",
  orderColumn = "case_id",
  pageSize = REPO_PAGE_SIZE,
): Promise<CaseRow[]> {
  const query = supabase.from(table as never) as unknown as RangeSelect;
  const rows: CaseRow[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * pageSize;
    const { data, error } = await query
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

/** Alle Praxisfälle inklusive Schlagwort- und Rechtsverknüpfungen laden. */
export async function fetchPracticeCaseSources(): Promise<PracticeCaseSource[]> {
  const [cases, caseKeywords, keywordRows, legalLinks] = await Promise.all([
    fetchAllRows("practice_cases", "*", "id"),
    fetchAllRows("case_keywords", "case_id, keyword_id", "case_id"),
    fetchAllRows("keywords", "*", "id"),
    fetchAllRows("case_legal_links", "*", "case_id"),
  ]);

  const keywordNames = new Map<string, string>(
    keywordRows
      .map((k) => [String(k.id), String(k.keyword ?? k.name ?? "")] as [string, string])
      .filter(([, name]) => name.length > 0),
  );
  const keywordsByCase = new Map<string, string[]>();
  for (const link of caseKeywords) {
    const name = keywordNames.get(String(link.keyword_id));
    if (!name) continue;
    const key = String(link.case_id);
    keywordsByCase.set(key, [...(keywordsByCase.get(key) ?? []), name]);
  }
  const legalByCase = new Map<string, string[]>();
  for (const link of legalLinks) {
    const key = String(link.case_id);
    const sectionId = link.section_id ?? link.legal_section_id;
    if (!sectionId) continue;
    legalByCase.set(key, [...(legalByCase.get(key) ?? []), String(sectionId)]);
  }

  return cases.map((row) =>
    toPracticeCaseSource(
      row,
      keywordsByCase.get(String(row.id)) ?? [],
      legalByCase.get(String(row.id)) ?? [],
    ),
  );

}

/** Einen einzelnen Praxisfall als Quelldatensatz laden. */
export async function fetchPracticeCaseSource(caseId: string): Promise<PracticeCaseSource | null> {
  const [row, caseKeywords, legalLinks] = await Promise.all([
    supabase.from("practice_cases").select("*").eq("id", caseId).maybeSingle(),
    supabase.from("case_keywords").select("keyword_id, keywords(*)").eq("case_id", caseId),
    (supabase.from("case_legal_links") as unknown as { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: CaseRow[] | null; error: { message: string } | null }> } }).select("*").eq("case_id", caseId),
  ]);
  if (row.error) throw new Error(row.error.message);
  if (!row.data) return null;

  const keywords = (
    (caseKeywords.data ?? []) as Array<{ keywords?: { keyword?: string; name?: string } | null }>
  )
    .map((k) => k.keywords?.keyword ?? k.keywords?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  const legalSectionIds = (
    (legalLinks.data ?? []) as Array<{ section_id?: string; legal_section_id?: string }>
  )
    .map((l) => l.section_id ?? l.legal_section_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  return toPracticeCaseSource(row.data as CaseRow, keywords, legalSectionIds);
}

/**
 * Kuratiertes Matching-Profil speichern. Andere Meta-Felder bleiben unverändert,
 * damit die Kuratierung keine bestehenden Redaktionsdaten überschreibt.
 */
export async function saveCuratedMatchingProfile(
  caseId: string,
  profile: Partial<MatchingProfile> | null,
): Promise<void> {
  const { data, error } = await supabase
    .from("practice_cases")
    .select("faq")
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Praxisfall ${caseId} wurde nicht gefunden.`);

  const faqObject =
    data.faq && typeof data.faq === "object" && !Array.isArray(data.faq)
      ? (data.faq as Record<string, unknown>)
      : {};
  const meta = { ...metaOf(data.faq) };
  if (profile) meta.matching_profile = { ...profile, updatedAt: new Date().toISOString() };
  else delete meta.matching_profile;

  const nextFaq = { ...faqObject, meta } as unknown as Json;
  const { error: updateError } = await supabase
    .from("practice_cases")
    .update({ faq: nextFaq })
    .eq("id", caseId);
  if (updateError) throw new Error(updateError.message);
}
