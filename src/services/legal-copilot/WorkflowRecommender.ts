/**
 * Sprint 4.4 – Workflow Recommender.
 *
 * Deterministische, regelbasierte Empfehlung veröffentlichter Workflows
 * auf Basis der gegroundeten Copilot-Antwort. Keine KI, kein neues Retrieval.
 *
 * Kontrakt:
 *  - Nur veröffentlichte Templates werden bewertet (Filter erfolgt vom Aufrufer).
 *  - Rechtsbezug wird über bereits gegroundete Rechtsgrundlagen hergestellt
 *    (WorkflowSourceRef.citationHint ⇄ RetrievalCitation.law/display).
 *  - Keine Halluzinationen: Begründungen zitieren ausschließlich Daten
 *    aus dem Template und den geerdeten Chunks.
 */
import type {
  WorkflowStep,
  WorkflowTemplate,
} from "@/services/legal-workflows/types";
import type { CopilotAnswer, CopilotFilters, GroundedChunk } from "./types";

export interface CopilotWorkflowRecommendation {
  templateId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  categoryId: string | null;
  publicationTier: "internal" | "public";
  relevance: number; // 0..1
  reason: string;
  estimatedMinutes: number;
  phaseCount: number;
  stepCount: number;
  matchedKeywords: string[];
  matchedRefIds: string[];
}

interface Scored {
  tpl: WorkflowTemplate;
  raw: number;
  matchedKeywords: string[];
  matchedRefIds: string[];
  categoryHit: boolean;
  lawHits: string[];
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/ß/g, "ss");
}

function tokens(s: string): string[] {
  return norm(s)
    .split(/[^a-z0-9äöü§]+/i)
    .filter((t) => t.length >= 4);
}

function stepText(step: WorkflowStep): string {
  return [step.title, step.description ?? "", step.goal ?? ""].join(" ");
}

function templateHaystack(tpl: WorkflowTemplate): string {
  const parts: string[] = [tpl.title, tpl.subtitle ?? "", tpl.description ?? ""];
  for (const p of tpl.phases) {
    parts.push(p.title, p.description ?? "");
    for (const s of p.steps) {
      parts.push(stepText(s));
      for (const src of s.sources) parts.push(src.citationHint ?? "", src.note ?? "");
    }
  }
  return norm(parts.join(" \n "));
}

function totalMinutes(tpl: WorkflowTemplate): number {
  let m = 0;
  for (const p of tpl.phases) for (const s of p.steps) m += s.estimatedMinutes ?? 0;
  return m;
}

function stepCount(tpl: WorkflowTemplate): number {
  return tpl.phases.reduce((n, p) => n + p.steps.length, 0);
}

function matchLawHints(tpl: WorkflowTemplate, groundedLaws: Set<string>): string[] {
  const hits = new Set<string>();
  for (const p of tpl.phases) {
    for (const s of p.steps) {
      for (const src of s.sources) {
        const hint = norm(src.citationHint);
        if (!hint) continue;
        for (const g of groundedLaws) {
          if (!g) continue;
          if (hint.includes(g) || g.includes(hint)) hits.add(hint);
        }
      }
    }
  }
  return [...hits];
}

function matchedGroundedRefs(tpl: WorkflowTemplate, grounded: GroundedChunk[]): string[] {
  const hay = templateHaystack(tpl);
  const refs: string[] = [];
  for (const g of grounded) {
    const law = norm(g.hit.citation.law);
    const disp = norm(g.hit.citation.display);
    if ((law && hay.includes(law)) || (disp && hay.includes(disp))) {
      refs.push(g.refId);
    }
  }
  return refs;
}

function keywordScore(tpl: WorkflowTemplate, queryTerms: string[], answerTerms: string[]): {
  score: number;
  matches: string[];
} {
  const hay = templateHaystack(tpl);
  const matches = new Set<string>();
  let score = 0;
  for (const t of queryTerms) if (hay.includes(t)) { matches.add(t); score += 1.0; }
  for (const t of answerTerms) if (hay.includes(t)) { matches.add(t); score += 0.5; }
  return { score, matches: [...matches].slice(0, 6) };
}

function reasonFor(scored: Scored): string {
  const parts: string[] = [];
  if (scored.matchedRefIds.length > 0) {
    parts.push(
      `Bezieht sich auf die genannten Rechtsgrundlagen (${scored.matchedRefIds.join(", ")}).`,
    );
  }
  if (scored.lawHits.length > 0) {
    parts.push(
      `Verweist auf ${scored.lawHits.slice(0, 3).map((l) => l.toUpperCase()).join(", ")}.`,
    );
  }
  if (scored.matchedKeywords.length > 0) {
    parts.push(`Passende Stichworte: ${scored.matchedKeywords.slice(0, 4).join(", ")}.`);
  }
  if (scored.categoryHit) parts.push("Passt zur ausgewählten Fallkategorie.");
  if (parts.length === 0) parts.push("Inhaltliche Nähe zur beschriebenen Situation.");
  return parts.join(" ");
}

export const WorkflowRecommender = {
  recommend(params: {
    question: string;
    answer: CopilotAnswer | null;
    grounded: GroundedChunk[];
    templates: WorkflowTemplate[];
    filters?: CopilotFilters;
    limit?: number;
  }): CopilotWorkflowRecommendation[] {
    const limit = params.limit ?? 3;
    // Sicherheitsnetz: nur veröffentlichte Templates berücksichtigen.
    const published = params.templates.filter((t) => t.workflowStatus === "published");
    if (published.length === 0) return [];

    const queryTerms = tokens(params.question);
    const answerTerms = params.answer?.answered
      ? [
          ...tokens(params.answer.sections.kurzantwort),
          ...tokens(params.answer.sections.einordnung),
          ...tokens(params.answer.sections.begruendung),
        ]
      : [];
    const groundedLaws = new Set(params.grounded.map((g) => norm(g.hit.citation.law)).filter(Boolean));
    const falltypCategory = norm(params.filters?.falltyp);

    const scored: Scored[] = [];
    for (const tpl of published) {
      const kw = keywordScore(tpl, queryTerms, answerTerms);
      const lawHits = matchLawHints(tpl, groundedLaws);
      const refs = matchedGroundedRefs(tpl, params.grounded);
      const categoryHit =
        !!falltypCategory && !!tpl.categoryId && norm(tpl.categoryId).includes(falltypCategory);

      let raw = kw.score;
      raw += lawHits.length * 2.0;
      raw += refs.length * 1.5;
      if (categoryHit) raw += 1.5;

      if (raw <= 0) continue;

      scored.push({
        tpl,
        raw,
        matchedKeywords: kw.matches,
        matchedRefIds: refs,
        categoryHit,
        lawHits,
      });
    }

    if (scored.length === 0) return [];

    // Deterministisch stabil sortieren
    scored.sort((a, b) => b.raw - a.raw || a.tpl.slug.localeCompare(b.tpl.slug));

    const max = scored[0].raw;
    return scored.slice(0, limit).map((s) => ({
      templateId: s.tpl.id,
      slug: s.tpl.slug,
      title: s.tpl.title,
      subtitle: s.tpl.subtitle ?? null,
      description: s.tpl.description ?? null,
      categoryId: s.tpl.categoryId ?? null,
      publicationTier: s.tpl.publicationTier,
      relevance: Math.max(0, Math.min(1, s.raw / (max || 1))),
      reason: reasonFor(s),
      estimatedMinutes: totalMinutes(s.tpl),
      phaseCount: s.tpl.phases.length,
      stepCount: stepCount(s.tpl),
      matchedKeywords: s.matchedKeywords,
      matchedRefIds: s.matchedRefIds,
    }));
  },

  /** Ziel-URLs für Runtime-Navigation. Runtime bleibt unverändert. */
  openUrl(templateId: string): string {
    return `/workflows/${templateId}`;
  },
  startUrl(templateId: string): string {
    // Der Runtime-Detail-Screen enthält den Start-Button; hier deep-linken.
    return `/workflows/${templateId}?action=start`;
  },
};
