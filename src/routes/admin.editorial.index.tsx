import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileEdit,
  FileText,
  Gavel,
  Send,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { useEditorialRole } from "@/hooks/editorial/useEditorialRole";
import {
  useDashboardMetrics,
} from "@/hooks/editorial/useWorkflowActions";
import { useEditorialHealthInsights } from "@/hooks/editorial/useQuality";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/editorial/")({
  component: EditorialDashboard,
});

interface CardDef {
  label: string;
  key: keyof import("@/services/editorial").DashboardMetrics;
  to: string;
  search?: Record<string, unknown>;
  icon: typeof FileEdit;
}

const CARDS: CardDef[] = [
  { label: "Eigene Entwürfe", key: "ownDrafts", to: "/admin/editorial/faelle", search: { status: "draft", mine: 1 }, icon: FileEdit },
  { label: "Zur Prüfung eingereicht", key: "submittedForReview", to: "/admin/editorial/faelle", search: { status: "in_review" }, icon: Send },
  { label: "Meine offenen Reviews", key: "myOpenReviews", to: "/admin/editorial/reviews", search: { view: "assigned_to_me" }, icon: Gavel },
  { label: "Genehmigte Fälle", key: "approved", to: "/admin/editorial/faelle", search: { status: "approved" }, icon: CheckCircle2 },
  { label: "Veröffentlichte Fälle", key: "published", to: "/admin/editorial/faelle", search: { status: "published" }, icon: Upload },
  { label: "Archivierte Fälle", key: "archived", to: "/admin/editorial/faelle", search: { status: "archived" }, icon: Archive },
  { label: "Fälle mit Rechts-Update", key: "legalUpdateRequired", to: "/admin/editorial/faelle", search: { legalUpdate: 1 }, icon: ShieldAlert },
  { label: "Veröffentlichungen heute", key: "publishedToday", to: "/admin/editorial/faelle", search: { status: "published" }, icon: CalendarClock },
  { label: "Aktivität (7 Tage)", key: "activityLast7Days", to: "/admin/editorial/faelle", icon: Clock },
];

function EditorialDashboard() {
  const role = useEditorialRole();
  const metrics = useDashboardMetrics(role.userId);
  const health = useEditorialHealthInsights();

  if (!role.ready) return null;
  if (!role.canSeeEditorial) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Der Redaktionsbereich ist für Ihre Rolle nicht freigegeben.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Redaktion
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Editorial Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Überblick über den redaktionellen Workflow.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.label}
              to={c.to as "/admin/editorial/faelle"}
              search={c.search as never}
              className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-semibold">
                {metrics.isLoading ? (
                  <Skeleton className="h-8 w-14" />
                ) : metrics.isError ? (
                  <span className="text-sm text-destructive">Fehler</span>
                ) : (
                  metrics.data?.[c.key] ?? 0
                )}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{c.label}</div>
            </Link>
          );
        })}
      </div>

      {/* Health-Insights: aggregierte, handlungsleitende Kennzahlen aus der Quality Engine. */}
      <section aria-label="Redaktionelle Gesundheit" className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Redaktionelle Gesundheit</h2>
          <Link
            to="/admin/editorial/qualitaet"
            className="text-xs text-primary hover:underline"
          >
            Zum Quality Center →
          </Link>
        </div>
        {health.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : health.data && health.data.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {health.data.map((h) => (
              <li
                key={h.key}
                className="rounded-lg border border-border bg-background p-3 text-sm"
              >
                <Link
                  to={h.to as "/admin/editorial/publishing"}
                  search={h.search as never}
                  className="flex items-center justify-between gap-3 hover:underline"
                >
                  <span className="text-muted-foreground">{h.label}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                    {h.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Keine offenen redaktionellen Signale.
          </p>
        )}
      </section>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Schnellzugriff</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link to="/admin/editorial/faelle" className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            Alle Fälle
          </Link>
          <Link to="/admin/editorial/reviews" className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            Review Center
          </Link>
          <Link to="/admin/editorial/qualitaet" className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            Quality Center
          </Link>
          <Link to="/admin/editorial/publishing" className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            Publishing Queue
          </Link>
          <Link to="/admin/editorial/legal-quality" className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            Legal Quality
          </Link>
          <Link to="/admin/editorial/workflows" className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            Workflow Designer
          </Link>
          <Link to="/admin/faelle" className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
            Redaktionelle Fallverwaltung (Alt)
          </Link>
        </div>
      </div>
    </div>
  );
}
