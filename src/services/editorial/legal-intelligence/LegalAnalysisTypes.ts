// Sprint 4.0 – Legal Intelligence Types.
// Alle Typen beschreiben ausschließlich KI-*Vorschläge* – keine Speicherung,
// keine Rechtsentscheidungen. Sie werden von der Redaktion bestätigt oder
// abgelehnt. Sie ersetzen KEINE juristische Beratung.

export type LegalConfidence = "low" | "medium" | "high";
export type LegalRelevance = "primary" | "supporting" | "context";
export type LegalRiskSeverity = "info" | "warning" | "attention";

export interface LegalCompletenessGap {
  topic: string;
  affectedField:
    | "recommendation"
    | "legal_explanation"
    | "documentation"
    | "immediate_actions"
    | "responsibilities"
    | "faq"
    | "decision_tree"
    | "other";
  rationale: string;
}
export interface LegalCompletenessReport {
  gaps: LegalCompletenessGap[];
  wellCovered: string[];
  summary: string;
}

export interface LegalSourceSuggestion {
  sectionId: string;         // MUSS aus mitgesendetem Katalog stammen
  name: string;              // Anzeige-Label (Kurzbezeichnung + § …)
  relevance: LegalRelevance;
  confidence: number;        // 0..1
  rationale: string;         // Kurzbegründung, warum vorgeschlagen
}
export interface LegalSourceSuggestionReport {
  suggestions: LegalSourceSuggestion[];
  notes: string;
}

export interface ConsistencyIssue {
  kind: "contradiction" | "missing_link" | "ambiguity" | "terminology";
  fields: string[];          // z. B. ["recommendation", "legal_explanation"]
  description: string;
  suggestion: string;
}
export interface ConsistencyReport {
  issues: ConsistencyIssue[];
  overallAssessment: "consistent" | "review" | "conflicts";
}

export interface DocumentationGap {
  topic:
    | "documentation"
    | "evidence"
    | "information_duty"
    | "notification_duty"
    | "responsibility";
  description: string;
  suggestion: string;
}
export interface DocumentationCheckReport {
  gaps: DocumentationGap[];
  strengths: string[];
}

export interface CaseComparisonEntry {
  caseId: string;
  title: string;
  commonalities: string[];
  differences: string[];
  missingInCurrent: string[];
  divergingRecommendations: string[];
}
export interface CaseComparisonReport {
  entries: CaseComparisonEntry[];
  synthesis: string;
}

export interface CitationExplanation {
  sectionId: string;
  name: string;
  rationale: string;
  disclaimer: string; // stets „keine juristische Beratung"
}

export interface LegalRiskIndicator {
  id: string;
  severity: LegalRiskSeverity;
  title: string;
  description: string;
  recommendation: string;
}
export interface LegalRiskReport {
  indicators: LegalRiskIndicator[];
}

export interface LegalSummary {
  summary: string;
  keyPoints: string[];
}

export type LegalAnalysisPayload =
  | { kind: "completeness"; report: LegalCompletenessReport }
  | { kind: "sources"; report: LegalSourceSuggestionReport }
  | { kind: "consistency"; report: ConsistencyReport }
  | { kind: "documentation"; report: DocumentationCheckReport }
  | { kind: "comparison"; report: CaseComparisonReport }
  | { kind: "citation"; report: CitationExplanation }
  | { kind: "risk"; report: LegalRiskReport }
  | { kind: "summary"; report: LegalSummary };

export interface LegalRecommendation<T extends LegalAnalysisPayload = LegalAnalysisPayload> {
  id: string;
  kind: T["kind"];
  title: string;
  createdAt: string;
  payload: T;
  reason: string;
  confidence: LegalConfidence;
  status: "pending" | "acknowledged" | "rejected";
  promptVersion: string;
  disclaimer: string;
}
