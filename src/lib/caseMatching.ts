/**
 * Zentrale KI-Matching-Facade: „Fall automatisch vernetzen".
 * Ruft die bestehenden und neuen KI-Matcher parallel auf und liefert
 * je Sparte ein separates Ergebnis mit eigenem Fehlerstatus.
 * Wird von Core Builder (CaseNetworkingDialog) und KI-Fallmaschine genutzt.
 */

import {
  matchLegalSections,
  type CaseMatchInput as LegalCaseInput,
  type LegalMatch,
} from "@/lib/legalMatching";
import {
  matchKeywords,
  type CaseKeywordMatchInput,
  type KeywordMatch,
} from "@/lib/keywordMatching";

export type Ampel = "gruen" | "gelb" | "orange" | "rot";

export function confidenceAmpel(c: number): Ampel {
  if (c >= 90) return "gruen";
  if (c >= 70) return "gelb";
  if (c >= 50) return "orange";
  return "rot";
}
export function ampelDot(a: Ampel): string {
  return a === "gruen" ? "🟢" : a === "gelb" ? "🟡" : a === "orange" ? "🟠" : "🔴";
}
export function ampelHex(a: Ampel): string {
  return a === "gruen" ? "#16a34a" : a === "gelb" ? "#eab308" : a === "orange" ? "#f97316" : "#ef4444";
}

export type SectionRef = {
  id: string;
  source_short?: string;
  section_number?: string;
  title?: string;
  summary?: string;
  is_knowledge_card?: boolean; // true = enrichter Datensatz (Wissenskarte vorhanden)
};

export type TemplateRef = {
  id: string;
  title: string;
  type?: string;
  description?: string;
};

export type CaseRef = {
  id: string;
  title: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  keywords?: string[];
  legal_section_ids?: string[];
};

export type TemplateMatch = {
  id: string;
  confidence: number;
  reason: string;
  signals: string[];
  already_linked: boolean;
};
export type SimilarCaseMatch = {
  id: string;
  title: string;
  short_description: string;
  similarity: number;
  reason: string;
  common_signals: string[];
  shared_keywords: string[];
  shared_legal_section_ids: string[];
  is_possible_duplicate: boolean;
};

export type SectionMatchEnriched = LegalMatch & {
  has_knowledge_card: boolean;
};

export type CaseMatchInput = {
  case_id?: string;
  title: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  bildungsgang?: string;
  recommendation?: string;
  immediate_actions?: string;
  responsibilities?: string;
  legal_explanation?: string;
  short_answer?: string;
  practice_tip?: string;
  common_mistakes?: string[];
  checklist?: string[];
  documentation?: string[];
  legal_context?: string[];
  templates_hints?: string[];
  keywords?: string[];
  legal_section_ids?: string[];
};

export type Catalogs = {
  sections: SectionRef[];
  keywords: string[];
  templates: TemplateRef[];
  cases: CaseRef[];
  already_linked_sections?: string[];
  already_linked_keywords?: string[];
  already_linked_templates?: string[];
  confirmed_patterns?: Array<{ category: string; section_id: string; count: number }>;
};

export type Bucket<T> =
  | { status: "ok"; items: T[]; missing?: string | null; error?: undefined }
  | { status: "error"; items: []; error: string };

export type CaseMatchResult = {
  legal: Bucket<SectionMatchEnriched>;
  cards: Bucket<SectionMatchEnriched>;
  keywords: Bucket<KeywordMatch>;
  templates: Bucket<TemplateMatch>;
  similar: Bucket<SimilarCaseMatch>;
  debug: {
    case_id?: string;
    counts: { sections: number; keywords: number; templates: number; cases: number };
    detected_signals: string[];
    missing_areas: string[];
  };
};

function err(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function fetchTemplateMatches(
  input: CaseMatchInput,
  catalogs: Catalogs,
): Promise<Bucket<TemplateMatch>> {
  if (catalogs.templates.length === 0) return { status: "ok", items: [], missing: null };
  try {
    const res = await fetch("/api/ai-match-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        short_description: input.short_description,
        category: input.category,
        subcategory: input.subcategory,
        recommendation: input.recommendation,
        immediate_actions: input.immediate_actions,
        responsibilities: input.responsibilities,
        legal_explanation: input.legal_explanation,
        keywords: input.keywords,
        legal_sections: catalogs.sections
          .filter((s) => input.legal_section_ids?.includes(s.id))
          .map((s) => ({
            source_short: s.source_short,
            section_number: s.section_number,
            title: s.title,
          })),
        templates: catalogs.templates,
        already_linked: catalogs.already_linked_templates ?? [],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { matches?: TemplateMatch[]; missing_area?: string | null };
    return { status: "ok", items: json.matches ?? [], missing: json.missing_area ?? null };
  } catch (e) {
    return { status: "error", items: [], error: err(e) };
  }
}

async function fetchSimilarMatches(
  input: CaseMatchInput,
  catalogs: Catalogs,
): Promise<Bucket<SimilarCaseMatch>> {
  if (catalogs.cases.length === 0) return { status: "ok", items: [], missing: null };
  try {
    const res = await fetch("/api/ai-match-similar-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_id: input.case_id,
        title: input.title,
        short_description: input.short_description,
        category: input.category,
        subcategory: input.subcategory,
        recommendation: input.recommendation,
        keywords: input.keywords,
        legal_section_ids: input.legal_section_ids,
        cases: catalogs.cases,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { matches?: SimilarCaseMatch[] };
    return { status: "ok", items: json.matches ?? [] };
  } catch (e) {
    return { status: "error", items: [], error: err(e) };
  }
}

async function fetchLegalMatches(
  input: CaseMatchInput,
  catalogs: Catalogs,
): Promise<{
  legal: Bucket<SectionMatchEnriched>;
  cards: Bucket<SectionMatchEnriched>;
  detected: string[];
  missing?: string | null;
}> {
  if (catalogs.sections.length === 0)
    return {
      legal: { status: "ok", items: [], missing: null },
      cards: { status: "ok", items: [], missing: null },
      detected: [],
      missing: null,
    };
  try {
    const payload: LegalCaseInput = {
      title: input.title,
      short_description: input.short_description,
      category: input.category,
      subcategory: input.subcategory,
      bildungsgang: input.bildungsgang,
      keywords: input.keywords,
      sections: catalogs.sections.map(({ id, source_short, section_number, title, summary }) => ({
        id,
        source_short,
        section_number,
        title,
        summary,
      })),
      confirmed_patterns: catalogs.confirmed_patterns,
    };
    const res = await matchLegalSections(payload);
    const cardIds = new Set(
      catalogs.sections.filter((s) => s.is_knowledge_card).map((s) => s.id),
    );
    const enriched: SectionMatchEnriched[] = res.matches.map((m) => ({
      ...m,
      has_knowledge_card: cardIds.has(m.id),
    }));
    return {
      legal: { status: "ok", items: enriched, missing: res.missing_area },
      cards: {
        status: "ok",
        items: enriched.filter((m) => m.has_knowledge_card),
        missing: res.missing_area,
      },
      detected: res.detected_signals,
      missing: res.missing_area,
    };
  } catch (e) {
    const msg = err(e);
    return {
      legal: { status: "error", items: [], error: msg },
      cards: { status: "error", items: [], error: msg },
      detected: [],
    };
  }
}

async function fetchKeywordMatches(
  input: CaseMatchInput,
  catalogs: Catalogs,
): Promise<Bucket<KeywordMatch>> {
  try {
    const payload: CaseKeywordMatchInput = {
      title: input.title,
      short_description: input.short_description,
      category: input.category,
      subcategory: input.subcategory,
      short_answer: input.short_answer,
      immediate_actions: input.immediate_actions,
      recommendation: input.recommendation,
      legal_explanation: input.legal_explanation,
      responsibilities: input.responsibilities,
      practice_tip: input.practice_tip,
      common_mistakes: input.common_mistakes,
      checklist: input.checklist,
      documentation: input.documentation,
      legal_context: input.legal_context,
      templates: input.templates_hints,
      existing_keywords: catalogs.keywords,
      already_linked: catalogs.already_linked_keywords ?? [],
    };
    const res = await matchKeywords(payload);
    return { status: "ok", items: res.matches };
  } catch (e) {
    return { status: "error", items: [], error: err(e) };
  }
}

/**
 * Zentraler Einstiegspunkt. Führt alle KI-Matcher parallel aus.
 * Einzelne Fehler beeinflussen andere Sparten nicht.
 */
export async function matchCase(
  input: CaseMatchInput,
  catalogs: Catalogs,
): Promise<CaseMatchResult> {
  const [legalRes, kwRes, tplRes, simRes] = await Promise.all([
    fetchLegalMatches(input, catalogs),
    fetchKeywordMatches(input, catalogs),
    fetchTemplateMatches(input, catalogs),
    fetchSimilarMatches(input, catalogs),
  ]);

  const missingAreas: string[] = [];
  if (legalRes.missing) missingAreas.push(`Rechtsgrundlage: ${legalRes.missing}`);
  if (tplRes.status === "ok" && tplRes.missing)
    missingAreas.push(`Vorlage: ${tplRes.missing}`);

  return {
    legal: legalRes.legal,
    cards: legalRes.cards,
    keywords: kwRes,
    templates: tplRes,
    similar: simRes,
    debug: {
      case_id: input.case_id,
      counts: {
        sections: catalogs.sections.length,
        keywords: catalogs.keywords.length,
        templates: catalogs.templates.length,
        cases: catalogs.cases.length,
      },
      detected_signals: legalRes.detected,
      missing_areas: missingAreas,
    },
  };
}
