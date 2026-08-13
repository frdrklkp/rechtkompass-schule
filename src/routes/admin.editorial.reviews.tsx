/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useEditorialRole } from "@/hooks/editorial/useEditorialRole";
import { useMyReviews } from "@/hooks/editorial/useWorkflowActions";
import { useReviewAnalytics } from "@/hooks/editorial/useQuality";
import { ReviewBadge } from "@/components/editorial/badges";
import { ReviewDecisionDialog } from "@/components/editorial/dialogs";
import type { ReviewDecision } from "@/services/editorial";

const searchSchema = z.object({
  view: z
    .enum(["open", "assigned_to_me", "unassigned", "decided"])
    .default("assigned_to_me"),
});

export const Route = createFileRoute("/admin/editorial/reviews")({
  validateSearch: zodValidator(searchSchema),
  component: ReviewCenter,
});

function ReviewCenter() {
  const role = useEditorialRole();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/editorial/reviews" });
  const q = useMyReviews(search.view, role.userId);
  const analytics = useReviewAnalytics();
  const [decision, setDecision] = useState<{
    reviewId: string;
    caseId: string;
    decision: ReviewDecision;
  } | null>(null);

  const views: { key: typeof search.view; label: string }[] = [
    { key: "open", label: "Offen" },
    { key: "assigned_to_me", label: "Mir zugewiesen" },
    { key: "unassigned", label: "Nicht zugewiesen" },
    { key: "decided", label: "Entschieden" },
  ];

  const a = analytics.data;
  const oldestDays = a?.oldestPendingAt
    ? Math.floor(
        (Date.now() - new Date(a.oldestPendingAt).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Redaktion</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Meine Reviews</h1>
      </header>

      {/* Review-Analytics – aggregierte Kennzahlen, keine personenbezogenen Rankings. */}
      <section
        aria-label="Review-Kennzahlen"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <AnalyticsKpi label="Offene Reviews" value={a?.pending ?? "…"} tone="amber" />
        <AnalyticsKpi
          label="Entschieden (gesamt)"
          value={a?.decided ?? "…"}
          hint={
            a
              ? `${a.approved} genehmigt · ${a.changesRequested} Änderungen · ${a.rejected} abgelehnt`
              : undefined
          }
        />
        <AnalyticsKpi
          label="Ø Bearbeitungsdauer"
          value={a?.avgDecisionHours == null ? "—" : `${a.avgDecisionHours} h`}
          hint="Stichprobe letzte 200 Entscheidungen"
        />
        <AnalyticsKpi
          label="Ältestes offenes Review"
          value={oldestDays == null ? "—" : `${oldestDays} Tage`}
          tone={oldestDays != null && oldestDays > 7 ? "rose" : "default"}
        />
      </section>


      <div className="flex flex-wrap gap-2">
        {views.map((v) => (
          <button
            key={v.key}
            onClick={() => navigate({ search: (p: any) => ({ ...p, view: v.key }) })}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              search.view === v.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {q.isLoading && <Skeleton className="h-32 w-full" />}
      {q.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Fehler beim Laden.
        </div>
      )}
      {q.data && q.data.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Keine Reviews in dieser Ansicht.
        </div>
      )}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {q.data.map((r) => {
            const canAct =
              search.view !== "decided" &&
              r.status === "pending" &&
              (role.isAdmin ||
                (role.canReview &&
                  (r.assigned_to === null || r.assigned_to === role.userId)));
            return (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/admin/editorial/faelle/$id"
                      params={{ id: r.case_id }}
                      className="text-sm font-medium hover:underline"
                    >
                      {r.practice_cases?.title ?? `Fall: ${r.case_id.slice(0, 8)}…`}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <ReviewBadge status={r.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("de-DE")}
                      </span>
                    </div>
                    {r.submit_comment && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <strong>Einreichung:</strong> {r.submit_comment}
                      </p>
                    )}
                    {r.decision_comment && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <strong>Entscheidung:</strong> {r.decision_comment}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      requested_by: {r.requested_by?.slice(0, 8) ?? "—"} · assigned_to:{" "}
                      {r.assigned_to?.slice(0, 8) ?? "nicht zugewiesen"} · v:{" "}
                      {r.version_id?.slice(0, 6) ?? "—"}
                    </p>
                  </div>
                  {canAct && (
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        onClick={() =>
                          setDecision({ reviewId: r.id, caseId: r.case_id, decision: "approved" })
                        }
                      >
                        Genehmigen
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDecision({ reviewId: r.id, caseId: r.case_id, decision: "changes_requested" })
                        }
                      >
                        Änderungen
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setDecision({ reviewId: r.id, caseId: r.case_id, decision: "rejected" })
                        }
                      >
                        Ablehnen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDecision({ reviewId: r.id, caseId: r.case_id, decision: "cancelled" })
                        }
                      >
                        Abbrechen
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {decision && (
        <ReviewDecisionDialog
          reviewId={decision.reviewId}
          caseId={decision.caseId}
          decision={decision.decision}
          open={true}
          onOpenChange={(v) => !v && setDecision(null)}
        />
      )}
    </div>
  );
}

function AnalyticsKpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "amber" | "rose";
}) {
  const cls =
    tone === "amber"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "rose"
        ? "text-rose-700 dark:text-rose-300"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
