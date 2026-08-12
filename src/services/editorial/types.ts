// Types für die Editorial-Serviceschicht (Sprint 3.3).
// Spiegelt die in Sprint 3.1/3.2 eingeführten DB-Enums.

export type WorkflowStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "archived";

export type PublicationTier = "internal" | "beta" | "public" | "premium";

export type ReviewStatus =
  | "pending"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "cancelled";

export type ReviewDecision =
  | "approved"
  | "changes_requested"
  | "rejected"
  | "cancelled";

export type LegacyCaseStatus =
  | "draft"
  | "review"
  | "published"
  | "archived";

export interface EditorialCaseRow {
  id: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  status: LegacyCaseStatus;
  workflow_status: WorkflowStatus;
  publication_tier: PublicationTier | null;
  quality_status?: string | null;
  legal_update_required?: boolean | null;
  created_by?: string | null;
  assigned_reviewer_id?: string | null;
  current_version_id?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  short_description?: string | null;
}

export interface CaseVersionRow {
  id: string;
  case_id: string;
  version_no: number;
  created_at: string;
  created_by: string | null;
  snapshot: Record<string, unknown>;
}

export interface CaseReviewRow {
  id: string;
  case_id: string;
  version_id: string | null;
  requested_by: string | null;
  assigned_to: string | null;
  status: ReviewStatus;
  submit_comment: string | null;
  decision_comment: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
}

export interface CaseEventRow {
  id: string;
  case_id: string;
  event_type: string;
  actor_id: string | null;
  actor_role: string | null;
  version_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface CaseLegalReviewFlagRow {
  id: string;
  case_id: string;
  reason: string | null;
  raised_at: string;
  resolved_at: string | null;
}

export interface DashboardMetrics {
  ownDrafts: number;
  submittedForReview: number;
  myOpenReviews: number;
  approved: number;
  published: number;
  archived: number;
  legalUpdateRequired: number;
  publishedToday: number;
  activityLast7Days: number;
}

export interface CaseFilters {
  workflowStatus?: WorkflowStatus[];
  publicationTier?: PublicationTier[];
  category?: string | null;
  authorId?: string | null;
  reviewerId?: string | null;
  legalUpdateOnly?: boolean;
  search?: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export type SortField =
  | "title"
  | "updated_at"
  | "workflow_status"
  | "quality_status"
  | "author";

export interface Sorting {
  field: SortField;
  direction: "asc" | "desc";
}

export interface CorrelationOptions {
  correlationId?: string;
}
