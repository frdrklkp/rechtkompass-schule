// Quality-Types – zentrale Definitionen für die deterministische Qualitäts-
// bewertung eines Praxisfalls. Rein regelbasiert, kein KI-Anteil.

import type {
  CaseLegalReviewFlagRow,
  CaseReviewRow,
  EditorialCaseRow,
} from "../types";

export type QualityRuleSeverity = "info" | "warning" | "blocker";

export type QualityRuleCategory =
  | "content"
  | "legal"
  | "review"
  | "workflow"
  | "metadata"
  | "documentation"
  | "publication";

export type PublishReadinessStatus =
  | "ready"
  | "ready_with_warnings"
  | "blocked"
  | "not_assessable";

export type QualityGrade = "A" | "B" | "C" | "D" | "E" | "F" | "ungraded";

export interface CaseQualityInput {
  case: EditorialCaseRow & Record<string, unknown>;
  legalLinkCount: number;
  legalFlags: CaseLegalReviewFlagRow[];
  reviews: CaseReviewRow[];
}

export interface QualityRuleResult {
  ruleId: string;
  category: QualityRuleCategory;
  severity: QualityRuleSeverity;
  passed: boolean;
  scoreImpact: number;
  title: string;
  description: string;
  remediation: string;
  relatedField?: string | null;
  relatedRoute?: string | null;
  metadata?: Record<string, unknown>;
}

export interface QualityRule {
  id: string;
  category: QualityRuleCategory;
  severity: QualityRuleSeverity;
  maxScore: number;
  title: string;
  description: string;
  remediation: string;
  relatedField?: string;
  relatedRoute?: (caseId: string) => string;
  evaluate: (input: CaseQualityInput) => {
    passed: boolean;
    scoreImpact?: number;
    metadata?: Record<string, unknown>;
  };
}

export interface CaseQualityAssessment {
  caseId: string;
  score: number;
  maxScore: number;
  percentage: number;
  grade: QualityGrade;
  readinessStatus: PublishReadinessStatus;
  blockers: QualityRuleResult[];
  warnings: QualityRuleResult[];
  passedRules: QualityRuleResult[];
  failedRules: QualityRuleResult[];
  rules: QualityRuleResult[];
  assessedAt: string;
  agingLevel: "current" | "review_recommended" | "outdated";
}
