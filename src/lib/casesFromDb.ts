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
  const raw = (row.ampel as string | undefined) ?? (tl ? TL_TO_AMPEL[tl] : undefined) ?? "gruen";
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
  const { data: links } = await (supabase.from("case_legal_links") as any)
    .select(
      "explanation, legal_sections(id, section_number, title, summary, practice_relevance, recommendation, common_mistakes, full_text, official_url, version_label, valid_from, valid_to, status, last_reviewed_at, legal_sources(id, name, jurisdiction, official_url))",
    )
    .eq("case_id", id);

  const rows = (links ?? []) as Array<any>;

  const legalSections = rows
    .map((l) => {
      const s = l?.legal_sections;
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
        explanation: (l.explanation as string | null) ?? null,
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
