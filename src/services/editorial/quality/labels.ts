// Deutsche Klartext-Labels für Kategorien, Severities, Grades und Readiness.

import type {
  PublishReadinessStatus,
  QualityGrade,
  QualityRuleCategory,
  QualityRuleSeverity,
} from "./types";

export const CATEGORY_LABEL: Record<QualityRuleCategory, string> = {
  content: "Inhalt",
  legal: "Rechtsgrundlagen",
  review: "Review",
  workflow: "Workflow",
  metadata: "Metadaten",
  documentation: "Dokumentation",
  publication: "Veröffentlichung",
};

export const SEVERITY_LABEL: Record<QualityRuleSeverity, string> = {
  info: "Hinweis",
  warning: "Warnung",
  blocker: "Blocker",
};

export const READINESS_LABEL: Record<PublishReadinessStatus, string> = {
  ready: "Bereit zur Veröffentlichung",
  ready_with_warnings: "Bereit – mit redaktionellen Hinweisen",
  blocked: "Veröffentlichung blockiert",
  not_assessable: "Nicht bewertbar",
};

export const GRADE_LABEL: Record<QualityGrade, string> = {
  A: "A – Sehr gut",
  B: "B – Gut",
  C: "C – Befriedigend",
  D: "D – Ausreichend",
  E: "E – Mangelhaft",
  F: "F – Ungenügend",
  ungraded: "Nicht bewertet",
};

export const AGING_LABEL = {
  current: "Aktuell",
  review_recommended: "Prüfung empfohlen",
  outdated: "Redaktionelle Prüfung überfällig",
} as const;
