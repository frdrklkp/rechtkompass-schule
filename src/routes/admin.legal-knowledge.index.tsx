import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BookMarked,
  Upload,
  History,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  FileText,
  Paperclip,
  Layers,
  RefreshCw,
} from "lucide-react";
import { preparedParsers } from "@/services/legal-knowledge/import";
import {
  listImportHistory,
  listSnapshots,
  type LegalImportHistoryEntry,
} from "@/services/legal-knowledge/import/browserRepository";
import {
  aggregateSourceMetrics,
  listSourceMetrics,
  type SourceImportMetrics,
} from "@/services/legal-knowledge/import-experience";
import { useLegalSources } from "@/hooks/legal-knowledge/useLegalKnowledge";

export const Route = createFileRoute("/admin/legal-knowledge/")({
  component: LegalKnowledgeDashboard,
});

function LegalKnowledgeDashboard() {
  const sources = useLegalSources();
  const [history, setHistory] = useState<LegalImportHistoryEntry[]>([]);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [metrics, setMetrics] = useState<SourceImportMetrics[]>([]);

  useEffect(() => {
    const list = listImportHistory();
    setHistory(list);
    setSnapshotCount(listSnapshots().length);
    setConflictCount(list.filter((h) => h.status === "failed").length);
    setMetrics(listSourceMetrics());
  }, []);

  const parserCount = preparedParsers.length;
  const totalSources = sources.data?.length ?? 0;
  const lastImports = history.slice(0, 5);
  const lastChanges = history.filter((h) => h.status === "completed").slice(0, 5);
  const totals = aggregateSourceMetrics(metrics);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          tone="emerald"
          icon={<BookMarked className="h-4 w-4" />}
          label="Rechtsquellen"
          value={totalSources}
          hint="im Registerbestand"
        />
        <StatCard
          tone="sky"
          icon={<Upload className="h-4 w-4" />}
          label="Parser bereit"
          value={parserCount}
          hint="BASS · APO-BK · VV · …"
        />
        <StatCard
          tone="amber"
          icon={<GitBranch className="h-4 w-4" />}
          label="Version-Snapshots"
          value={snapshotCount}
          hint="lokal persistiert"
        />
        <StatCard
          tone={conflictCount > 0 ? "rose" : "emerald"}
          icon={
            conflictCount > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )
          }
          label="Versionskonflikte"
          value={conflictCount}
          hint={conflictCount > 0 ? "Prüfung nötig" : "keine Konflikte"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          tone="sky"
          icon={<FileText className="h-4 w-4" />}
          label="Importierte Dokumente"
          value={totals.documents}
          hint="übernommene Fassungen"
        />
        <StatCard
          tone="emerald"
          icon={<Layers className="h-4 w-4" />}
          label="Paragraphen gesamt"
          value={totals.paragraphs}
          hint="im Bestand"
        />
        <StatCard
          tone="amber"
          icon={<Paperclip className="h-4 w-4" />}
          label="Anlagen gesamt"
          value={totals.attachments}
          hint="im Bestand"
        />
        <StatCard
          tone="amber"
          icon={<RefreshCw className="h-4 w-4" />}
          label="Geänderte Inhalte"
          value={totals.changed}
          hint="seit erstem Import"
        />
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4" />
            Letzte Aktualisierung
          </div>
          <div className="mt-1 text-sm font-semibold">
            {totals.lastImportedAt ? new Date(totals.lastImportedAt).toLocaleString("de-DE") : "—"}
          </div>
          <p className="text-[10px] text-muted-foreground">letzter erfolgreicher Import</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Letzte Importe"
          icon={<History className="h-4 w-4" />}
          action={{ to: "/admin/legal-knowledge/history", label: "Alle anzeigen" }}
        >
          {lastImports.length === 0 ? (
            <Empty>Noch keine Importe. Starten Sie mit dem Import-Wizard.</Empty>
          ) : (
            <ul className="space-y-2 text-xs">
              {lastImports.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between rounded-md border border-border bg-background p-2"
                >
                  <div>
                    <div className="font-medium">{h.sourceTitle}</div>
                    <div className="text-muted-foreground">
                      {h.parserLabel ?? h.parserId} ·{" "}
                      {new Date(h.timestamp).toLocaleString("de-DE")}
                    </div>
                  </div>
                  <StatusPill status={h.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Letzte Änderungen" icon={<Clock className="h-4 w-4" />}>
          {lastChanges.length === 0 ? (
            <Empty>Noch keine erfolgreichen Delta-Änderungen.</Empty>
          ) : (
            <ul className="space-y-2 text-xs">
              {lastChanges.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between rounded-md border border-border bg-background p-2"
                >
                  <div>
                    <div className="font-medium">
                      {h.sourceTitle}{" "}
                      <span className="text-muted-foreground">· {h.versionLabel}</span>
                    </div>
                    <div className="text-muted-foreground">
                      +{h.added} / ~{h.updated} / −{h.removed}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(h.timestamp).toLocaleDateString("de-DE")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Parserstatus" icon={<CheckCircle2 className="h-4 w-4" />}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {preparedParsers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border border-border bg-background p-2 text-xs"
            >
              <div>
                <div className="font-medium">{p.label}</div>
                <div className="text-[10px] text-muted-foreground">{p.id}</div>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                bereit
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  tone,
  icon,
  label,
  value,
  hint,
}: {
  tone: "emerald" | "sky" | "amber" | "rose";
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
}) {
  const bg: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-700",
    sky: "bg-sky-500/10 text-sky-700",
    amber: "bg-amber-500/10 text-amber-700",
    rose: "bg-rose-500/10 text-rose-700",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className={`grid h-8 w-8 place-items-center rounded-md ${bg[tone]}`}>{icon}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Card({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h2>
        {action && (
          <Link to={action.to} className="text-[11px] font-medium text-accent hover:underline">
            {action.label} →
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: "completed" | "no_change" | "failed" }) {
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700">
        <XCircle className="h-3 w-3" />
        Fehler
      </span>
    );
  if (status === "no_change")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        unverändert
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      ok
    </span>
  );
}
