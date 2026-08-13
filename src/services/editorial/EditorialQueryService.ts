// EditorialQueryService – lesende Zugriffe für den Redaktionsbereich.
// Nur dieser Service greift auf die editorialen Tabellen zu; UI-Komponenten
// nutzen Hooks, die intern diesen Service verwenden.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { mapSupabaseError } from "./errorMapper";
import type {
  CaseEventRow,
  CaseFilters,
  CaseLegalReviewFlagRow,
  CaseReviewRow,
  CaseVersionRow,
  DashboardMetrics,
  EditorialCaseRow,
  Pagination,
  Sorting,
} from "./types";

const casesTable = () => (supabase as any).from("practice_cases");
const versionsTable = () => (supabase as any).from("case_versions");
const reviewsTable = () => (supabase as any).from("case_reviews");
const eventsTable = () => (supabase as any).from("case_events");
const legalFlagsTable = () => (supabase as any).from("case_legal_review_flags");

async function safeCount(
  q: () => Promise<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const { count, error } = await q();
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    // Fehlende Berechtigung oder leeres Ergebnis: behutsam mit 0 antworten;
    // technische Fehler werden trotzdem in der Konsole sichtbar.
    console.warn("[editorial] count query fehlgeschlagen", err);
    return 0;
  }
}

export const EditorialQueryService = {
  async getCurrentUserEditorialContext() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw mapSupabaseError(error);
    const user = data.user;
    if (!user) return { userId: null, role: null as string | null };
    try {
      const { data: profile } = await (supabase as any)
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      return { userId: user.id, role: (profile?.role as string) ?? null };
    } catch {
      return { userId: user.id, role: null };
    }
  },

  async getDashboardMetrics(userId: string | null): Promise<DashboardMetrics> {
    const todayIso = new Date();
    todayIso.setHours(0, 0, 0, 0);
    const iso7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const todayIsoStr = todayIso.toISOString();

    const countExact = (b: any) => b.select("id", { count: "exact", head: true });

    const [
      ownDrafts,
      submittedForReview,
      myOpenReviews,
      approved,
      published,
      archived,
      legalUpdateRequired,
      publishedToday,
      activityLast7Days,
    ] = await Promise.all([
      safeCount(async () => {
        // Direktes .from() (statt (supabase as any).from("practice_cases")) grenzt die vorherige user_profiles-Chain sauber ab.
        let q = countExact((supabase as any).from("practice_cases")).eq("workflow_status", "draft");
        if (userId) q = q.eq("created_by", userId);
        return q;
      }),
      safeCount(() => countExact((supabase as any).from("practice_cases")).eq("workflow_status", "in_review")),
      safeCount(async () => {
        let q = countExact((supabase as any).from("case_reviews")).eq("status", "pending");
        if (userId) q = q.eq("assigned_to", userId);
        return q;
      }),
      safeCount(() => countExact((supabase as any).from("practice_cases")).eq("workflow_status", "approved")),
      safeCount(() => countExact((supabase as any).from("practice_cases")).eq("workflow_status", "published")),
      safeCount(() => countExact((supabase as any).from("practice_cases")).eq("workflow_status", "archived")),
      safeCount(() => countExact((supabase as any).from("practice_cases")).eq("legal_update_required", true)),
      safeCount(() =>
        countExact((supabase as any).from("practice_cases"))
          .eq("workflow_status", "published")
          .gte("published_at", todayIsoStr),
      ),
      safeCount(() => countExact((supabase as any).from("case_events")).gte("created_at", iso7)),
    ]);

    return {
      ownDrafts,
      submittedForReview,
      myOpenReviews,
      approved,
      published,
      archived,
      legalUpdateRequired,
      publishedToday,
      activityLast7Days,
    };
  },

  async getCases(
    filters: CaseFilters,
    pagination: Pagination,
    sorting: Sorting,
  ): Promise<{ rows: EditorialCaseRow[]; total: number }> {
    const from = (pagination.page - 1) * pagination.pageSize;
    const to = from + pagination.pageSize - 1;
    let q = (supabase as any).from("practice_cases").select("*", { count: "exact" });

    if (filters.workflowStatus && filters.workflowStatus.length) {
      q = q.in("workflow_status", filters.workflowStatus);
    }
    if (filters.publicationTier && filters.publicationTier.length) {
      q = q.in("publication_tier", filters.publicationTier);
    }
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.authorId) q = q.eq("created_by", filters.authorId);
    // TODO: reviewerId-Filter läuft über case_reviews.assigned_to (Subquery); Spalte existiert nicht auf practice_cases.
    if (filters.reviewerId) { void filters.reviewerId; }
    if (filters.legalUpdateOnly) q = q.eq("legal_update_required", true);
    if (filters.search && filters.search.trim()) {
      q = q.ilike("title", `%${filters.search.trim()}%`);
    }

    const dir = sorting.direction === "asc";
    const sortCol =
      sorting.field === "author"
        ? "created_by"
        : sorting.field === "quality_status"
          ? "quality_status"
          : sorting.field;
    q = q.order(sortCol, { ascending: dir }).range(from, to);

    const { data, error, count } = await q;
    if (error) throw mapSupabaseError(error);
    return {
      rows: (data as EditorialCaseRow[]) ?? [],
      total: count ?? 0,
    };
  },

  async getCaseById(caseId: string): Promise<EditorialCaseRow | null> {
    const { data, error } = await (supabase as any).from("practice_cases")
      .select("*")
      .eq("id", caseId)
      .maybeSingle();
    if (error) throw mapSupabaseError(error);
    return (data as EditorialCaseRow) ?? null;
  },

  async getCaseVersions(caseId: string): Promise<CaseVersionRow[]> {
    const { data, error } = await (supabase as any).from("case_versions")
      .select("*")
      .eq("case_id", caseId)
      .order("version_no", { ascending: false });
    if (error) throw mapSupabaseError(error);
    return (data as CaseVersionRow[]) ?? [];
  },

  async getCaseReviews(caseId: string): Promise<CaseReviewRow[]> {
    const { data, error } = await (supabase as any).from("case_reviews")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    if (error) throw mapSupabaseError(error);
    return (data as CaseReviewRow[]) ?? [];
  },

  async getCaseEvents(caseId: string): Promise<CaseEventRow[]> {
    const { data, error } = await (supabase as any).from("case_events")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    if (error) throw mapSupabaseError(error);
    return (data as CaseEventRow[]) ?? [];
  },

  async getLegalReviewFlags(
    caseId: string,
  ): Promise<CaseLegalReviewFlagRow[]> {
    const { data, error } = await (supabase as any).from("case_legal_review_flags")
      .select("*")
      .eq("case_id", caseId)
      .order("raised_at", { ascending: false });
    if (error) throw mapSupabaseError(error);
    return (data as CaseLegalReviewFlagRow[]) ?? [];
  },

  async getMyReviews(filters: {
    view: "open" | "assigned_to_me" | "unassigned" | "decided";
    userId: string | null;
  }): Promise<CaseReviewRow[]> {
    // Falltitel per Join mitladen statt nur case_id - die Liste zeigte
    // bisher nur die gekürzte UUID an (Fund 2026-08-13, Nutzerrückmeldung).
    let q = (supabase as any)
      .from("case_reviews")
      .select("*, practice_cases(title)")
      .order("created_at", { ascending: false });
    switch (filters.view) {
      case "open":
        q = q.eq("status", "pending");
        break;
      case "assigned_to_me":
        q = q.eq("status", "pending");
        if (filters.userId) q = q.eq("assigned_to", filters.userId);
        break;
      case "unassigned":
        q = q.eq("status", "pending").is("assigned_to", null);
        break;
      case "decided":
        q = q.neq("status", "pending");
        break;
    }
    const { data, error } = await q;
    if (error) throw mapSupabaseError(error);
    return (data as CaseReviewRow[]) ?? [];
  },
};

export type EditorialQueryServiceType = typeof EditorialQueryService;
