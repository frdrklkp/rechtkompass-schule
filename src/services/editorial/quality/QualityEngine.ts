// Deterministische Quality Engine.
// Wendet ALL_RULES auf einen CaseQualityInput an und liefert ein
// CaseQualityAssessment. Keine KI, keine Randomisierung.

import { ALL_RULES, MAX_SCORE } from "./rules";
import {
  agingLevelFor,
  calcScore,
  gradeFor,
} from "./scoring";
import type {
  CaseQualityAssessment,
  CaseQualityInput,
  PublishReadinessStatus,
  QualityRuleResult,
} from "./types";

function isCoreAssessable(input: CaseQualityInput): boolean {
  // Ohne Titel oder Workflow-Status kann keine sinnvolle Bewertung erfolgen.
  const c = input.case as { title?: string; workflow_status?: string };
  return !!c.title && !!c.workflow_status;
}

export function assessCase(input: CaseQualityInput): CaseQualityAssessment {
  const caseId = (input.case as { id: string }).id;
  const assessable = isCoreAssessable(input);

  const rules: QualityRuleResult[] = ALL_RULES.map((rule) => {
    const res = rule.evaluate(input);
    const scoreImpact = res.passed
      ? (res.scoreImpact ?? rule.maxScore)
      : 0;
    return {
      ruleId: rule.id,
      category: rule.category,
      severity: rule.severity,
      passed: res.passed,
      scoreImpact,
      title: rule.title,
      description: rule.description,
      remediation: rule.remediation,
      relatedField: rule.relatedField ?? null,
      relatedRoute: rule.relatedRoute ? rule.relatedRoute(caseId) : null,
      metadata: res.metadata,
    };
  });

  const passedRules = rules.filter((r) => r.passed);
  const failedRules = rules.filter((r) => !r.passed);
  const blockers = failedRules.filter((r) => r.severity === "blocker");
  const warnings = failedRules.filter((r) => r.severity === "warning");

  const { score, percentage } = calcScore(rules, MAX_SCORE);
  const grade = gradeFor(percentage, assessable);

  const status = (input.case as { workflow_status?: string }).workflow_status;
  const isArchived = status === "archived";

  // publish-readiness ist ein zusätzlicher Blocker-Filter: workflow_status
  // muss approved/published sein, sonst BLOCKED (nicht READY).
  let readinessStatus: PublishReadinessStatus;
  if (!assessable) {
    readinessStatus = "not_assessable";
  } else if (isArchived) {
    readinessStatus = "blocked";
  } else if (blockers.length > 0) {
    readinessStatus = "blocked";
  } else if (status !== "approved" && status !== "published") {
    // fehlender approved-Status: blockiert Publish, ist aber bereits durch
    // WORKFLOW-Blockerregel abgebildet.
    readinessStatus = "blocked";
  } else if (warnings.length > 0) {
    readinessStatus = "ready_with_warnings";
  } else {
    readinessStatus = "ready";
  }

  return {
    caseId,
    score,
    maxScore: MAX_SCORE,
    percentage,
    grade,
    readinessStatus,
    blockers,
    warnings,
    passedRules,
    failedRules,
    rules,
    assessedAt: new Date().toISOString(),
    agingLevel: agingLevelFor(
      (input.case as { updated_at?: string | null }).updated_at,
    ),
  };
}
