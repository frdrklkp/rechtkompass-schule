import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, RotateCcw, Loader2, ExternalLink } from "lucide-react";
import { getImportJob, rollbackImportJob } from "@/lib/importJobs";
import { LoadingState, ErrorState } from "@/components/DataStates";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/import-protokoll/$id")({
  component: ImportProtocolDetail,
});

const ACTION_LABEL: Record<string, { label: string; tone: string }> = {
  inserted: { label: "neu", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  updated: { label: "aktualisiert", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  skipped: { label: "übersprungen", tone: "bg-muted text-muted-foreground" },
  failed: { label: "Fehler", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  enriched: { label: "KI-Entwurf", tone: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
};

function ImportProtocolDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["admin", "import-job", id], queryFn: () => getImportJob(id) });
  const [rollbackReport, setRollbackReport] = useState<{ deleted: number; skipped: Array<{ section_number: string; reason: string }> } | null>(null);

  const rollbackMut = useMutation({
    mutationFn: () => rollbackImportJob(id),
    onSuccess: (r) => {
      setRollbackReport(r);
      qc.invalidateQueries({ queryKey: ["admin", "sections"] });
      qc.invalidateQueries({ queryKey: ["admin", "import-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin", "import-job", id] });
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return null;
  const { job, items } = q.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/import-protokoll" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> zurück zum Protokoll
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Import: {job.legal_sources?.name ?? "—"}
        </h1>
        <p className="text-xs text-muted-foreground">
          Job {job.id.slice(0, 8)} · gestartet {new Date(job.started_at).toLocaleString("de-DE")} · Status {job.status}
        </p>
        {job.source_url && (
          <a href={job.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            {job.source_url} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="erkannt" value={job.detected_count} />
        <Stat label="importiert" value={job.imported_count} tone="emerald" />
        <Stat label="aktualisiert" value={job.updated_count} tone="amber" />
        <Stat label="übersprungen" value={job.skipped_count} />
        <Stat label="KI-Wissenskarten" value={job.enriched_count} tone="violet" />
        <Stat label="Fehler" value={job.error_count} tone={job.error_count > 0 ? "rose" : undefined} />
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={rollbackMut.isPending || job.status === "cancelled"} onClick={() => {
          if (confirm("Diesen Import zurücksetzen? Nur importierte Entwürfe ohne Verknüpfungen werden gelöscht.")) rollbackMut.mutate();
        }}>
          {rollbackMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Diesen Import zurücksetzen
        </Button>
        <Button variant="ghost" onClick={() => navigate({ to: "/admin/rechtsgrundlagen" })}>
          Zum Rechtsquellen-Manager
        </Button>
      </div>

      {rollbackReport && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
          <p className="font-medium">Rollback abgeschlossen: {rollbackReport.deleted} Abschnitte gelöscht.</p>
          {rollbackReport.skipped.length > 0 && (
            <>
              <p className="mt-1 font-medium">Nicht gelöscht ({rollbackReport.skipped.length}):</p>
              <ul className="mt-1 space-y-0.5">
                {rollbackReport.skipped.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.section_number}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Protokoll ({items.length})
        </header>
        {items.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">Keine Detailprotokoll-Einträge.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it) => {
              const st = ACTION_LABEL[it.action] ?? { label: it.action, tone: "bg-muted" };
              return (
                <li key={it.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.tone}`}>{st.label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="font-medium">{it.section_number}</span>
                      {it.title && <span className="text-muted-foreground"> — {it.title}</span>}
                    </div>
                    {it.error && <div className="truncate text-[11px] text-destructive">{it.error}</div>}
                  </div>
                  {it.section_id && (
                    <Link to="/admin/rechtsgrundlagen/$id" params={{ id: it.section_id }} className="text-xs text-primary hover:underline">
                      öffnen
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "amber" | "rose" | "violet" }) {
  const tones = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    violet: "text-violet-600",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={`text-2xl font-semibold tabular-nums ${tone ? tones[tone] : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
