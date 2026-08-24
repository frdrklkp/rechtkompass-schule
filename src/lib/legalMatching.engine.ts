/**
 * ZENTRALE LEGAL-MATCHING-ENGINE
 * ══════════════════════════════
 *
 * Einziger fachlicher Einstiegspunkt für die Zuordnung, Prüfung und
 * Entfernung von Rechtsgrundlagen an Praxisfällen. Wird ausschließlich
 * von completePracticeCase (casePipeline.completion) aufgerufen.
 *
 * WICHTIG:
 *  - Keine eigene Quality Engine (verwendet qualityEngine).
 *  - Keine eigene Persistenz (verwendet coreBuilder.createLegalLink/deleteLegalLink).
 *  - Keine eigene § 53-Sonderarchitektur (verwendet legalGuards + AI-Endpoints).
 *  - Zweistufig: (1) Kandidaten ermitteln, (2) Kandidaten UND bestehende Links
 *    einzeln fachlich prüfen.
 *  - Keine künstliche Auffüllung auf drei Rechtsgrundlagen.
 *  - KI darf keine IDs erfinden – Filter gegen Section-Katalog.
 */

import { supabase } from "@/integrations/supabase/contextAwareClient";
import { matchLegalSections, type LegalMatch } from "@/lib/legalMatching";
import { createLegalLink, deleteLegalLink, listCaseLegalLinks } from "@/lib/coreBuilder";
import { guardLegalMatches, isSchulG53Relevant, type SectionLike } from "@/lib/legalGuards";
import type { CaseEvalInput } from "@/lib/qualityEngine";
import { LEGAL_MATCHING_THRESHOLDS, type LegalRelevanceRole } from "@/lib/legalMatching.thresholds";

export type LegalCandidate = {
  id: string;
  section_number?: string;
  source_short?: string;
  title?: string;
  has_knowledge_card?: boolean;
  confidence: number;
  role: LegalRelevanceRole;
  reason: string;
};

export type LegalDecision = LegalCandidate & {
  decision: "accepted" | "rejected_low_confidence" | "rejected_schulg53" | "review_required" | "already_linked";
};

export type LegalReevaluation = {
  id: string;
  role: LegalRelevanceRole;
  confidence: number;
  reason: string;
  action: "kept" | "removed_irrelevant" | "flagged_review";
};

export type LegalQualityStatus = "excellent" | "good" | "needs_review" | "insufficient";

export type LegalMatchingReport = {
  caseId: string;
  analyzedTopics: string[];
  candidates: LegalDecision[];
  accepted: string[]; // legal_section_id
  rejected: LegalDecision[];
  removed: Array<{ sectionId: string; reason: string }>;
  unchanged: string[];
  reevaluated: LegalReevaluation[];
  knowledgeCardCoverage: {
    linked: number;
    withCard: number;
    missing: number;
    percent: number;
  };
  quality: {
    acceptedCount: number;
    primaryCount: number;
    supportingCount: number;
    contextCount: number;
    removedIrrelevantCount: number;
    averageConfidence: number;
    knowledgeCardCoveragePercent: number;
    legalQualityStatus: LegalQualityStatus;
  };
  warnings: string[];
  errors: string[];
};

export type EvaluateAndMatchOptions = {
  /** Vorhandene Analyse eines Praxisfalls (für § 53-Guard und AI-Payload). */
  caseInput: CaseEvalInput;
  /** Sections-Katalog (bereits geladen). */
  sections: Array<{
    id: string;
    source_short?: string;
    section_number?: string;
    title?: string;
    summary?: string;
    is_knowledge_card?: boolean;
  }>;
  /** Bereits gepflegte Bestätigungsmuster (schwaches Signal). */
  confirmed_patterns?: Array<{ category: string; section_id: string; count: number }>;
  /** Wenn gesetzt: bestehende Links werden re-evaluiert und ggf. entfernt. */
  reevaluateExistingLinks?: boolean;
  /** Standard: true. Setzt § 53 ohne belastbaren Kontext auf irrelevant. */
  enforceSchulG53Guard?: boolean;
};

type ExistingLinkRow = { id: string; legal_section_id: string };

const AUTO_ACCEPT = LEGAL_MATCHING_THRESHOLDS.AUTO_ACCEPT_MIN;
const AUTO_REMOVE = LEGAL_MATCHING_THRESHOLDS.AUTO_REMOVE_IRRELEVANT_MIN;

function starsToRole(stars: number, tier?: string): LegalRelevanceRole {
  if (tier === "primary") return "primary";
  if (tier === "supporting") return "supporting";
  if (tier === "contextual") return "context";
  if (stars >= 4) return "primary";
  if (stars >= 3) return "supporting";
  return "context";
}

function legalQualityStatus(
  acceptedCount: number,
  primaryCount: number,
  avgConfidence: number,
  coveragePercent: number,
): LegalQualityStatus {
  if (acceptedCount === 0) return "insufficient";
  if (primaryCount === 0) return "needs_review";
  if (acceptedCount >= 3 && primaryCount >= 1 && avgConfidence >= 85 && coveragePercent >= 66) return "excellent";
  if (acceptedCount >= 2 && primaryCount >= 1 && avgConfidence >= 70) return "good";
  return "needs_review";
}

async function fetchExistingLinks(caseId: string): Promise<ExistingLinkRow[]> {
  const links = await listCaseLegalLinks(caseId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (links ?? []).map((l: any) => ({ id: l.id, legal_section_id: l.legal_section_id }));
}

async function fetchSectionMeta(ids: string[]): Promise<Map<string, { id: string; section_number: string | null; source_short: string | null; title: string | null; summary: string | null; has_card: boolean }>> {
  const map = new Map<string, { id: string; section_number: string | null; source_short: string | null; title: string | null; summary: string | null; has_card: boolean }>();
  if (ids.length === 0) return map;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (supabase.from("legal_sections") as any)
    .select("id, section_number, title, summary, practice_relevance, common_mistakes, recommendation, legal_sources(short_name, name)")
    .in("id", ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (res.data ?? []) as any[]) {
    const has_card = Boolean(r.practice_relevance || r.common_mistakes || r.recommendation);
    // Fund 2026-08-20: siehe casePipeline.completion.ts - `short_name` ist bei
    // ca. 45 Quellen fälschlich pauschal "SchulG NRW" statt der echten
    // Verordnung. `name` vorrangig verwenden, damit KI-Rückprüfungen
    // bestehender Links nicht auf denselben falschen Quellennamen
    // hereinfallen wie die Erstzuordnung.
    map.set(r.id, {
      id: r.id,
      section_number: r.section_number ?? null,
      source_short: r.legal_sources?.name ?? r.legal_sources?.short_name ?? null,
      title: r.title ?? null,
      summary: r.summary ?? null,
      has_card,
    });
  }
  return map;
}

/**
 * ZENTRALE FUNKTION.
 * Führt beide Matching-Stufen aus, persistiert die Änderungen und liefert
 * einen fachlichen Report zurück.
 */
export async function evaluateAndMatchLegalSections(
  caseId: string,
  options: EvaluateAndMatchOptions,
): Promise<LegalMatchingReport> {
  const {
    caseInput,
    sections,
    confirmed_patterns,
    reevaluateExistingLinks = true,
    enforceSchulG53Guard = true,
  } = options;

  const report: LegalMatchingReport = {
    caseId,
    analyzedTopics: [],
    candidates: [],
    accepted: [],
    rejected: [],
    removed: [],
    unchanged: [],
    reevaluated: [],
    knowledgeCardCoverage: { linked: 0, withCard: 0, missing: 0, percent: 0 },
    quality: {
      acceptedCount: 0,
      primaryCount: 0,
      supportingCount: 0,
      contextCount: 0,
      removedIrrelevantCount: 0,
      averageConfidence: 0,
      knowledgeCardCoveragePercent: 0,
      legalQualityStatus: "insufficient",
    },
    warnings: [],
    errors: [],
  };

  // Section-Katalog für Guard und Verdict-Lookup
  const sectionsById = new Map<string, SectionLike>(
    sections.map((s) => [
      s.id,
      {
        id: s.id,
        section_number: s.section_number,
        source_short: s.source_short,
        source_name: s.source_short,
      },
    ]),
  );
  const cardIds = new Set(sections.filter((s) => s.is_knowledge_card).map((s) => s.id));

  // Bestehende Links laden
  const existingLinks = await fetchExistingLinks(caseId);
  const existingSectionIds = new Set(existingLinks.map((l) => l.legal_section_id));

  // ── STUFE 1: Kandidaten ermitteln ─────────────────────────
  let matchResponse: Awaited<ReturnType<typeof matchLegalSections>>;
  try {
    matchResponse = await matchLegalSections({
      title: caseInput.title ?? "",
      short_description: caseInput.short_description ?? "",
      category: caseInput.category ?? "",
      subcategory: caseInput.subcategory ?? "",
      keywords: [],
      sections: sections.map(({ id, source_short, section_number, title, summary }) => ({
        id, source_short, section_number, title, summary,
      })),
      confirmed_patterns,
    });
  } catch (e) {
    report.errors.push(`Kandidatenermittlung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    matchResponse = { matches: [], detected_signals: [], missing_area: null };
  }
  report.analyzedTopics = matchResponse.detected_signals ?? [];

  // § 53-Guard auf Kandidaten
  let rawMatches = matchResponse.matches;
  if (enforceSchulG53Guard) {
    const guarded = guardLegalMatches(rawMatches, sectionsById, caseInput);
    rawMatches = guarded.kept;
    for (const rem of guarded.removed) {
      const sec = sectionsById.get(rem.id);
      report.rejected.push({
        id: rem.id,
        section_number: sec?.section_number ?? undefined,
        source_short: sec?.source_short ?? undefined,
        title: sections.find((s) => s.id === rem.id)?.title,
        has_knowledge_card: cardIds.has(rem.id),
        confidence: 0,
        role: "irrelevant",
        reason: rem.reason,
        decision: "rejected_schulg53",
      });
    }
    if (guarded.removed.length > 0) {
      report.warnings.push(
        `§ 53-Guard: ${guarded.removed.length} Vorschlag/Vorschläge verworfen (kein belastbarer Kontext)`,
      );
    }
  }

  // Kandidaten-Entscheidungen (accept vs review vs reject)
  const decisions: LegalDecision[] = rawMatches.map((m: LegalMatch): LegalDecision => {
    const secMeta = sections.find((s) => s.id === m.id);
    const role = starsToRole(m.relevance_stars, m.relevance_tier);
    const base: LegalCandidate = {
      id: m.id,
      section_number: secMeta?.section_number,
      source_short: secMeta?.source_short,
      title: secMeta?.title,
      has_knowledge_card: cardIds.has(m.id),
      confidence: m.confidence,
      role,
      reason: m.reason,
    };
    if (existingSectionIds.has(m.id)) {
      return { ...base, decision: "already_linked" };
    }
    if (m.confidence >= AUTO_ACCEPT) return { ...base, decision: "accepted" };
    if (m.confidence >= LEGAL_MATCHING_THRESHOLDS.REVIEW_MIN) return { ...base, decision: "review_required" };
    return { ...base, decision: "rejected_low_confidence" };
  });
  report.candidates = decisions;

  // Persistenz: Neue Kandidaten übernehmen
  for (const d of decisions) {
    if (d.decision !== "accepted") {
      if (d.decision === "rejected_low_confidence") report.rejected.push(d);
      continue;
    }
    try {
      const relevance = d.role === "primary" ? "high" : d.role === "supporting" ? "medium" : "low";
      await createLegalLink(caseId, d.id, d.reason, relevance);
      report.accepted.push(d.id);
    } catch (e) {
      report.errors.push(`Link ${d.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── STUFE 2: Bestehende Links einzeln re-evaluieren ────────
  if (reevaluateExistingLinks && existingLinks.length > 0) {
    try {
      const secIds = Array.from(existingSectionIds);
      const meta = await fetchSectionMeta(secIds);
      const payload = {
        title: caseInput.title ?? "",
        short_description: caseInput.short_description ?? "",
        category: caseInput.category ?? "",
        subcategory: caseInput.subcategory ?? "",
        recommendation: caseInput.recommendation ?? "",
        immediate_actions: caseInput.immediate_actions ?? "",
        responsibilities: caseInput.responsibilities ?? "",
        legal_explanation: caseInput.legal_explanation ?? "",
        keywords: [] as string[],
        existing_links: secIds.map((id) => {
          const m = meta.get(id);
          return {
            id,
            source_short: m?.source_short ?? undefined,
            section_number: m?.section_number ?? undefined,
            title: m?.title ?? undefined,
            summary: (m?.summary ?? "").slice(0, 260),
          };
        }),
      };
      const res = await fetch("/api/ai-reevaluate-legal-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        verdicts?: Array<{ id: string; relevance: LegalRelevanceRole; confidence: number; reason: string }>;
      };
      const verdicts = json.verdicts ?? [];
      const verdictById = new Map(verdicts.map((v) => [v.id, v]));

      for (const link of existingLinks) {
        const v = verdictById.get(link.legal_section_id);
        if (!v) {
          // Nicht bewertet → nicht anfassen.
          report.unchanged.push(link.legal_section_id);
          continue;
        }
        if (v.relevance === "irrelevant" && v.confidence >= AUTO_REMOVE) {
          try {
            await deleteLegalLink(link.id);
            report.removed.push({ sectionId: link.legal_section_id, reason: v.reason });
            report.reevaluated.push({
              id: link.legal_section_id,
              role: v.relevance,
              confidence: v.confidence,
              reason: v.reason,
              action: "removed_irrelevant",
            });
          } catch (e) {
            report.errors.push(
              `Löschen Link ${link.legal_section_id}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        } else if (v.relevance === "irrelevant") {
          report.reevaluated.push({
            id: link.legal_section_id,
            role: v.relevance,
            confidence: v.confidence,
            reason: v.reason,
            action: "flagged_review",
          });
          report.warnings.push(
            `Zuordnung ${link.legal_section_id} unklar (Confidence ${Math.round(v.confidence)}%) – redaktionelle Prüfung.`,
          );
          report.unchanged.push(link.legal_section_id);
        } else {
          report.reevaluated.push({
            id: link.legal_section_id,
            role: v.relevance,
            confidence: v.confidence,
            reason: v.reason,
            action: "kept",
          });
          report.unchanged.push(link.legal_section_id);
        }
      }
    } catch (e) {
      report.warnings.push(`Re-Evaluierung bestehender Links fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      // Bei Fehler: bestehende Links unverändert lassen.
      for (const link of existingLinks) {
        if (!report.removed.some((r) => r.sectionId === link.legal_section_id)) {
          report.unchanged.push(link.legal_section_id);
        }
      }
    }
  } else {
    for (const link of existingLinks) report.unchanged.push(link.legal_section_id);
  }

  // Frischer Endstand für Coverage + Qualität
  const finalLinks = await fetchExistingLinks(caseId);
  const finalIds = Array.from(new Set(finalLinks.map((l) => l.legal_section_id)));
  const finalMeta = await fetchSectionMeta(finalIds);
  const withCard = finalIds.filter((id) => finalMeta.get(id)?.has_card).length;
  const linkedCount = finalIds.length;
  const coveragePercent = linkedCount === 0 ? 0 : Math.round((withCard / linkedCount) * 100);
  report.knowledgeCardCoverage = {
    linked: linkedCount,
    withCard,
    missing: linkedCount - withCard,
    percent: coveragePercent,
  };

  // Qualitäts-Metriken (Confidence nur aus Kandidaten mit Rolle)
  const acceptedDecisions = decisions.filter((d) => d.decision === "accepted" || d.decision === "already_linked");
  const primaryCount = acceptedDecisions.filter((d) => d.role === "primary").length;
  const supportingCount = acceptedDecisions.filter((d) => d.role === "supporting").length;
  const contextCount = acceptedDecisions.filter((d) => d.role === "context").length;
  const confidences = acceptedDecisions.map((d) => d.confidence).filter((n) => n > 0);
  const avg = confidences.length === 0 ? 0 : Math.round(confidences.reduce((s, n) => s + n, 0) / confidences.length);

  report.quality = {
    acceptedCount: linkedCount,
    primaryCount,
    supportingCount,
    contextCount,
    removedIrrelevantCount: report.removed.length,
    averageConfidence: avg,
    knowledgeCardCoveragePercent: coveragePercent,
    legalQualityStatus: legalQualityStatus(linkedCount, primaryCount, avg, coveragePercent),
  };

  // Qualität-Hinweise (KEINE künstliche Auffüllung – nur Warnung)
  if (linkedCount === 0) {
    report.warnings.push("Keine belastbare Rechtsgrundlage zugeordnet.");
  } else if (linkedCount === 1) {
    report.warnings.push("Nur eine belastbare Rechtsgrundlage – Quality Task empfohlen (Ziel: mindestens 3).");
  } else if (linkedCount === 2) {
    report.warnings.push("Nur zwei belastbare Rechtsgrundlagen – Quality Task empfohlen (Ziel: mindestens 3).");
  }
  if (primaryCount === 0 && linkedCount > 0) {
    report.warnings.push("Keine 'primary' Rechtsgrundlage – bitte fachlich prüfen.");
  }
  if (linkedCount > 0 && withCard < linkedCount) {
    report.warnings.push(
      `${linkedCount - withCard} Rechtsgrundlage(n) ohne Wissenskarte – Quality Task für fehlende Wissenskarten.`,
    );
  }
  if (!isSchulG53Relevant(caseInput)) {
    // Nur Info-Log
  }

  return report;
}
