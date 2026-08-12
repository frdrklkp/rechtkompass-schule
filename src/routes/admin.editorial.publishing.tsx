// Publishing Queue – Fälle mit Status `approved` gebündelt nach Readiness.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublishingQueue } from "@/hooks/editorial/useQuality";
import { ReadinessBadge } from "@/components/editorial/quality/ReadinessBadge";
import { PublishReadinessDialog } from "@/components/editorial/quality/PublishReadinessDialog";
import { WorkflowBadge, PublicationBadge } from "@/components/editorial/badges";
import { Button } from "@/components/ui/button";

type View = "ready" | "warnings" | "blocked" | "recent";

const VIEWS: Array<{ v: View; l: string; hint: string }> = [
  { v: "ready", l: "Bereit", hint: "Fälle im Status Genehmigt ohne Blocker/Warnungen." },
  { v: "warnings", l: "Bereit mit Warnungen", hint: "Redaktionelle Hinweise, aber freigebbar." },
  { v: "blocked", l: "Blockiert", hint: "Genehmigt, aber Blocker verhindern Publikation." },
  { v: "recent", l: "Zuletzt veröffentlicht", hint: "Letzte 20 publizierten Fälle." },
];

export const Route = createFileRoute("/admin/editorial/publishing")({
  head: () => ({
    meta: [
      { title: "Publishing Queue · RechtsKompass Redaktion" },
      {
        name: "description",
        content:
          "Genehmigte Fälle nach Veröffentlichungsstatus sortiert und bereit zur Publikation.",
      },
    ],
  }),
  component: PublishingQueue,
});

function PublishingQueue() {
  const [view, setView] = useState<View>("ready");
  const [publishId, setPublishId] = useState<string | null>(null);
  const q = usePublishingQueue(view);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Publishing Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kontrollierte Veröffentlichung mit deterministischer Blocker-Prüfung.
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {VIEWS.map((v) => (
          <button
            key={v.v}
            onClick={() => setView(v.v)}
            className={
              "rounded-xl border p-3 text-left text-xs transition-colors " +
              (view === v.v
                ? "border-primary/50 bg-primary/5"
                : "border-border bg-card hover:border-primary/30")
            }
            aria-pressed={view === v.v}
          >
            <div className="text-sm font-semibold">{v.l}</div>
            <div className="mt-0.5 text-muted-foreground">{v.hint}</div>
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : q.data && q.data.length > 0 ? (
        <ul className="space-y-2">
          {q.data.map((r) => (
            <li
              key={r.case.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/admin/editorial/faelle/$id"
                    params={{ id: r.case.id }}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {r.case.title}
                  </Link>
                  <WorkflowBadge status={r.case.workflow_status} />
                  <PublicationBadge tier={r.case.publication_tier} />
                  <ReadinessBadge status={r.assessment.readinessStatus} compact />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {r.case.category ?? "—"} · {r.assessment.percentage}% ·{" "}
                  {r.assessment.blockers.length} Blocker ·{" "}
                  {r.assessment.warnings.length} Warnungen
                </div>
              </div>
              <div className="flex items-center gap-2">
                {view !== "recent" && (
                  <Button
                    size="sm"
                    onClick={() => setPublishId(r.case.id)}
                    disabled={r.assessment.readinessStatus === "blocked"}
                  >
                    Veröffentlichen
                  </Button>
                )}
                <Link
                  to="/admin/editorial/faelle/$id"
                  params={{ id: r.case.id }}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
                >
                  Details
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Keine Fälle in dieser Ansicht.
        </p>
      )}

      {publishId && (
        <PublishReadinessDialog
          caseId={publishId}
          open={!!publishId}
          onOpenChange={(v) => !v && setPublishId(null)}
        />
      )}
    </div>
  );
}
