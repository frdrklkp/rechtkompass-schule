// EditorialQualityQueryService – lesende Zugriffe und Aggregate für die
// Qualitätsplattform. Führt die Bewertung deterministisch clientseitig aus.
// Für die Fallliste wird IMMER seitenweise gearbeitet (Pagination).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { mapSupabaseError } from "../errorMapper";
import { EditorialQueryService } from "../EditorialQueryService";
import type {
  CaseFilters,
  CaseLegalReviewFlagRow,
  CaseReviewRow,
  EditorialCaseRow,
  Pagination,
  Sorting,
} from "../types";
import { assessCase } from "./QualityEngine";
import type {
  CaseQualityAssessment,
  PublishReadinessStatus,
} from "./types";

const casesTable = () => (supabase as any).from("practice_cases");
const linksTable = () => (supabase as any).from("case_legal_links");
const reviewsTable = () => (supabase as any).from("case_reviews");
const flagsTable = () => (supabase as any).from("case_legal_review_flags");

async function safeCount(
  builder: () => Promise<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const { count, error } = await builder();
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.warn("[quality] count query fehlgeschlagen", err);
    return 0;
  }
}

async function fetchLinkCountsByCase(caseIds: string[]) {
  if (!caseIds.length) return new Map<string, number>();
  const { data, error } = await linksTable()
    .select("case_id")
    .in("case_id", caseIds);
  if (error) throw mapSupabaseError(error);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ case_id: string }>) {
    map.set(row.case_id, (map.get(row.case_id) ?? 0) + 1);
  }
  return map;
}

async function fetchReviewsByCase(caseIds: string[]) {
  if (!caseIds.length) return new Map<string, CaseReviewRow[]>();
  const { data, error } = await reviewsTable()
    .select("*")
    .in("case_id", caseIds);
  if (error) throw mapSupabaseError(error);
  const map = new Map<string, CaseReviewRow[]>();
  for (const row of (data ?? []) as CaseReviewRow[]) {
    const arr = map.get(row.case_id) ?? [];
    arr.push(row);
    map.set(row.case_id, arr);
  }
  return map;
}

async function fetchFlagsByCase(caseIds: string[]) {
  if (!caseIds.length) return new Map<string, CaseLegalReviewFlagRow[]>();
  const { data, error } = await flagsTable()
    .select("*")
    .in("case_id", caseIds);
  if (error) throw mapSupabaseError(error);
  const map = new Map<string, CaseLegalReviewFlagRow[]>();
  for (const row of (data ?? []) as CaseLegalReviewFlagRow[]) {
    const arr = map.get(row.case_id) ?? [];
    arr.push(row);
    map.set(row.case_id, arr);
  }
  return map;
}

export interface QualityCaseRow {
  case: EditorialCaseRow;
  assessment: CaseQualityAssessment;
}

export interface QualityDashboardMetrics {
  totalAssessed: number;
  avgScore: number;
  avgPercentage: number;
  ready: number;
  readyWithWarnings: number;
  blocked: number;
  notAssessable: number;
  openLegalFlags: number;
  legalUpdateRequired: number;
  missingLegalSource: number;
  missingApprovedReview: number;
}

export interface QualityCaseListInput {
  filters: CaseFilters & {
    readiness?: PublishReadinessStatus[];
    grade?: string[];
    missingLegal?: boolean;
    hasBlockers?: boolean;
    hasWarnings?: boolean;
  };
  pagination: Pagination;
  sorting: Sorting;
}

export const EditorialQualityQueryService = {
  async assessCase(caseId: string): Promise<QualityCaseRow | null> {
    const caseRow = await EditorialQueryService.getCaseById(caseId);
    if (!caseRow) return null;
    const [links, reviews, flags] = await Promise.all([
      fetchLinkCountsByCase([caseId]),
      fetchReviewsByCase([caseId]),
      fetchFlagsByCase([caseId]),
    ]);
    const assessment = assessCase({
      case: caseRow as any,
      legalLinkCount: links.get(caseId) ?? 0,
      reviews: reviews.get(caseId) ?? [],
      legalFlags: flags.get(caseId) ?? [],
    });
    return { case: caseRow, assessment };
  },

  async assessCases(
    input: QualityCaseListInput,
  ): Promise<{ rows: QualityCaseRow[]; total: number }> {
    // Wir bewerten IMMER nur die aktuelle Seite (keine unkontrollierten
    // Volllasten). Client-seitige Filter (Readiness, Grade, Blockers,
    // Warnings, missingLegal) reduzieren nur die Sichtbarkeit; das
    // Gesamt-Total entspricht dem gefilterten Basis-Query.
    const { rows: caseRows, total } = await EditorialQueryService.getCases(
      input.filters,
      input.pagination,
      input.sorting,
    );
    const ids = caseRows.map((c) => c.id);
    const [links, reviews, flags] = await Promise.all([
      fetchLinkCountsByCase(ids),
      fetchReviewsByCase(ids),
      fetchFlagsByCase(ids),
    ]);
    let rows: QualityCaseRow[] = caseRows.map((c) => ({
      case: c,
      assessment: assessCase({
        case: c as any,
        legalLinkCount: links.get(c.id) ?? 0,
        reviews: reviews.get(c.id) ?? [],
        legalFlags: flags.get(c.id) ?? [],
      }),
    }));

    const f = input.filters;
    if (f.readiness && f.readiness.length) {
      rows = rows.filter((r) => f.readiness!.includes(r.assessment.readinessStatus));
    }
    if (f.grade && f.grade.length) {
      rows = rows.filter((r) => f.grade!.includes(r.assessment.grade));
    }
    if (f.hasBlockers) {
      rows = rows.filter((r) => r.assessment.blockers.length > 0);
    }
    if (f.hasWarnings) {
      rows = rows.filter((r) => r.assessment.warnings.length > 0);
    }
    if (f.missingLegal) {
      rows = rows.filter(
        (r) =>
          !!r.assessment.rules.find(
            (rr) => rr.ruleId === "legal.min_one_source" && !rr.passed,
          ),
      );
    }
    return { rows, total };
  },

  async getQualityDashboardMetrics(): Promise<QualityDashboardMetrics> {
    // Wir bewerten die ersten 100 nicht-archivierten Fälle als repräsentative
    // Kohorte (Score-Mittelwerte). Die Zähler unten sind exakte Count-Queries.
    const cohort = await EditorialQueryService.getCases(
      { workflowStatus: ["draft", "in_review", "approved", "published"] },
      { page: 1, pageSize: 100 },
      { field: "updated_at", direction: "desc" },
    );
    const ids = cohort.rows.map((c) => c.id);
    const [links, reviews, flags] = await Promise.all([
      fetchLinkCountsByCase(ids),
      fetchReviewsByCase(ids),
      fetchFlagsByCase(ids),
    ]);
    const assessments = cohort.rows.map((c) =>
      assessCase({
        case: c as any,
        legalLinkCount: links.get(c.id) ?? 0,
        reviews: reviews.get(c.id) ?? [],
        legalFlags: flags.get(c.id) ?? [],
      }),
    );

    const totalAssessed = assessments.length;
    const avgScore =
      totalAssessed === 0
        ? 0
        : Math.round(
            assessments.reduce((s, a) => s + a.score, 0) / totalAssessed,
          );
    const avgPercentage =
      totalAssessed === 0
        ? 0
        : Math.round(
            assessments.reduce((s, a) => s + a.percentage, 0) / totalAssessed,
          );

    const ready = assessments.filter((a) => a.readinessStatus === "ready").length;
    const readyWithWarnings = assessments.filter(
      (a) => a.readinessStatus === "ready_with_warnings",
    ).length;
    const blocked = assessments.filter((a) => a.readinessStatus === "blocked").length;
    const notAssessable = assessments.filter(
      (a) => a.readinessStatus === "not_assessable",
    ).length;

    const countExact = (b: any) => b.select("id", { count: "exact", head: true });
    const [openLegalFlags, legalUpdateRequired] = await Promise.all([
      safeCount(() => flagsTable().select("id", { count: "exact", head: true }).is("resolved_at", null)),
      safeCount(() =>
        countExact(casesTable()).eq("legal_update_required", true),
      ),
    ]);

    const missingLegalSource = assessments.filter((a) =>
      a.rules.some(
        (r) => r.ruleId === "legal.min_one_source" && !r.passed,
      ),
    ).length;
    const missingApprovedReview = assessments.filter((a) =>
      a.rules.some(
        (r) => r.ruleId === "review.approved_exists" && !r.passed,
      ),
    ).length;

    return {
      totalAssessed,
      avgScore,
      avgPercentage,
      ready,
      readyWithWarnings,
      blocked,
      notAssessable,
      openLegalFlags,
      legalUpdateRequired,
      missingLegalSource,
      missingApprovedReview,
    };
  },

  async getPublishingQueue(view: "ready" | "warnings" | "blocked" | "recent") {
    if (view === "recent") {
      const res = await EditorialQueryService.getCases(
        { workflowStatus: ["published"] },
        { page: 1, pageSize: 20 },
        { field: "updated_at", direction: "desc" },
      );
      const ids = res.rows.map((r) => r.id);
      const [links, reviews, flags] = await Promise.all([
        fetchLinkCountsByCase(ids),
        fetchReviewsByCase(ids),
        fetchFlagsByCase(ids),
      ]);
      return res.rows.map((c) => ({
        case: c,
        assessment: assessCase({
          case: c as any,
          legalLinkCount: links.get(c.id) ?? 0,
          reviews: reviews.get(c.id) ?? [],
          legalFlags: flags.get(c.id) ?? [],
        }),
      }));
    }
    const res = await EditorialQueryService.getCases(
      { workflowStatus: ["approved"] },
      { page: 1, pageSize: 50 },
      { field: "updated_at", direction: "desc" },
    );
    const ids = res.rows.map((r) => r.id);
    const [links, reviews, flags] = await Promise.all([
      fetchLinkCountsByCase(ids),
      fetchReviewsByCase(ids),
      fetchFlagsByCase(ids),
    ]);
    const assessed = res.rows.map((c) => ({
      case: c,
      assessment: assessCase({
        case: c as any,
        legalLinkCount: links.get(c.id) ?? 0,
        reviews: reviews.get(c.id) ?? [],
        legalFlags: flags.get(c.id) ?? [],
      }),
    }));
    if (view === "ready") {
      return assessed.filter((r) => r.assessment.readinessStatus === "ready");
    }
    if (view === "warnings") {
      return assessed.filter(
        (r) => r.assessment.readinessStatus === "ready_with_warnings",
      );
    }
    return assessed.filter((r) => r.assessment.readinessStatus === "blocked");
  },

  async getLegalQualityOverview() {
    // Offene und erledigte Legal-Flags + Fälle mit legal_update_required.
    const [openFlagsRes, resolvedFlagsRes, updateReq] = await Promise.all([
      flagsTable()
        .select("*")
        .is("resolved_at", null)
        .order("raised_at", { ascending: false })
        .limit(200),
      flagsTable()
        .select("*")
        .not("resolved_at", "is", null)
        .order("resolved_at", { ascending: false })
        .limit(50),
      casesTable()
        .select("id,title,workflow_status,category,updated_at")
        .eq("legal_update_required", true)
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);
    if (openFlagsRes.error) throw mapSupabaseError(openFlagsRes.error);
    return {
      openFlags: (openFlagsRes.data ?? []) as CaseLegalReviewFlagRow[],
      resolvedFlags: (resolvedFlagsRes.data ?? []) as CaseLegalReviewFlagRow[],
      legalUpdateCases: (updateReq.data ?? []) as EditorialCaseRow[],
    };
  },

  async getReviewAnalytics() {
    // Aggregierte Kennzahlen, keine personenbezogenen Rankings.
    const countExact = (b: any) => b.select("id", { count: "exact", head: true });
    const [pending, approved, changes, rejected, cancelled] = await Promise.all([
      safeCount(() => countExact(reviewsTable()).eq("status", "pending")),
      safeCount(() => countExact(reviewsTable()).eq("status", "approved")),
      safeCount(() => countExact(reviewsTable()).eq("status", "changes_requested")),
      safeCount(() => countExact(reviewsTable()).eq("status", "rejected")),
      safeCount(() => countExact(reviewsTable()).eq("status", "cancelled")),
    ]);
    // Für Ø Bearbeitungsdauer laden wir eine begrenzte Stichprobe.
    const { data: sample } = await reviewsTable()
      .select("created_at,decided_at,status")
      .neq("status", "pending")
      .not("decided_at", "is", null)
      .order("decided_at", { ascending: false })
      .limit(200);
    const durations: number[] = ((sample ?? []) as Array<{
      created_at: string;
      decided_at: string;
    }>).map(
      (r) =>
        (new Date(r.decided_at).getTime() -
          new Date(r.created_at).getTime()) /
        (1000 * 60 * 60),
    );
    const avgHours =
      durations.length < 5
        ? null
        : Math.round(durations.reduce((s, v) => s + v, 0) / durations.length);

    const { data: oldest } = await reviewsTable()
      .select("created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return {
      pending,
      decided: approved + changes + rejected + cancelled,
      approved,
      changesRequested: changes,
      rejected,
      cancelled,
      avgDecisionHours: avgHours,
      oldestPendingAt:
        (oldest as { created_at?: string } | null)?.created_at ?? null,
    };
  },

  async getEditorialHealthInsights(): Promise<
    Array<{
      key: string;
      label: string;
      count: number;
      to: string;
      search?: Record<string, unknown>;
    }>
  > {
    const m = await this.getQualityDashboardMetrics();
    return [
      {
        key: "ready",
        label: `${m.ready} Fälle sind bereit zur Veröffentlichung.`,
        count: m.ready,
        to: "/admin/editorial/publishing",
        search: { view: "ready" },
      },
      {
        key: "missing_legal",
        label: `${m.missingLegalSource} Fälle benötigen noch Rechtsgrundlagen.`,
        count: m.missingLegalSource,
        to: "/admin/editorial/quality",
        search: { missingLegal: 1 },
      },
      {
        key: "blocked",
        label: `${m.blocked} Fälle werden durch offene Prüfungen oder fehlende Inhalte blockiert.`,
        count: m.blocked,
        to: "/admin/editorial/quality",
        search: { readiness: "blocked" },
      },
      {
        key: "legal_flags",
        label: `${m.openLegalFlags} offene Rechts-Review-Hinweise.`,
        count: m.openLegalFlags,
        to: "/admin/editorial/quality/legal",
      },
      {
        key: "legal_update",
        label: `${m.legalUpdateRequired} Fälle sind für ein Rechts-Update markiert.`,
        count: m.legalUpdateRequired,
        to: "/admin/editorial/quality/legal",
      },
    ];
  },
};

export type EditorialQualityQueryServiceType =
  typeof EditorialQualityQueryService;
