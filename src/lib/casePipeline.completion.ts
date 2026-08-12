/**
 * ZENTRALE FALL-FERTIGSTELLUNGS-PIPELINE
 * ══════════════════════════════════════
 *
 * Genau EIN Weg, um einen Praxisfall zu vernetzen, zu prüfen und
 * qualitätsseitig zu bewerten. Wird verwendet von:
 *   - KI-Fallmaschine (nach createCase)
 *   - „Fall automatisch vernetzen" (CaseNetworkingDialog)
 *   - Quality Manager / Batch-Fix
 *   - Fallmanager (redaktioneller Re-Check)
 *   - Batch-Verarbeitung (completePracticeCases)
 *
 * WICHTIG:
 *   - Diese Datei enthält KEINE eigene Matching-Logik.
 *   - Diese Datei enthält KEINE eigene Quality Engine.
 *   - Diese Datei enthält KEINE eigene Persistenzlogik.
 *   - Sie orchestriert ausschließlich vorhandene Funktionen.
 */

import { supabase } from "@/integrations/supabase/client";
import { matchCase, type Catalogs, type CaseMatchInput } from "@/lib/caseMatching";
import {
  listCases,
  listCaseKeywords,
  listCaseLegalLinks,
  listKeywords,
  listSections,
  listSources,
  listTemplates,
} from "@/lib/coreBuilder";
import { applyKeywordMatches } from "@/lib/keywordMatching";
import { applyTemplateMatches } from "@/lib/templateMatching";
import {
  buildSchulG53ContextText,
  deriveQualityTasks,
  loadCaseForEvaluation,
  type EvalResult,
  type QualityTask,
  type CaseEvalInput,
} from "@/lib/qualityEngine";
import { isSchulG53Relevant } from "@/lib/legalGuards";
import { findSimilar } from "@/lib/caseSimilarity";

// ──────────────────────────────── Types ────────────────────────────────

export type PipelineStepStatus =
  | "pending"
  | "running"
  | "success"
  | "warning"
  | "error"
  | "skipped";

export type PipelineStep = {
  status: PipelineStepStatus;
  message: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  details?: unknown;
};

export type PipelineSource =
  | "ai_case_machine"
  | "quality_manager"
  | "manual"
  | "batch_fix"
  | "fallmanager";

export type CompletionOptions = {
  runLegalMatching?: boolean;
  runKeywordMatching?: boolean;
  runTemplateMatching?: boolean;
  runSimilarityCheck?: boolean;
  runQualityEvaluation?: boolean;
  preserveManualContent?: boolean;
  removeClearlyIrrelevantLegalLinks?: boolean;
  autoAcceptMinConfidence?: number; // default 70
  source?: PipelineSource;
};

const DEFAULT_OPTIONS: Required<CompletionOptions> = {
  runLegalMatching: true,
  runKeywordMatching: true,
  runTemplateMatching: true,
  runSimilarityCheck: true,
  runQualityEvaluation: true,
  preserveManualContent: true,
  removeClearlyIrrelevantLegalLinks: true,
  autoAcceptMinConfidence: 70,
  source: "manual",
};

export type CompletionReport = {
  caseId: string;
  source: PipelineSource;
  status: "completed" | "completed_with_errors" | "aborted";
  steps: {
    load: PipelineStep;
    validate: PipelineStep;
    legalMatching: PipelineStep;
    knowledgeCards: PipelineStep;
    keywordMatching: PipelineStep;
    templateMatching: PipelineStep;
    similarCases: PipelineStep;
    qualityEvaluation: PipelineStep;
  };
  legal: {
    assigned: string[]; // section IDs added
    removed: string[]; // section IDs removed (irrelevant § 53 etc.)
    kept: string[]; // section IDs unchanged
  };
  legalReport?: import("@/lib/legalMatching.engine").LegalMatchingReport;
  knowledgeCards: {
    linkedLegalSections: number;
    availableCards: number;
    missingCards: number;
    coveragePercent: number;
  };
  keywords: { assigned: number; created: number; skipped: number; failed: number };
  templates: { assigned: number; skipped: number; failed: number };
  similarCases: Array<{ id: string; title: string; score: number }>;
  quality: EvalResult | null;
  qualityTasks: QualityTask[];
  warnings: string[];
  errors: Array<{ step: string; message: string }>;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
};

// ──────────────────────────────── Helpers ────────────────────────────────

function newStep(): PipelineStep {
  return { status: "pending", message: "" };
}

function startStep(step: PipelineStep) {
  step.status = "running";
  step.startedAt = Date.now();
}

function finishStep(
  step: PipelineStep,
  status: Exclude<PipelineStepStatus, "pending" | "running">,
  message: string,
  details?: unknown,
) {
  step.status = status;
  step.message = message;
  step.finishedAt = Date.now();
  step.durationMs = step.finishedAt - (step.startedAt ?? step.finishedAt);
  if (details !== undefined) step.details = details;
}

async function loadCatalogsForCase(caseId: string): Promise<Catalogs> {
  const [sections, sources, keywords, caseKws, caseLegal, cases, templates] = await Promise.all([
    listSections(),
    listSources(),
    listKeywords(),
    listCaseKeywords(caseId),
    listCaseLegalLinks(caseId),
    listCases(),
    listTemplates(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedTplRes = await (supabase as any)
    .from("case_templates")
    .select("template_id")
    .eq("case_id", caseId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedTemplateIds = ((linkedTplRes.data ?? []) as any[]).map((r) => r.template_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srcById = new Map((sources as any[]).map((s) => [s.id, s]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sectionRefs = (sections as any[]).map((s) => {
    const src = srcById.get(s.source_id);
    const isCard = Boolean(
      s.practice_relevance || s.common_mistakes || s.recommendations || s.action_hint,
    );
    return {
      id: s.id,
      source_short: src?.short_name ?? src?.name ?? "",
      section_number: s.section_number ?? "",
      title: s.title ?? "",
      summary: (s.summary ?? "").slice(0, 260),
      is_knowledge_card: isCard,
    };
  });
  return {
    sections: sectionRefs,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keywords: (keywords ?? []).map((k: any) => k.keyword),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    templates: (templates as any[]).map((t) => ({
      id: t.id,
      title: t.title ?? "",
      type: t.template_type ?? "",
      description: "",
    })),
    cases: (cases as unknown as Array<Record<string, unknown>>)
      .filter((c) => c.id !== caseId)
      .map((c) => ({
        id: c.id as string,
        title: (c.title as string) ?? "",
        short_description: ((c.short_description as string) ?? "").slice(0, 400),
        category: (c.category as string) ?? "",
        subcategory: (c.subcategory as string) ?? "",
        keywords: [],
        legal_section_ids: [],
      })),
    already_linked_sections: (caseLegal ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (l: any) => l.legal_section_id,
    ),
    already_linked_keywords: (caseKws ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((k: any) => k?.keywords?.keyword as string | undefined)
      .filter((n): n is string => !!n),
    already_linked_templates: linkedTemplateIds,
  } satisfies Catalogs;
}

async function loadCaseRow(caseId: string): Promise<Record<string, unknown>> {
  const res = await supabase.from("practice_cases").select("*").eq("id", caseId).limit(1);
  if (res.error) throw res.error;
  const row = (res.data ?? [])[0];
  if (!row) throw new Error(`Praxisfall ${caseId} nicht gefunden`);
  return row as Record<string, unknown>;
}

function caseRowToEvalInput(row: Record<string, unknown>): CaseEvalInput {
  return {
    id: (row.id as string) ?? "",
    title: (row.title as string) ?? null,
    category: (row.category as string) ?? null,
    subcategory: (row.subcategory as string) ?? null,
    short_description: (row.short_description as string) ?? null,
    short_answer: (row.short_answer as string) ?? null,
    immediate_actions: (row.immediate_actions as string) ?? null,
    recommendation: (row.recommendation as string) ?? null,
    legal_explanation: (row.legal_explanation as string) ?? null,
    responsibilities: (row.responsibilities as string) ?? null,
    practice_tip: (row.practice_tip as string) ?? null,
    checklist: (row.checklist as string[]) ?? null,
    documentation: (row.documentation as string[]) ?? null,
    common_mistakes: (row.common_mistakes as string[]) ?? null,
    faq: row.faq,
    status: (row.status as string) ?? null,
  };
}

function caseRowToMatchInput(row: Record<string, unknown>, keywords: string[]): CaseMatchInput {
  return {
    case_id: row.id as string,
    title: (row.title as string) ?? "",
    short_description: (row.short_description as string) ?? "",
    category: (row.category as string) ?? "",
    subcategory: (row.subcategory as string) ?? "",
    recommendation: (row.recommendation as string) ?? "",
    immediate_actions: (row.immediate_actions as string) ?? "",
    responsibilities: (row.responsibilities as string) ?? "",
    legal_explanation: (row.legal_explanation as string) ?? "",
    short_answer: (row.short_answer as string) ?? "",
    practice_tip: (row.practice_tip as string) ?? "",
    common_mistakes: (row.common_mistakes as string[]) ?? [],
    checklist: (row.checklist as string[]) ?? [],
    documentation: (row.documentation as string[]) ?? [],
    keywords,
  };
}

// ──────────────────────────────── Main ────────────────────────────────

export async function completePracticeCase(
  caseId: string,
  options: CompletionOptions = {},
): Promise<CompletionReport> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startedAt = Date.now();
  const report: CompletionReport = {
    caseId,
    source: opts.source,
    status: "completed",
    steps: {
      load: newStep(),
      validate: newStep(),
      legalMatching: newStep(),
      knowledgeCards: newStep(),
      keywordMatching: newStep(),
      templateMatching: newStep(),
      similarCases: newStep(),
      qualityEvaluation: newStep(),
    },
    legal: { assigned: [], removed: [], kept: [] },
    knowledgeCards: { linkedLegalSections: 0, availableCards: 0, missingCards: 0, coveragePercent: 0 },
    keywords: { assigned: 0, created: 0, skipped: 0, failed: 0 },
    templates: { assigned: 0, skipped: 0, failed: 0 },
    similarCases: [],
    quality: null,
    qualityTasks: [],
    warnings: [],
    errors: [],
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
  };

  const abort = (step: string, message: string): CompletionReport => {
    report.status = "aborted";
    report.errors.push({ step, message });
    report.finishedAt = Date.now();
    report.durationMs = report.finishedAt - report.startedAt;
    return report;
  };

  // 1) Load
  startStep(report.steps.load);
  let caseRow: Record<string, unknown>;
  let catalogs: Catalogs;
  try {
    caseRow = await loadCaseRow(caseId);
    catalogs = await loadCatalogsForCase(caseId);
    finishStep(report.steps.load, "success", "Praxisfall und Kataloge geladen");
  } catch (e) {
    finishStep(report.steps.load, "error", e instanceof Error ? e.message : String(e));
    return abort("load", report.steps.load.message);
  }

  // 2) Validate
  startStep(report.steps.validate);
  const evalInput0 = caseRowToEvalInput(caseRow);
  const missing: string[] = [];
  if (!evalInput0.title) missing.push("Titel");
  if (!evalInput0.category) missing.push("Kategorie");
  if (!evalInput0.short_description) missing.push("Kurzbeschreibung");
  if (missing.length > 0) {
    finishStep(report.steps.validate, "error", `Pflichtfelder fehlen: ${missing.join(", ")}`);
    return abort("validate", report.steps.validate.message);
  }
  finishStep(report.steps.validate, "success", "Pflichtfelder vorhanden");




  // 3) Legal Matching – vollständig an die zentrale Engine delegiert
  //    (evaluateAndMatchLegalSections: Stufe 1 = Kandidaten, Stufe 2 =
  //    Re-Evaluierung bestehender Links, § 53-Guard, keine Auffüllung).
  if (opts.runLegalMatching) {
    startStep(report.steps.legalMatching);
    try {
      const { evaluateAndMatchLegalSections } = await import("@/lib/legalMatching.engine");
      const legalReport = await evaluateAndMatchLegalSections(caseId, {
        caseInput: evalInput0,
        sections: catalogs.sections.map((s) => ({
          id: s.id,
          source_short: s.source_short,
          section_number: s.section_number,
          title: s.title,
          summary: s.summary,
          is_knowledge_card: s.is_knowledge_card,
        })),
        confirmed_patterns: catalogs.confirmed_patterns,
        reevaluateExistingLinks: opts.removeClearlyIrrelevantLegalLinks,
        enforceSchulG53Guard: true,
      });

      report.legal.assigned = [...legalReport.accepted];
      report.legal.removed = legalReport.removed.map((r) => r.sectionId);
      report.legal.kept = legalReport.unchanged.filter(
        (id) => !report.legal.assigned.includes(id) && !report.legal.removed.includes(id),
      );
      report.legalReport = legalReport;

      for (const w of legalReport.warnings) report.warnings.push(w);
      for (const err of legalReport.errors) {
        report.errors.push({ step: "legalMatching", message: err });
      }

      const changes = report.legal.assigned.length + report.legal.removed.length;
      finishStep(
        report.steps.legalMatching,
        legalReport.errors.length > 0 ? "warning" : "success",
        changes === 0
          ? `Keine Änderungen (${legalReport.quality.acceptedCount} Zuordnungen, Status ${legalReport.quality.legalQualityStatus})`
          : `${report.legal.assigned.length} zugeordnet, ${report.legal.removed.length} entfernt (Status ${legalReport.quality.legalQualityStatus})`,
      );
    } catch (e) {
      finishStep(report.steps.legalMatching, "error", e instanceof Error ? e.message : String(e));
      report.errors.push({ step: "legalMatching", message: report.steps.legalMatching.message });
    }
  } else {
    finishStep(report.steps.legalMatching, "skipped", "Deaktiviert per Options");
  }

  // 4) Knowledge Cards Coverage (aus frischem DB-Stand)
  startStep(report.steps.knowledgeCards);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const freshLinks = await (supabase.from("case_legal_links") as any)
      .select("legal_section_id")
      .eq("case_id", caseId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secIds = ((freshLinks.data ?? []) as any[]).map((r) => r.legal_section_id).filter(Boolean);
    let coverage = { linkedLegalSections: secIds.length, availableCards: 0, missingCards: 0, coveragePercent: 0 };
    if (secIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const secRes = await (supabase.from("legal_sections") as any)
        .select("id, practice_relevance")
        .in("id", secIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cardIds = ((secRes.data ?? []) as any[]).filter(
        (s) => s.practice_relevance,
      );
      coverage = {
        linkedLegalSections: secIds.length,
        availableCards: cardIds.length,
        missingCards: secIds.length - cardIds.length,
        coveragePercent: Math.round((cardIds.length / secIds.length) * 100),
      };
    }
    report.knowledgeCards = coverage;
    finishStep(
      report.steps.knowledgeCards,
      "success",
      `${coverage.availableCards}/${coverage.linkedLegalSections} Rechtsgrundlagen mit Wissenskarte (${coverage.coveragePercent} %)`,
    );
  } catch (e) {
    finishStep(report.steps.knowledgeCards, "warning", e instanceof Error ? e.message : String(e));
    report.warnings.push("Wissenskarten-Abdeckung nicht ermittelbar");
  }

  // 5) Keywords
  if (opts.runKeywordMatching) {
    startStep(report.steps.keywordMatching);
    try {
      const alreadyLinked = new Set(
        (catalogs.already_linked_keywords ?? []).map((k) => k.toLowerCase()),
      );
      const matchInput = caseRowToMatchInput(caseRow, Array.from(alreadyLinked));
      const matchResult = await matchCase(matchInput, catalogs);
      if (matchResult.keywords.status === "ok") {
        const recommended = matchResult.keywords.items.filter(
          (m) => m.confidence >= opts.autoAcceptMinConfidence,
        );
        const applyRes = await applyKeywordMatches(
          caseId,
          recommended.map((m) => ({ keyword: m.keyword })),
          {
            catalog: (await listKeywords()) as Array<{ id: string; keyword: string }>,
            alreadyLinked: Array.from(alreadyLinked),
          },
        );
        report.keywords = {
          assigned: applyRes.assigned,
          created: applyRes.created,
          skipped: applyRes.skipped,
          failed: applyRes.failed,
        };
        if (applyRes.errors.length > 0) {
          for (const err of applyRes.errors) {
            report.errors.push({ step: "keywordMatching", message: `${err.keyword}: ${err.message}` });
          }
        }
        finishStep(
          report.steps.keywordMatching,
          applyRes.failed > 0 ? "warning" : "success",
          applyRes.assigned === 0
            ? "Keine neuen Schlagwörter"
            : `${applyRes.assigned} zugeordnet (${applyRes.created} neu erstellt)`,
        );
      } else {
        finishStep(report.steps.keywordMatching, "warning", matchResult.keywords.error);
        report.warnings.push(`Keyword-Matching-Fehler: ${matchResult.keywords.error}`);
      }
    } catch (e) {
      finishStep(report.steps.keywordMatching, "error", e instanceof Error ? e.message : String(e));
      report.errors.push({ step: "keywordMatching", message: report.steps.keywordMatching.message });
    }
  } else {
    finishStep(report.steps.keywordMatching, "skipped", "Deaktiviert per Options");
  }

  // 6) Templates
  if (opts.runTemplateMatching) {
    startStep(report.steps.templateMatching);
    try {
      const alreadyLinked = new Set(catalogs.already_linked_templates ?? []);
      // Re-run matcher (Reihenfolge egal, matchCase liefert alle Buckets parallel)
      const matchInput = caseRowToMatchInput(caseRow, catalogs.already_linked_keywords ?? []);
      const matchResult = await matchCase(matchInput, catalogs);
      if (matchResult.templates.status === "ok") {
        const recommended = matchResult.templates.items.filter(
          (m) => m.confidence >= opts.autoAcceptMinConfidence,
        );
        const applyRes = await applyTemplateMatches(
          caseId,
          recommended.map((m) => ({
            template_id: m.id,
            relevance: (m.confidence >= 85 ? "high" : m.confidence >= 60 ? "medium" : "low") as
              | "high"
              | "medium"
              | "low",
            explanation: m.reason,
          })),
          { alreadyLinked: Array.from(alreadyLinked) },
        );
        report.templates = {
          assigned: applyRes.assigned,
          skipped: applyRes.skipped,
          failed: applyRes.failed,
        };
        if (applyRes.errors.length > 0) {
          for (const err of applyRes.errors) {
            report.errors.push({
              step: "templateMatching",
              message: `Template ${err.template_id}: ${err.message}`,
            });
          }
        }
        finishStep(
          report.steps.templateMatching,
          applyRes.failed > 0 ? "warning" : "success",
          applyRes.assigned === 0 ? "Keine neuen Vorlagen" : `${applyRes.assigned} zugeordnet`,
        );
      } else {
        finishStep(report.steps.templateMatching, "warning", matchResult.templates.error);
        report.warnings.push(`Template-Matching-Fehler: ${matchResult.templates.error}`);
      }
    } catch (e) {
      finishStep(report.steps.templateMatching, "error", e instanceof Error ? e.message : String(e));
      report.errors.push({ step: "templateMatching", message: report.steps.templateMatching.message });
    }
  } else {
    finishStep(report.steps.templateMatching, "skipped", "Deaktiviert per Options");
  }

  // 7) Similar Cases (lokal, keine Persistenz – kein Schema)
  if (opts.runSimilarityCheck) {
    startStep(report.steps.similarCases);
    try {
      const others = catalogs.cases.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
      }));
      const sims = findSimilar(
        { title: (caseRow.title as string) ?? "", category: (caseRow.category as string) ?? null },
        others,
      );
      report.similarCases = sims.slice(0, 10).map((s) => ({ id: s.id, title: s.title, score: s.score }));
      finishStep(
        report.steps.similarCases,
        "success",
        `${report.similarCases.length} ähnliche Fälle`,
      );
    } catch (e) {
      finishStep(report.steps.similarCases, "warning", e instanceof Error ? e.message : String(e));
    }
  } else {
    finishStep(report.steps.similarCases, "skipped", "Deaktiviert per Options");
  }

  // 8) Quality Evaluation mit FRISCHEN Daten
  if (opts.runQualityEvaluation) {
    startStep(report.steps.qualityEvaluation);
    try {
      const evalRes = await loadCaseForEvaluation(caseId);
      report.quality = evalRes;
      report.qualityTasks = deriveQualityTasks(evalRes);
      finishStep(
        report.steps.qualityEvaluation,
        evalRes.hardBlockers.length > 0 ? "warning" : "success",
        `Score ${evalRes.score}/100, ${evalRes.hardBlockers.length} Hard Blocker, ${report.qualityTasks.length} Aufgaben`,
      );
    } catch (e) {
      finishStep(report.steps.qualityEvaluation, "error", e instanceof Error ? e.message : String(e));
      report.errors.push({ step: "qualityEvaluation", message: report.steps.qualityEvaluation.message });
    }
  } else {
    finishStep(report.steps.qualityEvaluation, "skipped", "Deaktiviert per Options");
  }

  report.finishedAt = Date.now();
  report.durationMs = report.finishedAt - report.startedAt;
  report.status = report.errors.length > 0 ? "completed_with_errors" : "completed";

  if (import.meta.env.DEV) {
    // Kompaktes, PII-armes Log
    console.debug("[pipeline] completePracticeCase", {
      caseId: report.caseId,
      source: report.source,
      status: report.status,
      durationMs: report.durationMs,
      legal: report.legal,
      keywords: report.keywords,
      templates: report.templates,
      quality: report.quality
        ? { score: report.quality.score, blockers: report.quality.hardBlockers.length }
        : null,
      warnings: report.warnings.length,
      errors: report.errors.length,
      schulG53Relevant: isSchulG53Relevant(caseRowToEvalInput(caseRow)),
      contextExcerpt: buildSchulG53ContextText(caseRowToEvalInput(caseRow)).slice(0, 80),
    });
  }

  return report;
}

// ──────────────────────────────── Batch ────────────────────────────────

export type BatchCompletionReport = {
  reports: CompletionReport[];
  summary: {
    total: number;
    completed: number;
    completedWithErrors: number;
    aborted: number;
  };
};

/**
 * Kontrollierte Parallelität. Ruft AUSSCHLIESSLICH completePracticeCase auf.
 */
export async function completePracticeCases(
  caseIds: string[],
  options: CompletionOptions = {},
  concurrency = 3,
  onProgress?: (done: number, total: number, current?: string) => void,
): Promise<BatchCompletionReport> {
  const reports: CompletionReport[] = [];
  let index = 0;
  let done = 0;
  const total = caseIds.length;

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= caseIds.length) return;
      const id = caseIds[i];
      onProgress?.(done, total, id);
      try {
        const r = await completePracticeCase(id, options);
        reports.push(r);
      } catch (e) {
        // sollte durch interne Fehlerbehandlung nie hier landen
        reports.push({
          caseId: id,
          source: options.source ?? "batch_fix",
          status: "aborted",
          steps: {
            load: { status: "error", message: e instanceof Error ? e.message : String(e) },
            validate: { status: "pending", message: "" },
            legalMatching: { status: "pending", message: "" },
            knowledgeCards: { status: "pending", message: "" },
            keywordMatching: { status: "pending", message: "" },
            templateMatching: { status: "pending", message: "" },
            similarCases: { status: "pending", message: "" },
            qualityEvaluation: { status: "pending", message: "" },
          },
          legal: { assigned: [], removed: [], kept: [] },
          knowledgeCards: { linkedLegalSections: 0, availableCards: 0, missingCards: 0, coveragePercent: 0 },
          keywords: { assigned: 0, created: 0, skipped: 0, failed: 0 },
          templates: { assigned: 0, skipped: 0, failed: 0 },
          similarCases: [],
          quality: null,
          qualityTasks: [],
          warnings: [],
          errors: [{ step: "pipeline", message: e instanceof Error ? e.message : String(e) }],
          startedAt: Date.now(),
          finishedAt: Date.now(),
          durationMs: 0,
        });
      }
      done++;
      onProgress?.(done, total, id);
    }
  }

  const n = Math.max(1, Math.min(concurrency, caseIds.length));
  await Promise.all(Array.from({ length: n }, () => worker()));

  return {
    reports,
    summary: {
      total,
      completed: reports.filter((r) => r.status === "completed").length,
      completedWithErrors: reports.filter((r) => r.status === "completed_with_errors").length,
      aborted: reports.filter((r) => r.status === "aborted").length,
    },
  };
}
