import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, ShieldCheck, Filter as FilterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { evaluateCases, publishCasesBatch } from "@/lib/casePipeline";
import { completePracticeCase } from "@/lib/casePipeline.completion";
import { invalidatePracticeCaseQueries } from "@/lib/casePipeline.invalidate";
import { useQueryClient } from "@tanstack/react-query";
import { statusLabel, type EvalResult } from "@/lib/qualityEngine";

export const Route = createFileRoute("/admin/ki-entwurfsmaschine/review")({
  component: ReviewPage,
});

type Row = EvalResult & { title: string; category: string | null };
type Filter =
  | "alle"
  | "ready"
  | "under90"
  | "hardblock"
  | "no_legal"
  | "no_template"
  | "duplicate_risk";

function ReviewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [refining, setRefining] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("alle");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minutes, setMinutes] = useState<number>(60);

  const loadDrafts = async (mins: number) => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - mins * 60_000).toISOString();
      const { data, error } = await supabase
        .from("practice_cases")
        .select("id,title,category,status,created_at")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("status", "draft" as any)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.id as string);
      if (ids.length === 0) {
        setRows([]);
        setSelected(new Set());
        return;
      }
      const evals = await evaluateCases(ids);
      const rowsOut: Row[] = [];
      for (const r of evals) {
        if ("error" in r) continue;
        const rec = (data ?? []).find((d) => d.id === r.caseId);
        rowsOut.push({
          ...r,
          title: (rec?.title as string) ?? "(ohne Titel)",
          category: (rec?.category as string) ?? null,
        });
      }
      setRows(rowsOut);
      setSelected(new Set(rowsOut.filter((r) => r.publicationReady).map((r) => r.caseId)));
    } catch (e) {
      toast.error("Laden fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDrafts(minutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "ready") return r.publicationReady;
      if (filter === "under90") return r.score < 90;
      if (filter === "hardblock") return r.hardBlockers.length > 0;
      if (filter === "no_legal") return r.counts.legalCount === 0;
      if (filter === "no_template") return r.counts.templateCount === 0;
      if (filter === "duplicate_risk") return r.hardBlockers.some((h) => h.includes("Dublette"));
      return true;
    });
  }, [rows, filter]);

  const kpi = useMemo(() => {
    const total = rows.length;
    const ready = rows.filter((r) => r.publicationReady).length;
    const under90 = rows.filter((r) => r.score < 90).length;
    const critical = rows.filter((r) => r.hardBlockers.length > 0).length;
    const avgScore = total ? Math.round(rows.reduce((s, r) => s + r.score, 0) / total) : 0;
    const avgLegal = total ? (rows.reduce((s, r) => s + r.counts.legalCount, 0) / total).toFixed(1) : "0";
    const avgTpl = total ? (rows.reduce((s, r) => s + r.counts.templateCount, 0) / total).toFixed(1) : "0";
    return { total, ready, under90, critical, avgScore, avgLegal, avgTpl };
  }, [rows]);

  const toggleAll = (on: boolean) => {
    if (on) setSelected(new Set(filtered.filter((r) => r.publicationReady).map((r) => r.caseId)));
    else setSelected(new Set());
  };

  const publishSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} Praxisfälle veröffentlichen? Jeder Fall wird unmittelbar davor erneut geprüft.`)) return;
    setPublishing(true);
    try {
      const report = await publishCasesBatch(Array.from(selected));
      toast.success(`${report.published.length} veröffentlicht · ${report.rejected.length} abgelehnt · ${report.errors.length} Fehler`);
      if (report.rejected.length > 0) {
        for (const r of report.rejected.slice(0, 3)) {
          toast.warning(`Nicht veröffentlicht: ${r.hardBlockers.join(", ") || r.reasons.slice(0, 2).join("; ")}`);
        }
      }
      await loadDrafts(minutes);
    } catch (e) {
      toast.error("Veröffentlichung fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPublishing(false);
    }
  };

  const runRefinement = async (row: Row) => {
    setRefining(row.caseId);
    try {
      const report = await completePracticeCase(row.caseId, { source: "ai_case_machine" });
      invalidatePracticeCaseQueries(qc, row.caseId);
      const changes =
        report.legal.assigned.length +
        report.legal.removed.length +
        report.keywords.assigned +
        report.templates.assigned;
      toast.success(
        `Pipeline abgeschlossen · ${changes} Änderungen · Score ${report.quality?.score ?? "–"}`,
      );
      await loadDrafts(minutes);
    } catch (e) {
      toast.error("Nachbesserung fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRefining(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Generierte Praxisfälle – Qualitätsübersicht
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministische Qualitätsprüfung aus der Datenbank. Keine KI-Selbsteinschätzung.
            Batch-Veröffentlichung prüft jeden Fall unmittelbar davor erneut serverseitig.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Zeitfenster (Min.):</span>
          <Input type="number" min={5} max={4320} value={minutes} onChange={(e) => setMinutes(Math.max(5, Number(e.target.value) || 60))} className="w-20" />
          <Button size="sm" variant="outline" onClick={() => loadDrafts(minutes)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Neu laden
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { k: "Gesamt", v: kpi.total },
          { k: "Veröffentlichungsreif", v: kpi.ready, tone: "gruen" },
          { k: "Unter 90 Punkten", v: kpi.under90, tone: "gelb" },
          { k: "Kritisch", v: kpi.critical, tone: "rot" },
          { k: "Ø Qualität", v: kpi.avgScore },
          { k: "Ø Rechtsgrundlagen", v: kpi.avgLegal },
          { k: "Ø Vorlagen", v: kpi.avgTpl },
        ].map((k) => (
          <div key={k.k} className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{k.k}</div>
            <div className={`mt-1 text-2xl font-semibold ${k.tone === "gruen" ? "text-emerald-600" : k.tone === "gelb" ? "text-amber-600" : k.tone === "rot" ? "text-rose-600" : ""}`}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-xs">
        <FilterIcon className="h-4 w-4 text-muted-foreground" />
        {([
          ["alle", "Alle"],
          ["ready", "Veröffentlichungsreif"],
          ["under90", "< 90 Punkte"],
          ["hardblock", "Hard Blocker"],
          ["no_legal", "Ohne Rechtsgrundlage"],
          ["no_template", "Ohne Vorlage"],
          ["duplicate_risk", "Mögliche Dubletten"],
        ] as Array<[Filter, string]>).map(([f, label]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-2.5 py-1 ${filter === f ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>Alle veröffentlichungsreifen wählen</Button>
          <Button size="sm" variant="outline" onClick={() => toggleAll(false)}>Auswahl leeren</Button>
          <Button size="sm" onClick={publishSelected} disabled={selected.size === 0 || publishing}>
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {selected.size} Fälle veröffentlichen
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {loading && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lade und prüfe Entwürfe…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Keine Entwürfe im gewählten Zeitfenster / Filter.</div>
        )}
        <ul className="divide-y divide-border">
          {filtered.map((r) => {
            const sl = statusLabel(r);
            return (
              <li key={r.caseId} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(r.caseId)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(r.caseId);
                      else next.delete(r.caseId);
                      return next;
                    });
                  }}
                  disabled={!r.publicationReady}
                  title={r.publicationReady ? "" : "Nicht veröffentlichungsreif"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{r.title}</span>
                    {r.category && <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{r.category}</span>}
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${sl.tone === "gruen" ? "bg-emerald-500/15 text-emerald-700" : sl.tone === "gelb" ? "bg-amber-500/15 text-amber-700" : "bg-rose-500/15 text-rose-700"}`}>
                      {r.score} / 100 · {sl.label}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                    <span>Inhalt {r.sub.inhalt}/30</span>
                    <span>Recht {r.sub.recht}/30</span>
                    <span>Vernetzung {r.sub.vernetzung}/20</span>
                    <span>Redaktion {r.sub.redaktion}/20</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>✓ {r.counts.doCount} Do's</span>
                    <span>✓ {r.counts.dontCount} Don'ts</span>
                    <span>✓ {r.counts.legalCount} Rechtsgrundlagen</span>
                    <span>✓ {r.counts.keywordCount} Schlagwörter</span>
                    <span>✓ {r.counts.templateCount} Vorlagen</span>
                    <span>✓ {r.counts.checklistCount} Checkliste</span>
                    <span>✓ {r.counts.faqCount} FAQ</span>
                  </div>
                  {r.hardBlockers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      {r.hardBlockers.map((h, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700">
                          <XCircle className="h-3 w-3" /> {h}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.warnings.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      {r.warnings.map((w, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700">
                          <AlertTriangle className="h-3 w-3" /> {w}
                        </span>
                      ))}
                    </div>
                  )}
                  {!r.publicationReady && r.reasons.length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Defizite anzeigen ({r.reasons.length})</summary>
                      <ul className="mt-1 space-y-0.5 pl-3">
                        {r.reasons.slice(0, 12).map((rn) => (
                          <li key={rn.key}>· {rn.message} (−{rn.points})</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button size="sm" variant="outline" onClick={() => navigate({ to: "/admin/faelle/$id", params: { id: r.caseId } })}>
                    Öffnen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => runRefinement(r)}
                    disabled={refining === r.caseId}
                  >
                    {refining === r.caseId ? <Loader2 className="h-3 w-3 animate-spin" /> : "🔧"} Pipeline erneut
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="text-xs text-muted-foreground">
        <Link to="/admin/ki-entwurfsmaschine" className="underline">
          ← Zur Fallmaschine
        </Link>
      </div>
    </div>
  );
}
