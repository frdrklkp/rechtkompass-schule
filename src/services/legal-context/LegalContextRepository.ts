/**
 * Sprint 4.6G – Datenzugriff für den Legal Context.
 *
 * Lädt die kuratierte Verknüpfungskette eines Praxisfalls:
 * practice_cases -> case_legal_links -> legal_sections -> legal_sources.
 * Die Übersetzung in Fachmodelle übernimmt der Resolver; diese Schicht
 * liefert ausschließlich flache Rohdaten.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  LegalContextCaseRow,
  LegalContextData,
  LegalLinkRow,
  LegalSectionRow,
  LegalSourceRow,
} from "./types";

const SECTION_COLUMNS =
  "id, source_id, section_number, title, summary, practice_relevance, recommendation, " +
  "official_url, version_label, valid_from, valid_to, status, last_reviewed_at, updated_at, " +
  "original_text";

const SOURCE_COLUMNS =
  "id, name, short_name, source_type, source_type_v2, jurisdiction, official_url, " +
  "version_label, lifecycle_status, verification_status, valid_from, valid_to, " +
  "last_verified_at, last_reviewed_at, replaced_by_source_id, updated_at";

type EmbeddedLinkRow = LegalLinkRow & {
  legal_sections?: (LegalSectionRow & { legal_sources?: LegalSourceRow | null }) | null;
};

/**
 * Lädt Fall, Verknüpfungen, Abschnitte und Quellen. Verknüpfungen ohne
 * auffindbaren Abschnitt bleiben als flache Links erhalten, damit der
 * Resolver sie als Issue melden kann.
 */
export async function fetchLegalContextData(caseId: string): Promise<LegalContextData> {
  const [caseRes, linksRes] = await Promise.all([
    supabase
      .from("practice_cases")
      .select("id, title, updated_at, status")
      .eq("id", caseId)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("case_legal_links") as any)
      .select(
        `id, legal_section_id, relevance, explanation, created_at, ` +
          `legal_sections(${SECTION_COLUMNS}, legal_sources(${SOURCE_COLUMNS}))`,
      )
      .eq("case_id", caseId),
  ]);

  if (caseRes.error) throw new Error(caseRes.error.message);
  if (linksRes.error) throw new Error(linksRes.error.message);

  const caseRow = (caseRes.data ?? null) as LegalContextCaseRow | null;
  const rows = (linksRes.data ?? []) as EmbeddedLinkRow[];

  const links: LegalLinkRow[] = [];
  const sections: LegalSectionRow[] = [];
  const sources: LegalSourceRow[] = [];
  const seenSections = new Set<string>();
  const seenSources = new Set<string>();

  for (const row of rows) {
    const section = row.legal_sections ?? null;
    links.push({
      id: row.id,
      legal_section_id: row.legal_section_id ?? section?.id ?? null,
      relevance: row.relevance ?? null,
      explanation: row.explanation ?? null,
      created_at: row.created_at ?? null,
    });
    if (section && !seenSections.has(section.id)) {
      seenSections.add(section.id);
      const { legal_sources: embeddedSource, ...sectionRow } = section;
      sections.push(sectionRow);
      const source = embeddedSource ?? null;
      if (source && !seenSources.has(source.id)) {
        seenSources.add(source.id);
        sources.push(source);
      }
    }
  }

  return { caseRow, links, sections, sources };
}
