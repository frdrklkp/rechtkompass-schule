// Legal Quality Center – offene/erledigte Legal-Flags & Rechts-Update-Fälle.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLegalQualityOverview } from "@/hooks/editorial/useQuality";
import { WorkflowBadge } from "@/components/editorial/badges";

const searchSchema = z.object({
  view: z.enum(["open", "resolved", "all"]).default("open"),
});

export const Route = createFileRoute("/admin/editorial/legal-quality")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Legal Quality Center · RechtsKompass Redaktion" },
      {
        name: "description",
        content:
          "Offene und erledigte Rechts-Review-Hinweise sowie Fälle mit Rechts-Update-Bedarf.",
      },
    ],
  }),
  component: LegalQualityCenter,
});

function LegalQualityCenter() {
  const q = useLegalQualityOverview();
  const { view } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/editorial/legal-quality" });

  const showOpen = view === "open" || view === "all";
  const showResolved = view === "resolved" || view === "all";

  const openCount = q.data?.openFlags.length ?? 0;
  const resolvedCount = q.data?.resolvedFlags.length ?? 0;

  const setView = (v: "open" | "resolved" | "all") =>
    navigate({ search: { view: v } });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Legal Quality Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rechts-Review-Hinweise und Fälle, die auf ein Rechts-Update warten.
          Bearbeitung erfolgt im jeweiligen Fall.
        </p>
      </header>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Legal-Flag-Filter"
      >
        {(
          [
            { k: "open", l: `Offen (${openCount})` },
            { k: "resolved", l: `Erledigt (${resolvedCount})` },
            { k: "all", l: "Alle" },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            role="tab"
            aria-selected={view === t.k}
            onClick={() => setView(t.k)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              view === t.k
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {showOpen && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
            Offene Rechts-Review-Hinweise
          </h2>
          {q.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : q.data && q.data.openFlags.length > 0 ? (
            <ul className="space-y-2">
              {q.data.openFlags.map((f) => (
                <li
                  key={f.id}
                  className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to="/admin/editorial/faelle/$id"
                      params={{ id: f.case_id }}
                      search={{}}
                      className="text-sm font-medium hover:underline"
                    >
                      Fall öffnen
                    </Link>
                    <span className="text-[11px] text-muted-foreground">
                      seit {new Date(f.raised_at).toLocaleString("de-DE")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.reason ?? "Rechts-Update erforderlich"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Keine offenen Rechts-Review-Hinweise.
            </p>
          )}
        </section>
      )}

      {showResolved && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
            Erledigte Rechts-Review-Hinweise (letzte 50)
          </h2>
          {q.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : q.data && q.data.resolvedFlags.length > 0 ? (
            <ul className="space-y-2">
              {q.data.resolvedFlags.map((f) => (
                <li
                  key={f.id}
                  className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to="/admin/editorial/faelle/$id"
                      params={{ id: f.case_id }}
                      search={{}}
                      className="text-sm font-medium hover:underline"
                    >
                      Fall öffnen
                    </Link>
                    <span className="text-[11px] text-muted-foreground">
                      erledigt{" "}
                      {f.resolved_at
                        ? new Date(f.resolved_at).toLocaleString("de-DE")
                        : "—"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.reason ?? "Rechts-Update erforderlich"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Keine erledigten Rechts-Review-Hinweise.
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Scale className="h-4 w-4 text-blue-600" aria-hidden />
          Fälle mit Rechts-Update-Bedarf
        </h2>
        {q.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : q.data && q.data.legalUpdateCases.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {q.data.legalUpdateCases.map((c) => (
              <li key={c.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to="/admin/editorial/faelle/$id"
                    params={{ id: c.id }}
                    search={{}}
                    className="font-medium hover:underline"
                  >
                    {c.title}
                  </Link>
                  <div className="flex items-center gap-2">
                    <WorkflowBadge status={c.workflow_status} />
                    <span className="text-[11px] text-muted-foreground">
                      {c.category ?? "—"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Kein Fall ist für ein Rechts-Update markiert.
          </p>
        )}
      </section>
    </div>
  );
}
