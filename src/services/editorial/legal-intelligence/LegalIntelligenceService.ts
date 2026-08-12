// Sprint 4.0 – LegalIntelligenceService.
// Fassade um AIEditorialService.suggest für alle legal.*-Tasks. Mappt das
// KI-Ergebnis in typisierte LegalRecommendation-Objekte. KEINE Persistenz,
// KEIN Workflow-Update, KEINE Verknüpfung.

import { AIEditorialService } from "../ai/AIEditorialService";
import { LEGAL_PROMPT_VERSION } from "../ai/PromptTemplates";
import type { AITaskType, AISuggestion } from "../ai/types";
import type { EditorialCaseRow } from "../types";
import type { CaseQualityAssessment } from "../quality/types";
import type {
  LegalRecommendation,
  LegalAnalysisPayload,
  LegalCompletenessReport,
  LegalSourceSuggestionReport,
  ConsistencyReport,
  DocumentationCheckReport,
  CaseComparisonReport,
  CitationExplanation,
  LegalRiskReport,
  LegalSummary,
  LegalConfidence,
} from "./LegalAnalysisTypes";
import type {
  LegalCatalogEntry,
  LegalLinkCtx,
  LegalFlagCtx,
  SimilarCaseCtx,
} from "./LegalContextBuilder";

const DISCLAIMER =
  "Redaktionelle Empfehlung – keine juristische Beratung. Prüfung durch Redaktion erforderlich.";

const LEGAL_TITLES: Record<string, string> = {
  "legal.analyzeCompleteness": "Juristische Vollständigkeit",
  "legal.suggestSources": "Vorschläge für Rechtsgrundlagen",
  "legal.checkConsistency": "Konsistenzprüfung",
  "legal.checkDocumentation": "Dokumentationsprüfung",
  "legal.compareCases": "Vergleich ähnlicher Fälle",
  "legal.explainCitation": "Zitationsbegründung",
  "legal.riskIndicators": "Redaktionelle Risiken",
  "legal.summarize": "Fachliche Zusammenfassung",
};

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch { /* noop */ }
  return `legal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toConfidence(c: unknown): LegalConfidence {
  return c === "low" || c === "high" ? c : "medium";
}

async function runLegal<TPayload extends LegalAnalysisPayload>(
  task: AITaskType,
  caseRow: EditorialCaseRow & Record<string, unknown>,
  quality: CaseQualityAssessment | null | undefined,
  extra: Record<string, unknown>,
  mapValue: (value: unknown) => TPayload,
  signal?: AbortSignal,
): Promise<LegalRecommendation<TPayload>> {
  let suggestion: AISuggestion<unknown>;
  try {
    suggestion = await AIEditorialService.suggest<unknown>({
      task,
      caseRow,
      quality: quality ?? null,
      extra: { ...extra, prompt_version: LEGAL_PROMPT_VERSION },
      signal,
    });
  } catch (err) {
    // KI-Fehler blockieren den Workflow niemals – als „leere" Empfehlung nach oben werfen.
    throw err;
  }
  const payload = mapValue(suggestion.suggestedContent);
  return {
    id: newId(),
    kind: payload.kind as TPayload["kind"],
    title: LEGAL_TITLES[task] ?? suggestion.title,
    createdAt: suggestion.createdAt,
    payload,
    reason: suggestion.reason,
    confidence: toConfidence(suggestion.confidence),
    status: "pending",
    promptVersion: LEGAL_PROMPT_VERSION,
    disclaimer: DISCLAIMER,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asObj(v: unknown): any { return (v && typeof v === "object") ? v : {}; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asArr(v: unknown): any[] { return Array.isArray(v) ? v : []; }

export interface LegalCallOpts {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality?: CaseQualityAssessment | null;
  linkedSections?: LegalLinkCtx[];
  flags?: LegalFlagCtx[];
  catalog?: LegalCatalogEntry[];
  similarCases?: SimilarCaseCtx[];
  signal?: AbortSignal;
}

export const LegalIntelligenceService = {
  async analyzeCompleteness(opts: LegalCallOpts) {
    return runLegal<{ kind: "completeness"; report: LegalCompletenessReport }>(
      "legal.analyzeCompleteness",
      opts.caseRow, opts.quality,
      { linkedSections: opts.linkedSections ?? [], flags: opts.flags ?? [] },
      (v) => {
        const o = asObj(v);
        return {
          kind: "completeness",
          report: {
            gaps: asArr(o.gaps).map((g) => ({
              topic: String(g.topic ?? ""),
              affectedField: (g.affectedField ?? "other") as LegalCompletenessReport["gaps"][number]["affectedField"],
              rationale: String(g.rationale ?? ""),
            })),
            wellCovered: asArr(o.wellCovered).map(String),
            summary: String(o.summary ?? ""),
          },
        };
      },
      opts.signal,
    );
  },

  async suggestSources(opts: LegalCallOpts) {
    return runLegal<{ kind: "sources"; report: LegalSourceSuggestionReport }>(
      "legal.suggestSources",
      opts.caseRow, opts.quality,
      { catalog: opts.catalog ?? [], linkedSections: opts.linkedSections ?? [] },
      (v) => {
        const o = asObj(v);
        const catalog = opts.catalog ?? [];
        const valid = new Set(catalog.map((c) => c.sectionId));
        const suggestions = asArr(o.suggestions)
          .map((s) => ({
            sectionId: String(s.sectionId ?? ""),
            name: String(s.name ?? ""),
            relevance: (s.relevance === "primary" || s.relevance === "supporting" ? s.relevance : "context") as LegalSourceSuggestionReport["suggestions"][number]["relevance"],
            confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)),
            rationale: String(s.rationale ?? ""),
          }))
          .filter((s) => s.sectionId && (valid.size === 0 || valid.has(s.sectionId)));
        return { kind: "sources", report: { suggestions, notes: String(o.notes ?? "") } };
      },
      opts.signal,
    );
  },

  async checkConsistency(opts: LegalCallOpts) {
    return runLegal<{ kind: "consistency"; report: ConsistencyReport }>(
      "legal.checkConsistency",
      opts.caseRow, opts.quality, {},
      (v) => {
        const o = asObj(v);
        return {
          kind: "consistency",
          report: {
            issues: asArr(o.issues).map((i) => ({
              kind: (["contradiction", "missing_link", "ambiguity", "terminology"].includes(i.kind) ? i.kind : "ambiguity") as ConsistencyReport["issues"][number]["kind"],
              fields: asArr(i.fields).map(String),
              description: String(i.description ?? ""),
              suggestion: String(i.suggestion ?? ""),
            })),
            overallAssessment: (["consistent", "review", "conflicts"].includes(o.overallAssessment) ? o.overallAssessment : "review") as ConsistencyReport["overallAssessment"],
          },
        };
      },
      opts.signal,
    );
  },

  async checkDocumentation(opts: LegalCallOpts) {
    return runLegal<{ kind: "documentation"; report: DocumentationCheckReport }>(
      "legal.checkDocumentation",
      opts.caseRow, opts.quality, {},
      (v) => {
        const o = asObj(v);
        return {
          kind: "documentation",
          report: {
            gaps: asArr(o.gaps).map((g) => ({
              topic: (["documentation", "evidence", "information_duty", "notification_duty", "responsibility"].includes(g.topic) ? g.topic : "documentation") as DocumentationCheckReport["gaps"][number]["topic"],
              description: String(g.description ?? ""),
              suggestion: String(g.suggestion ?? ""),
            })),
            strengths: asArr(o.strengths).map(String),
          },
        };
      },
      opts.signal,
    );
  },

  async compareCases(opts: LegalCallOpts) {
    return runLegal<{ kind: "comparison"; report: CaseComparisonReport }>(
      "legal.compareCases",
      opts.caseRow, opts.quality,
      { similarCases: opts.similarCases ?? [] },
      (v) => {
        const o = asObj(v);
        return {
          kind: "comparison",
          report: {
            entries: asArr(o.entries).map((e) => ({
              caseId: String(e.caseId ?? ""),
              title: String(e.title ?? ""),
              commonalities: asArr(e.commonalities).map(String),
              differences: asArr(e.differences).map(String),
              missingInCurrent: asArr(e.missingInCurrent).map(String),
              divergingRecommendations: asArr(e.divergingRecommendations).map(String),
            })),
            synthesis: String(o.synthesis ?? ""),
          },
        };
      },
      opts.signal,
    );
  },

  async explainCitation(opts: LegalCallOpts & { sectionId: string }) {
    return runLegal<{ kind: "citation"; report: CitationExplanation }>(
      "legal.explainCitation",
      opts.caseRow, opts.quality,
      { citationSectionId: opts.sectionId, linkedSections: opts.linkedSections ?? [] },
      (v) => {
        const o = asObj(v);
        return {
          kind: "citation",
          report: {
            sectionId: String(o.sectionId ?? opts.sectionId),
            name: String(o.name ?? ""),
            rationale: String(o.rationale ?? ""),
            disclaimer: DISCLAIMER,
          },
        };
      },
      opts.signal,
    );
  },

  async riskIndicators(opts: LegalCallOpts) {
    return runLegal<{ kind: "risk"; report: LegalRiskReport }>(
      "legal.riskIndicators",
      opts.caseRow, opts.quality, {},
      (v) => {
        const o = asObj(v);
        return {
          kind: "risk",
          report: {
            indicators: asArr(o.indicators).map((i, idx) => ({
              id: String(i.id ?? `risk_${idx + 1}`),
              severity: (["info", "warning", "attention"].includes(i.severity) ? i.severity : "info") as LegalRiskReport["indicators"][number]["severity"],
              title: String(i.title ?? ""),
              description: String(i.description ?? ""),
              recommendation: String(i.recommendation ?? ""),
            })),
          },
        };
      },
      opts.signal,
    );
  },

  async summarize(opts: LegalCallOpts) {
    return runLegal<{ kind: "summary"; report: LegalSummary }>(
      "legal.summarize",
      opts.caseRow, opts.quality, {},
      (v) => {
        const o = asObj(v);
        return {
          kind: "summary",
          report: {
            summary: String(o.summary ?? (typeof v === "string" ? v : "")),
            keyPoints: asArr(o.keyPoints).map(String),
          },
        };
      },
      opts.signal,
    );
  },
};

export type LegalIntelligenceServiceType = typeof LegalIntelligenceService;
