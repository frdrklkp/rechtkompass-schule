/**
 * Quality-Fix-Manager (Wrapper).
 *
 * WICHTIG:
 *   - Diese Datei enthält KEINE eigene Matching-, Persistenz- oder Quality-Logik.
 *   - Alle Fixes werden über die zentrale Fall-Fertigstellungs-Pipeline
 *     (completePracticeCase / completePracticeCases) ausgeführt.
 *   - Einziger separater Pfad: `ai_content` (Feld-Nachbesserung via refineCaseField),
 *     das die Pipeline nicht abdeckt.
 *   - Rückgabeformat bleibt kompatibel zum Qualitätsmanager-UI.
 */

import { refineCaseField } from "@/lib/casePipeline";
import {
  completePracticeCase,
  completePracticeCases,
  type CompletionOptions,
  type CompletionReport,
} from "@/lib/casePipeline.completion";
import {
  deriveQualityTasks,
  loadCaseForEvaluation,
  type EvalResult,
  type QualityTask,
} from "@/lib/qualityEngine";

export type QualityFixOutcome = "succeeded" | "needs_review" | "failed" | "skipped";

export type QualityFixResult = {
  task: QualityTask;
  outcome: QualityFixOutcome;
  message: string;
  errorCode?: string;
};

export type BatchFixProgress = {
  processed: number;
  total: number;
  succeeded: number;
  needsReview: number;
  failed: number;
  currentCaseId?: string;
};

export type BatchFixReport = {
  results: QualityFixResult[];
  reevaluated: Record<string, EvalResult>;
  summary: {
    total: number;
    succeeded: number;
    needsReview: number;
    failed: number;
    skipped: number;
    casesAffected: number;
  };
};

function isIrrelevant53Task(task: QualityTask): boolean {
  return (
    task.code === "LEGAL_53_IRRELEVANT" ||
    task.fixType === "legal_remove_irrelevant_53" ||
    (task.code === "LEGAL_53_REVIEW_REQUIRED" &&
      /keine\s+signale\s+f(?:ü|ue)r\s+fehlverhalten/i.test(task.description))
  );
}

/**
 * Leitet für die im Batch enthaltenen Tasks eines Falls die passenden
 * Pipeline-Optionen ab. Standardmäßig sind alle Buckets aktiv; deaktiviert
 * werden nur Buckets, die für die konkrete Aufgabenmenge irrelevant sind,
 * damit unnötige API-Aufrufe vermieden werden.
 */
function optionsForTasks(tasks: QualityTask[]): CompletionOptions {
  const has = (pred: (t: QualityTask) => boolean) => tasks.some(pred);
  const hasLegal = has(
    (t) =>
      t.fixType === "legal_matching" ||
      t.fixType === "legal_remove_irrelevant_53" ||
      isIrrelevant53Task(t) ||
      t.category === "RECHT",
  );
  const hasKeyword = has((t) => t.fixType === "keyword_matching");
  const hasTemplate = has((t) => t.fixType === "template_matching");
  const hasSimilarity = has((t) => t.fixType === "similarity_matching");
  const hasRemove53 = has(isIrrelevant53Task);
  return {
    source: "quality_manager",
    runLegalMatching: hasLegal,
    runKeywordMatching: hasKeyword,
    runTemplateMatching: hasTemplate,
    runSimilarityCheck: hasSimilarity,
    runQualityEvaluation: true,
    removeClearlyIrrelevantLegalLinks: hasRemove53 || hasLegal,
    preserveManualContent: true,
  };
}

/**
 * Übersetzt einen Pipeline-Bericht in Task-Outcomes.
 * Nutzt ausschließlich das Pipeline-Ergebnis; keine parallelen Prüfungen.
 */
function taskOutcomeFromReport(task: QualityTask, report: CompletionReport): QualityFixResult {
  if (report.status === "aborted") {
    const first = report.errors[0]?.message ?? "Pipeline abgebrochen";
    return { task, outcome: "failed", message: first, errorCode: "PIPELINE_ABORTED" };
  }
  switch (task.fixType) {
    case "legal_matching": {
      const changes = report.legal.assigned.length + report.legal.removed.length;
      if (report.steps.legalMatching.status === "error") {
        return {
          task,
          outcome: "failed",
          message: report.steps.legalMatching.message,
          errorCode: "LEGAL_MATCHING",
        };
      }
      if (changes > 0) {
        return {
          task,
          outcome: "succeeded",
          message: `${report.legal.assigned.length} zugeordnet, ${report.legal.removed.length} entfernt`,
        };
      }
      return { task, outcome: "needs_review", message: "Keine belastbaren Rechtsgrundlagen" };
    }
    case "legal_remove_irrelevant_53": {
      if (report.legal.removed.length > 0) {
        return {
          task,
          outcome: "succeeded",
          message: `§ 53 entfernt (${report.legal.removed.length})`,
        };
      }
      return { task, outcome: "needs_review", message: "Keine irrelevante § 53-Verknüpfung gefunden" };
    }
    case "keyword_matching": {
      if (report.steps.keywordMatching.status === "error") {
        return {
          task,
          outcome: "failed",
          message: report.steps.keywordMatching.message,
          errorCode: "KEYWORD_MATCHING",
        };
      }
      if (report.keywords.assigned > 0) {
        return { task, outcome: "succeeded", message: `${report.keywords.assigned} Schlagwörter zugeordnet` };
      }
      return { task, outcome: "needs_review", message: "Keine belastbaren Schlagwörter" };
    }
    case "template_matching": {
      if (report.steps.templateMatching.status === "error") {
        return {
          task,
          outcome: "failed",
          message: report.steps.templateMatching.message,
          errorCode: "TEMPLATE_MATCHING",
        };
      }
      if (report.templates.assigned > 0) {
        return { task, outcome: "succeeded", message: `${report.templates.assigned} Vorlagen zugeordnet` };
      }
      return { task, outcome: "needs_review", message: "Keine belastbaren Vorlagen" };
    }
    case "similarity_matching": {
      if (report.steps.similarCases.status === "error") {
        return {
          task,
          outcome: "failed",
          message: report.steps.similarCases.message,
          errorCode: "SIMILARITY",
        };
      }
      return { task, outcome: "succeeded", message: "Ähnlichkeitsprüfung ausgeführt" };
    }
    case "manual":
      return {
        task,
        outcome: "skipped",
        message: "Nicht automatisch behebbar – redaktionelle Prüfung erforderlich.",
      };
    case "ai_content":
    default: {
      // Sonderfall §-53-Irrelevanz oder unbekannter Fix-Typ mit Legal-Bezug:
      if (isIrrelevant53Task(task)) {
        if (report.legal.removed.length > 0) {
          return {
            task,
            outcome: "succeeded",
            message: `§ 53 entfernt (${report.legal.removed.length})`,
          };
        }
        return { task, outcome: "needs_review", message: "Kein Löschkandidat identifiziert" };
      }
      return { task, outcome: "needs_review", message: "Pipeline abgeschlossen" };
    }
  }
}

/**
 * Führt eine Menge von Quality Tasks aus – gruppiert pro Fall, EIN
 * Pipeline-Lauf pro Fall. `ai_content`-Tasks laufen separat über refineCaseField.
 */
export async function fixCaseQualityTasks(
  tasks: QualityTask[],
  opts?: { onProgress?: (p: BatchFixProgress) => void },
): Promise<BatchFixReport> {
  const results: QualityFixResult[] = [];
  const reevaluated: Record<string, EvalResult> = {};
  const total = tasks.length;
  let processed = 0;
  let succeeded = 0;
  let needsReview = 0;
  let failed = 0;
  let skipped = 0;

  const byCase = new Map<string, QualityTask[]>();
  for (const t of tasks) {
    const arr = byCase.get(t.caseId) ?? [];
    arr.push(t);
    byCase.set(t.caseId, arr);
  }

  for (const [caseId, caseTasks] of byCase) {
    // 1) AI-Content-Tasks: eigener Pfad (Pipeline deckt Feld-Refinement nicht ab).
    const aiTasks = caseTasks.filter((t) => t.fixType === "ai_content" && t.affectedField);
    for (const task of aiTasks) {
      try {
        const res = await refineCaseField(caseId, task.affectedField!, task.description);
        const outcome: QualityFixOutcome = res.ok ? "succeeded" : "failed";
        results.push({ task, outcome, message: res.message });
        if (outcome === "succeeded") succeeded++;
        else failed++;
      } catch (e) {
        results.push({
          task,
          outcome: "failed",
          message: e instanceof Error ? e.message : String(e),
          errorCode: "AI_CONTENT",
        });
        failed++;
      }
      processed++;
      opts?.onProgress?.({ processed, total, succeeded, needsReview, failed, currentCaseId: caseId });
    }

    // 2) Manual-Tasks: sofort skippen (Pipeline behebt nichts, was nur Redaktion kann).
    const manualTasks = caseTasks.filter((t) => t.fixType === "manual" && !isIrrelevant53Task(t));
    for (const task of manualTasks) {
      results.push({
        task,
        outcome: "skipped",
        message: "Nicht automatisch behebbar – redaktionelle Prüfung erforderlich.",
      });
      skipped++;
      processed++;
      opts?.onProgress?.({ processed, total, succeeded, needsReview, failed, currentCaseId: caseId });
    }

    // 3) Rest → EIN Pipeline-Lauf für den Fall.
    const pipelineTasks = caseTasks.filter(
      (t) =>
        !(t.fixType === "ai_content" && t.affectedField) &&
        !(t.fixType === "manual" && !isIrrelevant53Task(t)),
    );
    if (pipelineTasks.length > 0) {
      opts?.onProgress?.({ processed, total, succeeded, needsReview, failed, currentCaseId: caseId });
      let report: CompletionReport | null = null;
      try {
        report = await completePracticeCase(caseId, optionsForTasks(pipelineTasks));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const task of pipelineTasks) {
          results.push({ task, outcome: "failed", message: msg, errorCode: "PIPELINE" });
          failed++;
          processed++;
          opts?.onProgress?.({ processed, total, succeeded, needsReview, failed, currentCaseId: caseId });
        }
        continue;
      }
      if (report.quality) reevaluated[caseId] = report.quality;
      for (const task of pipelineTasks) {
        const r = taskOutcomeFromReport(task, report);
        results.push(r);
        if (r.outcome === "succeeded") succeeded++;
        else if (r.outcome === "needs_review") needsReview++;
        else if (r.outcome === "failed") failed++;
        else if (r.outcome === "skipped") skipped++;
        processed++;
        opts?.onProgress?.({ processed, total, succeeded, needsReview, failed, currentCaseId: caseId });
      }
    }

    // 4) Sicherstellen, dass ein Reevaluations-Eintrag existiert (falls nur AI/manual lief).
    if (!reevaluated[caseId]) {
      try {
        reevaluated[caseId] = await loadCaseForEvaluation(caseId);
      } catch {
        /* ignore */
      }
    }
  }

  return {
    results,
    reevaluated,
    summary: {
      total,
      succeeded,
      needsReview,
      failed,
      skipped,
      casesAffected: byCase.size,
    },
  };
}

/**
 * Optimiert einen Satz von Fällen. Delegiert an completePracticeCases
 * und leitet daraus Task-Berichte ab.
 */
export async function optimizeUntilStable(
  caseIds: string[],
  opts: {
    maxRounds?: number;
    onRound?: (round: number, report: BatchFixReport) => void;
    onProgress?: (p: BatchFixProgress & { round: number }) => void;
  } = {},
): Promise<{ rounds: BatchFixReport[]; finalEvals: Record<string, EvalResult> }> {
  const maxRounds = opts.maxRounds ?? 3;
  const rounds: BatchFixReport[] = [];
  const finalEvals: Record<string, EvalResult> = {};

  for (let round = 1; round <= maxRounds; round++) {
    // Aktuelle Aufgaben pro Fall bestimmen.
    const evalsThisRound = await Promise.all(
      caseIds.map((id) => loadCaseForEvaluation(id).catch(() => null)),
    );
    const tasks: QualityTask[] = [];
    const activeCaseIds: string[] = [];
    for (const ev of evalsThisRound) {
      if (!ev) continue;
      finalEvals[ev.caseId] = ev;
      const t = deriveQualityTasks(ev).filter((x) => x.fixable);
      if (t.length > 0) {
        tasks.push(...t);
        activeCaseIds.push(ev.caseId);
      }
    }
    if (tasks.length === 0) break;

    // Ein Pipeline-Batch pro Runde.
    const batch = await completePracticeCases(
      activeCaseIds,
      { source: "batch_fix", removeClearlyIrrelevantLegalLinks: true },
      3,
      (done, total, current) =>
        opts.onProgress?.({
          processed: done,
          total,
          succeeded: 0,
          needsReview: 0,
          failed: 0,
          currentCaseId: current,
          round,
        }),
    );

    // Reports pro Fall aggregieren.
    const reportByCase = new Map(batch.reports.map((r) => [r.caseId, r]));
    const results: QualityFixResult[] = [];
    const reevaluated: Record<string, EvalResult> = {};
    let succeeded = 0, needsReview = 0, failed = 0, skipped = 0;
    for (const t of tasks) {
      const report = reportByCase.get(t.caseId);
      if (!report) {
        results.push({ task: t, outcome: "failed", message: "Kein Pipeline-Bericht", errorCode: "PIPELINE" });
        failed++;
        continue;
      }
      if (report.quality) reevaluated[t.caseId] = report.quality;
      const r = taskOutcomeFromReport(t, report);
      results.push(r);
      if (r.outcome === "succeeded") succeeded++;
      else if (r.outcome === "needs_review") needsReview++;
      else if (r.outcome === "failed") failed++;
      else if (r.outcome === "skipped") skipped++;
    }
    const casesAffected = new Set(tasks.map((t) => t.caseId)).size;
    const roundReport: BatchFixReport = {
      results,
      reevaluated,
      summary: {
        total: tasks.length,
        succeeded,
        needsReview,
        failed,
        skipped,
        casesAffected,
      },
    };
    rounds.push(roundReport);
    Object.assign(finalEvals, reevaluated);
    opts.onRound?.(round, roundReport);

    // Wenn kein Fortschritt mehr möglich (nichts „succeeded"), abbrechen.
    if (succeeded === 0) break;
  }

  if (Object.keys(finalEvals).length === 0) {
    for (const id of caseIds) {
      try {
        finalEvals[id] = await loadCaseForEvaluation(id);
      } catch {
        /* ignore */
      }
    }
  }

  return { rounds, finalEvals };
}
