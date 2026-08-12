/**
 * Zentrale Absicherung besonders sensibler Rechtsgrundlagen.
 *
 * Aktuell: § 53 SchulG NRW. Die Prüfung nutzt die bereits vorhandene
 * Kontext-Signal-Analyse aus der Quality Engine (nicht dupliziert).
 *
 * Diese Datei ist die EINZIGE Stelle, an der § 53 vor Persistenz gefiltert
 * werden darf. Alle Auslöser (KI-Fallmaschine, Vernetzen, Quality-Fix,
 * Batch) laufen über die zentrale Pipeline und damit über diese Guards.
 */

import { analyzeSchulG53Context, buildSchulG53ContextText, type CaseEvalInput } from "@/lib/qualityEngine";
import { supabase } from "@/integrations/supabase/client";

export type SectionLike = {
  id: string;
  section_number?: string | null;
  source_short?: string | null;
  source_name?: string | null;
};

const SECTION_53_RE = /^(?:§\s*)?n?53(?:\s|$)/i;

function isSchulG53(section: SectionLike): boolean {
  const num = (section.section_number ?? "").trim().replace(/\s+/g, "");
  const src = `${section.source_short ?? ""} ${section.source_name ?? ""}`;
  return SECTION_53_RE.test(num) && /schulg|schulgesetz/i.test(src);
}

export function isSchulG53Relevant(caseInput: CaseEvalInput): boolean {
  const analysis = analyzeSchulG53Context(buildSchulG53ContextText(caseInput));
  return analysis.hasStrongSignals;
}

/**
 * Entfernt § 53 SchulG NRW aus einer Matching-Liste, wenn der Fallkontext
 * keine belastbaren Signale (Fehlverhalten, Ordnungsmaßnahme, etc.) enthält.
 * Gibt zurück: gefilterte Liste + Liste der entfernten IDs mit Begründung.
 */
export function guardLegalMatches<T extends { id: string }>(
  matches: T[],
  sectionsById: Map<string, SectionLike>,
  caseInput: CaseEvalInput,
): { kept: T[]; removed: Array<{ id: string; reason: string }> } {
  if (isSchulG53Relevant(caseInput)) {
    return { kept: matches, removed: [] };
  }
  const kept: T[] = [];
  const removed: Array<{ id: string; reason: string }> = [];
  for (const m of matches) {
    const sec = sectionsById.get(m.id);
    if (sec && isSchulG53(sec)) {
      removed.push({
        id: m.id,
        reason: "§ 53 SchulG NRW ohne belastbaren Kontext (Fehlverhalten/Ordnungsmaßnahme) verworfen",
      });
      continue;
    }
    kept.push(m);
  }
  return { kept, removed };
}

/**
 * Ermittelt bereits verknüpfte § 53 SchulG NRW-Sektions-IDs für einen Fall,
 * die fachlich nicht (mehr) passen und entfernt werden sollten.
 */
export async function findIrrelevantSchulG53Links(
  caseId: string,
  caseInput: CaseEvalInput,
): Promise<Array<{ linkId: string; sectionId: string }>> {
  if (isSchulG53Relevant(caseInput)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linksRes = await (supabase.from("case_legal_links") as any)
    .select("id, legal_section_id")
    .eq("case_id", caseId);
  const links = (linksRes.data ?? []) as Array<{ id: string; legal_section_id: string }>;
  if (links.length === 0) return [];
  const secIds = links.map((l) => l.legal_section_id).filter(Boolean);
  if (secIds.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secRes = await (supabase.from("legal_sections") as any)
    .select("id, section_number, source_id, legal_sources(short_name, name)")
    .in("id", secIds);
  const sections = (secRes.data ?? []) as Array<{
    id: string;
    section_number: string | null;
    legal_sources?: { short_name?: string | null; name?: string | null } | null;
  }>;
  const flagged = new Set(
    sections
      .filter((s) =>
        isSchulG53({
          id: s.id,
          section_number: s.section_number,
          source_short: s.legal_sources?.short_name ?? null,
          source_name: s.legal_sources?.name ?? null,
        }),
      )
      .map((s) => s.id),
  );
  return links
    .filter((l) => flagged.has(l.legal_section_id))
    .map((l) => ({ linkId: l.id, sectionId: l.legal_section_id }));
}
