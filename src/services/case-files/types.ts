/** Sprint 4.6M – Dauerhafte Fallakte nach Abschluss der Navigator-Bearbeitung. */

export interface CaseFileRecord {
  id: string;
  fileNo: number;
  caseNumber: string;
  title: string;
  category: string | null;
  closedAt: string;
  createdAt: string;
  situationSnapshot: Record<string, unknown> | null;
  assessmentSnapshot: Record<string, unknown> | null;
  actionsSnapshot: Record<string, unknown> | null;
  legalSnapshot: Record<string, unknown> | null;
  documentsSnapshot: Record<string, unknown> | null;
  openPoints: string[];
  practiceCaseId: string | null;
}

export interface CreateCaseFileInput {
  title: string;
  category: string | null;
  situationSnapshot: Record<string, unknown> | null;
  assessmentSnapshot: Record<string, unknown> | null;
  actionsSnapshot: Record<string, unknown> | null;
  legalSnapshot: Record<string, unknown> | null;
  documentsSnapshot: Record<string, unknown> | null;
  openPoints: string[];
  practiceCaseId: string | null;
}
