/**
 * Sprint 4.6G – Resolver: übersetzt Rohdaten (case_legal_links, legal_sections,
 * legal_sources) in neutral aufgelöste Rechtsgrundlagen.
 *
 * Rein deterministisch und datenquellenfrei: keine Netzwerkzugriffe, keine
 * KI, keine Ergänzungen. Fehlende Abschnitte oder Quellen werden als Issue
 * gemeldet, niemals stillschweigend ergänzt.
 */
import type {
  LegalContextData,
  LegalContextIssue,
  LegalLinkRelevance,
  LegalLinkRow,
  LegalSectionRow,
  LegalSourceInfo,
  LegalSourceRow,
  ResolvedLegalReference,
} from "./types";

const KNOWN_RELEVANCE = new Set<LegalLinkRelevance>(["high", "medium", "low"]);

/** Spaltenvarianten der Verknüpfungstabelle (Live: legal_section_id). */
export function sectionIdOfLink(link: LegalLinkRow): string | null {
  const id = link.legal_section_id ?? link.section_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function toRelevance(value: string | null | undefined): LegalLinkRelevance | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase() as LegalLinkRelevance;
  return KNOWN_RELEVANCE.has(normalized) ? normalized : null;
}

function toSourceInfo(row: LegalSourceRow): LegalSourceInfo {
  return {
    id: row.id,
    name: row.name ?? "",
    shortName: row.short_name ?? null,
    sourceType: row.source_type_v2 ?? row.source_type ?? null,
    jurisdiction: row.jurisdiction ?? null,
    officialUrl: row.official_url ?? null,
    versionLabel: row.version_label ?? null,
    lifecycleStatus: row.lifecycle_status ?? null,
    verificationStatus: row.verification_status ?? null,
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
    lastVerifiedAt: row.last_verified_at ?? null,
    lastReviewedAt: row.last_reviewed_at ?? null,
    replacedBySourceId: row.replaced_by_source_id ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function toReference(
  link: LegalLinkRow,
  section: LegalSectionRow,
  source: LegalSourceInfo | null,
): ResolvedLegalReference {
  return {
    linkId: link.id,
    sectionId: section.id,
    reference: (section.section_number ?? "").trim() || "Abschnitt",
    title: section.title ?? null,
    summary: section.summary ?? null,
    practiceRelevance: section.practice_relevance ?? null,
    recommendation: section.recommendation ?? null,
    officialUrl: section.official_url ?? source?.officialUrl ?? null,
    sectionStatus: section.status ?? null,
    sectionValidFrom: section.valid_from ?? null,
    sectionValidTo: section.valid_to ?? null,
    sectionVersionLabel: section.version_label ?? null,
    sectionLastReviewedAt: section.last_reviewed_at ?? null,
    sectionUpdatedAt: section.updated_at ?? null,
    originalText: section.original_text ?? null,
    source,
    relevance: toRelevance(link.relevance),
    linkExplanation: link.explanation ?? null,
    linkCreatedAt: link.created_at ?? null,
  };
}

export interface ResolvedLegalContext {
  references: ResolvedLegalReference[];
  issues: LegalContextIssue[];
}

/**
 * Löst die Verknüpfungskette auf. Reihenfolge der Eingangs-Links bleibt
 * erhalten; die fachliche Sortierung übernimmt der Ranker.
 */
export function resolveLegalContext(data: LegalContextData): ResolvedLegalContext {
  const sectionsById = new Map(data.sections.map((s) => [s.id, s]));
  const sourcesById = new Map(data.sources.map((s) => [s.id, s]));
  const references: ResolvedLegalReference[] = [];
  const issues: LegalContextIssue[] = [];
  const seenSections = new Set<string>();

  for (const link of data.links) {
    const sectionId = sectionIdOfLink(link);
    if (!sectionId) continue;
    const section = sectionsById.get(sectionId);
    if (!section) {
      issues.push({
        type: "missing_section",
        sectionId,
        message:
          "Eine verknüpfte Rechtsgrundlage wurde nicht gefunden. Die Verknüpfung ist veraltet oder der Abschnitt wurde entfernt.",
      });
      continue;
    }
    // Doppelte Verknüpfungen auf denselben Abschnitt nur einmal darstellen.
    if (seenSections.has(section.id)) continue;
    seenSections.add(section.id);

    const sourceRow = section.source_id ? sourcesById.get(section.source_id) : undefined;
    const source = sourceRow ? toSourceInfo(sourceRow) : null;
    if (!source) {
      issues.push({
        type: "missing_source",
        sectionId: section.id,
        message: `Für „${section.section_number ?? section.id}“ ist keine Rechtsquelle hinterlegt.`,
      });
    }
    references.push(toReference(link, section, source));
  }

  return { references, issues };
}
