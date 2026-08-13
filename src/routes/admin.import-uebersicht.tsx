import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  PlayCircle,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Search,
  Loader2,
  ListChecks,
} from "lucide-react";
import { listSources, bulkImportSections, type ImportSectionDraft } from "@/lib/coreBuilder";
import {
  listManifestPages,
  markManifestImported,
  getManifestStats,
  getKnowledgeCardCoverage,
  type ImportManifestRow,
} from "@/lib/importManifest";
import {
  startImportJob,
  finishImportJob,
  updateJobCounters,
  recordJobItem,
} from "@/lib/importJobs";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { apiFetch } from "@/lib/apiFetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/import-uebersicht")({
  validateSearch: (s: Record<string, unknown>) => ({
    source: typeof s.source === "string" ? s.source : undefined,
  }),
  component: ImportUebersicht,
});

type FilterKey =
  | "all"
  | "not_imported"
  | "imported"
  | "error"
  | "no_card";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "not_imported", label: "Nicht importiert" },
  { key: "imported", label: "Importiert" },
  { key: "error", label: "Fehlerhaft" },
  { key: "no_card", label: "Ohne Wissenskarte" },
];

const STATUS_META: Record<
  ImportManifestRow["status"],
  { label: string; tone: string }
> = {
  discovered: {
    label: "gefunden",
    tone: "bg-muted text-muted-foreground",
  },
  imported: {
    label: "importiert",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  partial: {
    label: "teilweise",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  error: {
    label: "Fehler",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
  skipped: {
    label: "übersprungen",
    tone: "bg-muted text-muted-foreground",
  },
};

function ImportUebersicht() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const sourcesQ = useQuery({ queryKey: ["admin", "sources"], queryFn: listSources });

  // Default: erste BASS-Quelle, sonst erste vorhandene
  const sources: Array<{ id: string; name: string; short_name?: string; legal_area?: string }> =
    (sourcesQ.data ?? []) as any;
  const defaultSourceId = useMemo(() => {
    if (search.source) return search.source;
    const bass = sources.find((s) =>
      String(s.short_name ?? s.name ?? "")
        .toLowerCase()
        .includes("bass"),
    );
    return bass?.id ?? sources[0]?.id ?? "";
  }, [sources, search.source]);
  const sourceId = search.source ?? defaultSourceId;

  const manifestQ = useQuery({
    queryKey: ["admin", "manifest", sourceId],
    queryFn: () => listManifestPages(sourceId),
    enabled: Boolean(sourceId),
  });
  const statsQ = useQuery({
    queryKey: ["admin", "manifest-stats", sourceId],
    queryFn: () => getManifestStats(sourceId),
    enabled: Boolean(sourceId),
  });
  const coverageQ = useQuery({
    queryKey: ["admin", "manifest-coverage", sourceId],
    queryFn: () => getKnowledgeCardCoverage(sourceId),
    enabled: Boolean(sourceId),
  });

  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [resumeState, setResumeState] = useState<{
    running: boolean;
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [lastReport, setLastReport] = useState<{
    processed: number;
    imported_sections: number;
    errors: number;
  } | null>(null);

  const rows = (manifestQ.data ?? []) as ImportManifestRow[];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "not_imported" && r.status === "imported") return false;
      if (filter === "imported" && r.status !== "imported") return false;
      if (filter === "error" && r.status !== "error") return false;
      if (filter === "no_card" && r.knowledge_card_count > 0) return false;
      if (!q) return true;
      const hay = `${r.bass_number ?? ""} ${r.title ?? ""} ${r.url}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, query]);

  const openCount = rows.filter(
    (r) => r.status === "discovered" || r.status === "error",
  ).length;

  async function resumeImport(chunkSize = 25) {
    if (!sourceId) return;
    const candidates = rows.filter(
      (r) => r.status === "discovered" || r.status === "error",
    );
    if (!candidates.length) {
      alert("Es gibt keine offenen oder fehlerhaften Seiten zum Fortsetzen.");
      return;
    }
    const chunk = candidates.slice(0, chunkSize);
    const startUrl = chunk[0]?.url ?? "";

    setResumeState({ running: true, current: 0, total: chunk.length, label: "" });
    setLastReport(null);

    const job = await startImportJob({
      source_id: sourceId,
      source_url: startUrl,
      detected_count: chunk.reduce((a, r) => a + (r.section_count || 0), 0),
      notes: `Chunk-Import (Resume) · ${chunk.length} Seiten`,
    });

    let importedSections = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      for (let i = 0; i < chunk.length; i++) {
        const page = chunk[i];
        setResumeState({
          running: true,
          current: i,
          total: chunk.length,
          label: page.title || page.bass_number || page.url,
        });

        let drafts: ImportSectionDraft[] = [];
        try {
          const res = await apiFetch("/api/import-legal-source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: page.url }),
          });
          const raw = await res.text();
          const data = raw ? JSON.parse(raw) : {};
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
          const secs: Array<{
            section_number: string;
            title: string;
            full_text: string;
            official_url: string;
            source_hash: string;
          }> = Array.isArray(data?.sections) ? data.sections : [];
          drafts = secs.map((s) => ({
            section_number: s.section_number,
            title: s.title,
            full_text: s.full_text,
            official_url: s.official_url || page.url,
            source_hash: s.source_hash,
          }));
        } catch (err) {
          errorCount++;
          errors.push(`${page.url}: ${(err as Error).message}`);
          await recordJobItem({
            job_id: job.id,
            section_number: null,
            title: page.title || page.url,
            action: "failed",
            error: (err as Error).message,
          });
          await markManifestImported({
            manifestId: page.id,
            importJobId: job.id,
            status: "error",
            error_message: (err as Error).message,
          });
          continue;
        }

        if (!drafts.length) {
          await recordJobItem({
            job_id: job.id,
            section_number: null,
            title: page.title || page.url,
            action: "skipped",
            error: "keine Abschnitte erkannt",
          });
          await markManifestImported({
            manifestId: page.id,
            importJobId: job.id,
            status: "skipped",
            section_count: 0,
            imported_section_count: 0,
            error_message: "keine Abschnitte erkannt",
          });
          continue;
        }

        try {
          const r = await bulkImportSections(sourceId, drafts, page.url, job.id, page.id);
          importedSections += r.inserted + r.updated;
          for (const it of r.items) {
            try {
              await recordJobItem({
                job_id: job.id,
                section_number: it.section_number,
                title: it.title,
                section_id: it.section_id,
                action: it.action,
                source_hash: it.source_hash,
              });
            } catch { /* ignore */ }
          }
          await markManifestImported({
            manifestId: page.id,
            importJobId: job.id,
            status: "imported",
            section_count: drafts.length,
            imported_section_count: r.inserted + r.updated,
          });
        } catch (err) {
          errorCount++;
          errors.push(`${page.url}: ${(err as Error).message}`);
          await recordJobItem({
            job_id: job.id,
            section_number: null,
            title: page.title || page.url,
            action: "failed",
            error: (err as Error).message,
          });
          await markManifestImported({
            manifestId: page.id,
            importJobId: job.id,
            status: "error",
            error_message: (err as Error).message,
          });
        }
      }

      await updateJobCounters(job.id, {
        error_count: errorCount,
      });
      await finishImportJob(
        job.id,
        errorCount && !importedSections ? "failed" : "succeeded",
        { notes: errors.slice(0, 5).join(" | ") || undefined },
      );
    } finally {
      setResumeState(null);
      setLastReport({
        processed: chunk.length,
        imported_sections: importedSections,
        errors: errorCount,
      });
      qc.invalidateQueries({ queryKey: ["admin", "manifest", sourceId] });
      qc.invalidateQueries({ queryKey: ["admin", "manifest-stats", sourceId] });
      qc.invalidateQueries({ queryKey: ["admin", "manifest-coverage", sourceId] });
      qc.invalidateQueries({ queryKey: ["admin", "sections"] });
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Werkzeuge
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Import-Übersicht</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Vollständige Sicht auf alle gecrawlten Seiten je Rechtsquelle inklusive
            Wissenskarten-Abdeckung. Nicht importierte oder fehlerhafte Seiten können
            fortgesetzt werden, ohne von vorn zu beginnen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sourceId}
            onChange={(e) =>
              navigate({ search: { source: e.target.value }, replace: true })
            }
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.short_name || s.name}
                {s.legal_area ? ` · ${s.legal_area}` : ""}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["admin", "manifest", sourceId] });
              qc.invalidateQueries({ queryKey: ["admin", "manifest-stats", sourceId] });
              qc.invalidateQueries({ queryKey: ["admin", "manifest-coverage", sourceId] });
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Aktualisieren
          </Button>
        </div>
      </header>

      {!sourceId && (
        <EmptyState
          title="Keine Rechtsquelle gewählt"
          description="Bitte oben eine Rechtsquelle auswählen, um die Import-Übersicht zu sehen."
        />
      )}

      {sourceId && (
        <>
          {/* KPI-Kacheln */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Kpi label="Gefunden" value={statsQ.data?.total ?? "—"} />
            <Kpi label="Importiert" value={statsQ.data?.imported ?? "—"} tone="ok" />
            <Kpi label="Offen" value={statsQ.data?.discovered ?? "—"} />
            <Kpi label="Fehler" value={statsQ.data?.error ?? "—"} tone="err" />
            <Kpi
              label="Wissenskarten"
              value={
                coverageQ.data
                  ? `${coverageQ.data.with_card}/${coverageQ.data.sections_total}`
                  : "—"
              }
            />
            <Kpi
              label="Erfolg"
              value={statsQ.data ? `${statsQ.data.success_rate}%` : "—"}
            />
          </div>

          {statsQ.data?.last_imported_at && (
            <p className="text-xs text-muted-foreground">
              Letzter Import:{" "}
              {new Date(statsQ.data.last_imported_at).toLocaleString("de-DE", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}

          {/* Aktionsleiste */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <Button
              size="sm"
              disabled={!openCount || Boolean(resumeState?.running)}
              onClick={() => resumeImport(25)}
            >
              {resumeState?.running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              Import fortsetzen ({Math.min(25, openCount)} von {openCount})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!openCount || Boolean(resumeState?.running)}
              onClick={() => resumeImport(100)}
            >
              Nächste 100 importieren
            </Button>
            <Link
              to="/admin/import-protokoll"
              className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ListChecks className="h-3.5 w-3.5" /> Import-Protokoll
            </Link>
          </div>

          {resumeState?.running && (
            <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-xs">
              <div className="flex items-center justify-between font-medium">
                <span className="min-w-0 truncate">Importiere: {resumeState.label}</span>
                <span>
                  {resumeState.current} / {resumeState.total}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-accent transition-all"
                  style={{
                    width: `${Math.round(
                      (resumeState.current / Math.max(1, resumeState.total)) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {lastReport && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300">
              <p className="font-semibold">Chunk abgeschlossen</p>
              <p>
                {lastReport.processed} Seiten verarbeitet ·{" "}
                {lastReport.imported_sections} Abschnitte importiert/aktualisiert ·{" "}
                {lastReport.errors === 0 ? "0 Fehler" : `⚠ ${lastReport.errors} Fehler`}
              </p>
            </div>
          )}

          {/* Filter + Suche */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  filter === f.key
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="BASS-Nummer, Titel oder URL suchen"
                className="h-8 w-64 pl-7 text-xs"
              />
            </div>
          </div>

          {manifestQ.isLoading && <LoadingState />}
          {manifestQ.error && <ErrorState error={manifestQ.error} />}
          {manifestQ.data && filtered.length === 0 && (
            <EmptyState
              title="Keine Seiten"
              description="Für die aktuelle Filterkombination sind keine Manifest-Zeilen vorhanden. Starten Sie den Crawler im Import-Center, um Seiten zu erfassen."
            />
          )}

          {filtered.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">Seite</th>
                    <th className="px-3 py-2.5 text-right">Abschn.</th>
                    <th className="px-3 py-2.5 text-right">Karten</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Letzter Import</th>
                    <th className="px-3 py-2.5">Hinweis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => {
                    const st = STATUS_META[r.status];
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="max-w-[320px] px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            {r.status === "imported" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            ) : r.status === "error" ? (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate">
                              {r.bass_number ? (
                                <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px]">
                                  {r.bass_number}
                                </span>
                              ) : null}
                              {r.title || r.url.split("/").pop() || r.url}
                            </span>
                          </div>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-accent"
                          >
                            {r.url} <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                          {r.imported_section_count}/{r.section_count}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                          {r.knowledge_card_count}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone}`}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                          {r.last_imported_at
                            ? new Date(r.last_imported_at).toLocaleString("de-DE", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </td>
                        <td className="max-w-[240px] truncate px-3 py-2.5 text-xs text-rose-600">
                          {r.error_message || ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "err";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "err"
        ? "text-rose-700 dark:text-rose-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}
