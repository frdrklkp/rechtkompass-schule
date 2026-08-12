import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, ArrowRight, RefreshCw } from "lucide-react";
import { listImportJobs, type ImportJob } from "@/lib/importJobs";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";

export const Route = createFileRoute("/admin/import-protokoll")({
  component: ImportProtocol,
});

const STATUS_LABEL: Record<string, { label: string; tone: string; icon: string }> = {
  running: { label: "läuft", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: "🟡" },
  succeeded: { label: "erfolgreich", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", icon: "🟢" },
  failed: { label: "fehlgeschlagen", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400", icon: "🔴" },
  cancelled: { label: "abgebrochen", tone: "bg-muted text-muted-foreground", icon: "⚪" },
};

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  return `${m} min ${rest} s`;
}

function ImportProtocol() {
  const q = useQuery({ queryKey: ["admin", "import-jobs"], queryFn: () => listImportJobs() });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Werkzeuge</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Import-Protokoll</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Alle bisherigen Rechtsquellen-Importe – reproduzierbar, protokolliert, rücksetzbar.
          </p>
        </div>
        <button
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" /> aktualisieren
        </button>
      </header>

      {q.isLoading && <LoadingState />}
      {q.error && <ErrorState error={q.error} />}
      {q.data && q.data.length === 0 && (
        <EmptyState title="Noch keine Importe" description="Starten Sie einen Import im Rechtsquellen-Manager." />
      )}

      {q.data && q.data.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Quelle</th>
                <th className="px-4 py-2.5">Datum</th>
                <th className="px-4 py-2.5">Dauer</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">importiert</th>
                <th className="px-4 py-2.5 text-right">aktualisiert</th>
                <th className="px-4 py-2.5 text-right">KI</th>
                <th className="px-4 py-2.5 text-right">Fehler</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data.map((j) => {
                const st = STATUS_LABEL[j.status] ?? STATUS_LABEL.running;
                return (
                  <tr key={j.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">
                        {j.legal_sources?.name ?? "—"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground max-w-[280px]">
                        {j.source_url}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(j.started_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs">{formatDuration(j.duration_ms)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone}`}>
                        {st.icon} {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{j.imported_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{j.updated_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{j.enriched_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {j.error_count > 0 ? (
                        <span className="text-rose-600">{j.error_count}</span>
                      ) : (
                        j.error_count
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        to="/admin/import-protokoll/$id"
                        params={{ id: j.id }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Details <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
