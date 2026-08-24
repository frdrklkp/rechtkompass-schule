import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CaseData, Ampel } from "@/data/cases";

const AMPEL_LABEL: Record<Ampel, string> = {
  gruen: "Alltagssituation – eigenständig lösbar",
  gelb: "Sorgfalt, Rücksprache und Dokumentation erforderlich",
  rot: "Kritisch – Schulleitung sofort einbeziehen",
};

export function mapDbCase(row: Record<string, unknown>): CaseData {
  const TL_TO_AMPEL: Record<string, Ampel> = { green: "gruen", yellow: "gelb", red: "rot" };
  const tl = row.traffic_light as string | undefined;
  // Fund 2026-08-20: `practice_cases.ampel` hat einen DB-Default "gruen" und
  // wurde von manchen Schreibpfaden (coreBuilder.ts vor dem dortigen Fix)
  // beim Insert gar nicht gesetzt, sodass die Spalte klammheimlich auf
  // "gruen" verfiel, während `traffic_light` den korrekten Wert trug.
  // `traffic_light` gilt daher als kanonisch (siehe coreBuilder.ts-Kommentar
  // "DB uses traffic_light"); rohes `ampel` ist nur Fallback für Zeilen ohne
  // gesetztes traffic_light.
  const raw = (tl ? TL_TO_AMPEL[tl] : undefined) ?? (row.ampel as string | undefined) ?? "gruen";
  const ampel = raw as Ampel;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? (v as unknown[]).map((x) => String(x)) : [];
  return {
    id: String(row.id),
    title: (row.title as string) ?? "",
    category: (row.category as string) ?? "Allgemein",
    subcategory: (row.subcategory as string) ?? "",
    shortDescription: (row.short_description as string) ?? "",
    shortAnswer: (row.short_answer as string) ?? (row.immediate_actions as string) ?? "",
    ampel,
    ampelLabel: AMPEL_LABEL[ampel] ?? "",
    legalExplanation: (row.legal_explanation as string) ?? "",
    recommendation:
      (row.recommendation as string) ?? (row.immediate_actions as string) ?? "",
    checklist: arr(row.checklist),
    documentation: arr(row.documentation),
    responsibleParty: (row.responsibilities as string) ?? "",
    legalBasis: [],
    risks: arr(row.common_mistakes),
    applicableTemplates: [],
    searchTerms: [],
    tags: [],
    relatedCases: arr(row.related_cases),
    practiceTip: (row.practice_tip as string | null | undefined) ?? null,
    commonMistakesRaw: (row.common_mistakes as string[] | string | null | undefined) ?? null,
    decisionTreeRaw: row.decision_tree ?? null,
    workflowStatus: (row.workflow_status as string | undefined) ?? undefined,
    legalReviewStatus: (row.legal_review_status as "gruen" | "gelb" | "rot" | null | undefined) ?? null,
    legalReviewReasoning: (row.legal_review_reasoning as string | null | undefined) ?? null,
  };
}


async function fetchPublishedCases(): Promise<CaseData[]> {
  const { data, error } = await supabase
    .from("practice_cases")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapDbCase(r as Record<string, unknown>));
}

export function usePublishedCases() {
  return useQuery({
    queryKey: ["published-cases"],
    queryFn: fetchPublishedCases,
    staleTime: 60_000,
  });
}

async function fetchCaseById(id: string): Promise<CaseData | null> {
  const { data, error } = await supabase
    .from("practice_cases")
    .select("*")
    .eq("id", id)
    .limit(2);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  if (data.length > 1) throw new Error(`Praxisfall ${id} ist nicht eindeutig.`);

  const base = mapDbCase(data[0] as Record<string, unknown>);

  // Enrich with legal links (case_legal_links -> legal_sections -> legal_sources).
  // Select the full editorial fields so the teacher-facing modal can render
  // the complete knowledge card without a second round-trip.
  //
  // Zweistufig statt verschachteltem Embed (Fund 2026-08-14): case_legal_links.
  // legal_section_id hat keinen Datenbank-Fremdschlüssel (nur die ungenutzte
  // Alt-Spalte section_id hat einen), wodurch PostgREST den automatischen
  // "legal_sections(...)"-Embed nicht auflösen kann und still legal_sections:
  // null zurückgibt - betraf u.a. genau diese Funktion (öffentliche
  // Falldetailseite zeigte dadurch nie Rechtsgrundlagen an).
  const { data: linkRows } = await (supabase.from("case_legal_links") as any)
    .select("legal_section_id, explanation, content_summary, content_summary_kind, precise_reference")
    .eq("case_id", id);
  type LinkRow = {
    legal_section_id: string;
    explanation: string | null;
    content_summary: string | null;
    content_summary_kind: "wortlaut" | "zusammengefasst" | null;
    precise_reference: string | null;
  };
  const linkBySection = new Map(
    ((linkRows ?? []) as LinkRow[]).filter((l) => l.legal_section_id).map((l) => [l.legal_section_id, l]),
  );
  const sectionIds = [...linkBySection.keys()];
  const { data: sectionRows } = sectionIds.length
    ? await (supabase.from("legal_sections") as any)
        .select(
          "id, section_number, title, summary, practice_relevance, recommendation, common_mistakes, full_text, official_url, version_label, valid_from, valid_to, status, last_reviewed_at, legal_sources(id, name, jurisdiction, official_url)",
        )
        .in("id", sectionIds)
    : { data: [] };

  const legalSections = ((sectionRows ?? []) as Array<any>)
    .map((s) => {
      if (!s?.id) return null;
      const src = s.legal_sources ?? null;
      return {
        id: s.id as string,
        section_number: (s.section_number as string) ?? "",
        title: (s.title as string | null) ?? null,
        summary: s.summary ?? null,
        practice_relevance: s.practice_relevance ?? null,
        recommendation: s.recommendation ?? null,
        common_mistakes: s.common_mistakes ?? null,
        full_text: s.full_text ?? null,
        official_url: s.official_url ?? null,
        version_label: s.version_label ?? null,
        valid_from: s.valid_from ?? null,
        valid_to: s.valid_to ?? null,
        last_reviewed_at: s.last_reviewed_at ?? null,
        status: s.status ?? null,
        explanation: linkBySection.get(s.id)?.explanation ?? null,
        contentSummary: linkBySection.get(s.id)?.content_summary ?? null,
        contentSummaryKind: linkBySection.get(s.id)?.content_summary_kind ?? null,
        preciseReference: linkBySection.get(s.id)?.precise_reference ?? null,
        source: src
          ? {
              id: src.id as string,
              name: (src.name as string) ?? "",
              jurisdiction: src.jurisdiction ?? null,
              official_url: src.official_url ?? null,
            }
          : null,
      };
    })
    .filter(Boolean) as NonNullable<CaseData["legalSections"]>;

  const legalBasis = legalSections
    .map((s) => (s.source?.name ? `${s.section_number} ${s.source.name}` : s.section_number))
    .filter(Boolean);

  return {
    ...base,
    legalBasis: legalBasis.length ? legalBasis : base.legalBasis,
    legalSections: legalSections.length ? legalSections : undefined,
  };
}


export function usePublishedCase(id: string) {
  return useQuery({
    queryKey: ["case-full", id],
    queryFn: () => fetchCaseById(id),
    staleTime: 60_000,
  });
}

export type RelatedCaseCard = Pick<CaseData, "id" | "title" | "category" | "subcategory" | "ampel">;

/**
 * Sprint 4.6L – Echte, verlinkte "Ähnliche Fälle" statt der bisherigen
 * getRelatedCases() aus caseEnrichment.ts, die ausschließlich das kleine
 * statische Demo-Array (src/data/cases.ts) durchsucht hat und für
 * DB-Fälle daher leere oder inhaltslose Treffer lieferte.
 *
 * Liest zuerst explizite Verknüpfungen aus der bislang ungenutzten Tabelle
 * case_related_cases (case_id/related_case_id, beide Richtungen), danach
 * Auffüllung per Kategorie unter veröffentlichten Fällen. Zweistufig statt
 * verschachteltem Embed: case_related_cases hat zwei Fremdschlüssel auf
 * practice_cases (case_id UND related_case_id), was einen automatischen
 * "practice_cases(...)"-Embed mehrdeutig macht (dieselbe Klasse Problem wie
 * bei case_legal_links, Fund 2026-08-14).
 */
async function fetchRelatedCases(id: string, category: string, limit = 5): Promise<RelatedCaseCard[]> {
  const { data: linkRows } = await (supabase as any)
    .from("case_related_cases")
    .select("case_id, related_case_id")
    .or(`case_id.eq.${id},related_case_id.eq.${id}`);
  const linkedIds = [
    ...new Set(
      ((linkRows ?? []) as Array<{ case_id: string | null; related_case_id: string | null }>)
        .map((l) => (l.case_id === id ? l.related_case_id : l.case_id))
        .filter((x): x is string => !!x && x !== id),
    ),
  ];

  const out: RelatedCaseCard[] = [];
  const seen = new Set<string>([id]);

  if (linkedIds.length > 0) {
    const { data: linked } = await supabase
      .from("practice_cases")
      .select("id,title,category,subcategory,ampel,status")
      .in("id", linkedIds)
      .eq("status", "published");
    for (const r of (linked ?? []) as Array<Record<string, unknown>>) {
      const rid = r.id as string;
      if (seen.has(rid)) continue;
      seen.add(rid);
      out.push({
        id: rid,
        title: (r.title as string) ?? "",
        category: (r.category as string) ?? "",
        subcategory: (r.subcategory as string) ?? "",
        ampel: ((r.ampel as string) ?? "gruen") as CaseData["ampel"],
      });
    }
  }

  if (out.length < limit && category) {
    const { data: sameCategory } = await supabase
      .from("practice_cases")
      .select("id,title,category,subcategory,ampel,status")
      .eq("status", "published")
      .eq("category", category)
      .limit(limit + seen.size);
    for (const r of (sameCategory ?? []) as Array<Record<string, unknown>>) {
      if (out.length >= limit) break;
      const rid = r.id as string;
      if (seen.has(rid)) continue;
      seen.add(rid);
      out.push({
        id: rid,
        title: (r.title as string) ?? "",
        category: (r.category as string) ?? "",
        subcategory: (r.subcategory as string) ?? "",
        ampel: ((r.ampel as string) ?? "gruen") as CaseData["ampel"],
      });
    }
  }

  return out.slice(0, limit);
}

export function useRelatedCases(id: string, category: string, limit = 5) {
  return useQuery({
    queryKey: ["related-cases", id, category, limit],
    queryFn: () => fetchRelatedCases(id, category, limit),
    staleTime: 60_000,
  });
}
