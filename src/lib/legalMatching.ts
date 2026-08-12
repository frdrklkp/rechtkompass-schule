/**
 * Client-Utility: KI-gestützte Zuordnung von Rechtsgrundlagen zu einem Praxisfall.
 * Kommuniziert mit /api/ai-match-legal-sections und liefert bereinigte Vorschläge.
 */

export type LegalMatch = {
  id: string;
  confidence: number; // 0..100
  relevance_stars: 1 | 2 | 3 | 4 | 5;
  relevance_tier: "primary" | "supporting" | "contextual";
  signals: string[];
  reason: string;
};

export type MatchResponse = {
  matches: LegalMatch[];
  detected_signals: string[];
  missing_area?: string | null;
  flags?: {
    rejected_default_53?: boolean;
    schulg53_relevant?: boolean;
    target_min_sources?: number;
    coverage_gap?: boolean;
  };
};

export type CaseMatchInput = {
  title: string;
  short_description?: string;
  category?: string;
  subcategory?: string;
  bildungsgang?: string;
  keywords?: string[];
  sections: Array<{
    id: string;
    source_short?: string;
    section_number?: string;
    title?: string;
    summary?: string;
  }>;
  confirmed_patterns?: Array<{ category: string; section_id: string; count: number }>;
};

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

export function starsToRelevance(s: number): "high" | "medium" | "low" {
  if (s >= 5) return "high";
  if (s >= 3) return "medium";
  return "low";
}

export function buildExplanation(m: LegalMatch): string {
  const parts = [
    `Konfidenz: ${Math.round(m.confidence)} %`,
    m.signals.length ? `Signale: ${m.signals.slice(0, 8).join(", ")}` : "",
    m.reason ? `Begründung: ${m.reason.trim()}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export async function matchLegalSections(input: CaseMatchInput): Promise<MatchResponse> {
  const res = await fetch("/api/ai-match-legal-sections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`KI-Zuordnung fehlgeschlagen (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as MatchResponse;
  const validIds = new Set(input.sections.map((s) => s.id));
  const matches = (json.matches ?? [])
    .filter((m) => validIds.has(m.id))
    .map((m) => ({
      ...m,
      confidence: Math.max(0, Math.min(100, Number(m.confidence) || 0)),
      relevance_stars: Math.max(1, Math.min(5, Number(m.relevance_stars) || 1)) as LegalMatch["relevance_stars"],
      relevance_tier:
        m.relevance_tier === "primary" || m.relevance_tier === "supporting" || m.relevance_tier === "contextual"
          ? m.relevance_tier
          : ((Number(m.relevance_stars) >= 4 ? "primary" : Number(m.relevance_stars) >= 3 ? "supporting" : "contextual") as LegalMatch["relevance_tier"]),
      signals: Array.isArray(m.signals) ? m.signals.filter((x) => typeof x === "string") : [],
      reason: typeof m.reason === "string" ? m.reason : "",
    }))
    .sort((a, b) => b.confidence - a.confidence);
  return {
    matches,
    detected_signals: Array.isArray(json.detected_signals) ? json.detected_signals : [],
    missing_area: json.missing_area ?? null,
    flags: json.flags,
  };
}
