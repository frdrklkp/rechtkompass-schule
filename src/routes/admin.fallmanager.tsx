import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Flag,
  Search,
  Loader2,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import {
  listFeedbackReports,
  getFeedbackReport,
  updateFeedbackStatus,
  updateFeedbackAdminNotes,
  updateFeedbackQualityReference,
  countOpenReportsForCase,
  REPORT_TYPE_LABELS,
  URGENCY_LABELS,
  STATUS_LABELS,
  type FeedbackReport,
  type FeedbackStatus,
  type FeedbackReportType,
} from "@/lib/feedbackReportsRepo";
import { statusLabel, type EvalResult, type QualityTask } from "@/lib/qualityEngine";
import { completePracticeCase, type CompletionReport } from "@/lib/casePipeline.completion";
import { invalidatePracticeCaseQueries } from "@/lib/casePipeline.invalidate";

export const Route = createFileRoute("/admin/fallmanager")({
  component: FallmanagerPage,
});

const STATUS_TONE: Record<FeedbackStatus, string> = {
  open: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  in_review: "bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
  quality_check: "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
  resolved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  rejected: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const URGENCY_TONE = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-red-600 dark:text-red-400 font-semibold",
} as const;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function isToday(iso: string): boolean {
  try {
    const d = new Date(iso);
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  } catch {
    return false;
  }
}

function FallmanagerPage() {
  const qc = useQueryClient();
  const reportsQ = useQuery({
    queryKey: ["admin", "feedback-reports"],
    queryFn: listFeedbackReports,
  });

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | FeedbackStatus | "high">("alle");
  const [typeFilter, setTypeFilter] = useState<"alle" | FeedbackReportType>("alle");
  const [caseFilter, setCaseFilter] = useState<string>("alle");
  const [selected, setSelected] = useState<string | null>(null);

  const all = reportsQ.data ?? [];
  const caseOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) if (r.case_id) m.set(r.case_id, r.case_title || r.case_id);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((r) => {
      if (statusFilter === "high") {
        if (r.urgency !== "high") return false;
      } else if (statusFilter !== "alle" && r.status !== statusFilter) return false;
      if (typeFilter !== "alle" && r.report_type !== typeFilter) return false;
      if (caseFilter !== "alle" && r.case_id !== caseFilter) return false;
      if (term) {
        const hay = [r.case_title, r.message, REPORT_TYPE_LABELS[r.report_type], r.admin_notes]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [all, q, statusFilter, typeFilter, caseFilter]);

  const kpis = useMemo(() => {
    const open = all.filter((r) => r.status === "open").length;
    const inReview = all.filter((r) => r.status === "in_review").length;
    const quality = all.filter((r) => r.status === "quality_check").length;
    const high = all.filter((r) => r.urgency === "high" && r.status !== "resolved" && r.status !== "rejected").length;
    const today = all.filter((r) => isToday(r.created_at)).length;
    const resolved = all.filter((r) => r.status === "resolved").length;
    return { open, inReview, quality, high, today, resolved };
  }, [all]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Redaktion</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Flag className="h-6 w-6 text-accent" />
            Fallmanager
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nutzerfeedback zu Praxisfällen zentral bearbeiten und mit dem Qualitätsmanager verbinden.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Offen" value={kpis.open} tone="amber" />
        <Kpi label="In Prüfung" value={kpis.inReview} tone="blue" />
        <Kpi label="Qualitätsprüfung" value={kpis.quality} tone="violet" />
        <Kpi label="Hohe Dringlichkeit" value={kpis.high} tone="red" />
        <Kpi label="Heute eingegangen" value={kpis.today} tone="slate" />
        <Kpi label="Erledigt" value={kpis.resolved} tone="emerald" />
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Meldungen durchsuchen …" className="pl-9" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as never)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="alle">Alle Status</option>
          <option value="open">Offen</option>
          <option value="in_review">In Prüfung</option>
          <option value="quality_check">Qualitätsprüfung</option>
          <option value="resolved">Erledigt</option>
          <option value="rejected">Abgelehnt</option>
          <option value="high">Hohe Dringlichkeit</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as never)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="alle">Alle Meldetypen</option>
          {(Object.keys(REPORT_TYPE_LABELS) as FeedbackReportType[]).map((t) => (
            <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="alle">Alle Praxisfälle</option>
          {caseOptions.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </select>
      </div>

      {reportsQ.isLoading && <LoadingState />}
      {reportsQ.error && <ErrorState error={reportsQ.error} />}
      {reportsQ.data && filtered.length === 0 && (
        <EmptyState
          title={all.length === 0 ? "Noch keine Meldungen" : "Keine Treffer"}
          description={all.length === 0 ? "Sobald Lehrkräfte Feedback melden, erscheint es hier." : "Passe Filter oder Suchbegriff an."}
        />
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Meldetyp / Fall</th>
                <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell">Beschreibung</th>
                <th className="px-4 py-2.5 text-left font-medium">Dringlichkeit</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Eingang</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 align-top">
                    <div className="font-medium">{REPORT_TYPE_LABELS[r.report_type]}</div>
                    <div className="text-xs text-muted-foreground">{r.case_title ?? "— ohne Fallbezug"}</div>
                  </td>
                  <td className="hidden max-w-md px-4 py-2.5 align-top text-muted-foreground md:table-cell">
                    <div className="line-clamp-2 text-xs">{r.message}</div>
                  </td>
                  <td className={`px-4 py-2.5 align-top text-xs ${URGENCY_TONE[r.urgency]}`}>{URGENCY_LABELS[r.urgency]}</td>
                  <td className="px-4 py-2.5 align-top">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                  </td>
                  <td className="px-4 py-2.5 align-top text-xs text-muted-foreground">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-right align-top">
                    <button type="button" onClick={() => setSelected(r.id)} className="text-xs text-primary hover:underline">
                      Öffnen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ReportDetailDialog
          id={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["admin", "feedback-reports"] })}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "amber" | "blue" | "violet" | "red" | "slate" | "emerald" }) {
  const toneMap: Record<string, string> = {
    amber: "text-amber-700 dark:text-amber-300",
    blue: "text-blue-700 dark:text-blue-300",
    violet: "text-violet-700 dark:text-violet-300",
    red: "text-red-700 dark:text-red-300",
    slate: "text-slate-700 dark:text-slate-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneMap[tone]}`}>{value}</div>
    </div>
  );
}

/* -------- Detail Dialog -------- */

function ReportDetailDialog({ id, open, onClose, onChanged }: { id: string; open: boolean; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const reportQ = useQuery({ queryKey: ["admin", "feedback-report", id], queryFn: () => getFeedbackReport(id) });
  const r = reportQ.data ?? null;

  const dupQ = useQuery({
    queryKey: ["admin", "feedback-report-duplicates", r?.case_id, id],
    queryFn: () => (r?.case_id ? countOpenReportsForCase(r.case_id, id) : Promise.resolve(0)),
    enabled: !!r?.case_id,
  });

  const [notes, setNotes] = useState<string>("");
  const [notesInit, setNotesInit] = useState<string | null>(null);
  if (r && notesInit !== r.id) {
    setNotesInit(r.id);
    setNotes(r.admin_notes ?? "");
  }

  const setStatus = useMutation({
    mutationFn: (status: FeedbackStatus) => updateFeedbackStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "feedback-report", id] });
      onChanged();
      toast.success("Status aktualisiert.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotes = useMutation({
    mutationFn: () => updateFeedbackAdminNotes(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "feedback-report", id] });
      onChanged();
      toast.success("Notiz gespeichert.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [evalRes, setEvalRes] = useState<EvalResult | null>(null);
  const [tasks, setTasks] = useState<QualityTask[]>([]);
  const [pipelineReport, setPipelineReport] = useState<CompletionReport | null>(null);
  const runQuality = useMutation({
    mutationFn: async () => {
      if (!r?.case_id) throw new Error("Meldung ohne Fallbezug – Qualitätsprüfung nicht möglich.");
      const report = await completePracticeCase(r.case_id, { source: "fallmanager" });
      return report;
    },
    onSuccess: async (report) => {
      setPipelineReport(report);
      setEvalRes(report.quality);
      setTasks(report.qualityTasks);
      await updateFeedbackQualityReference(id, `quality:${report.caseId}:${report.qualityTasks.length}`);
      invalidatePracticeCaseQueries(qc, report.caseId);
      qc.invalidateQueries({ queryKey: ["admin", "feedback-report", id] });
      qc.invalidateQueries({ queryKey: ["admin", "feedback-reports"] });
      onChanged();
      const errs = report.errors.length;
      toast.success(
        `Pipeline abgeschlossen: ${report.qualityTasks.length} Aufgabe(n)${errs ? `, ${errs} Fehler` : ""}.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-accent" />
            Meldung
          </DialogTitle>
        </DialogHeader>

        {reportQ.isLoading && <LoadingState />}
        {reportQ.error && <ErrorState error={reportQ.error} />}
        {r && (
          <div className="space-y-5">
            <Section title="1 · Gemeldetes Problem">
              <div className="text-sm">{REPORT_TYPE_LABELS[r.report_type]}</div>
            </Section>

            <Section title="2 · Betroffener Praxisfall">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">{r.case_title ?? <span className="text-muted-foreground">— ohne Fallbezug</span>}</div>
                {r.case_id && (
                  <Link
                    to="/admin/faelle/$id"
                    params={{ id: r.case_id }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Praxisfall im Core Builder öffnen
                  </Link>
                )}
              </div>
              {dupQ.data && dupQ.data > 0 ? (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  Zu diesem Praxisfall existieren {dupQ.data} weitere offene Meldung{dupQ.data === 1 ? "" : "en"}.
                </div>
              ) : null}
            </Section>

            <div className="grid gap-4 sm:grid-cols-2">
              <Section title="3 · Meldetyp">
                <div className="text-sm">{REPORT_TYPE_LABELS[r.report_type]}</div>
              </Section>
              <Section title="4 · Dringlichkeit">
                <div className={`text-sm ${URGENCY_TONE[r.urgency]}`}>{URGENCY_LABELS[r.urgency]}</div>
              </Section>
            </div>

            <Section title="5 · Beschreibung des Nutzers">
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{r.message}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">Eingegangen: {fmtDate(r.created_at)} · Route: {r.route ?? "—"}</p>
            </Section>

            <Section title="6 · Qualitätsstatus des Falls">
              {!r.case_id ? (
                <p className="text-xs text-muted-foreground">Keine Zuordnung – Qualitätsprüfung nicht möglich.</p>
              ) : evalRes ? (
                <QualitySummary evalRes={evalRes} tasks={tasks} />
              ) : (
                <p className="text-xs text-muted-foreground">Noch keine Prüfung ausgeführt.</p>
              )}
              {pipelineReport && (
                <div className="mt-3 space-y-1 text-xs">
                  <div className="text-muted-foreground">
                    Pipeline · {pipelineReport.legal.assigned.length} zugeordnet · {pipelineReport.legal.removed.length} entfernt · {pipelineReport.keywords.assigned} Schlagw. · {pipelineReport.templates.assigned} Vorlagen
                  </div>
                  {pipelineReport.warnings.length > 0 && (
                    <ul className="ml-3 list-disc text-amber-700 dark:text-amber-300">
                      {pipelineReport.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  {pipelineReport.errors.length > 0 && (
                    <ul className="ml-3 list-disc text-red-700 dark:text-red-300">
                      {pipelineReport.errors.slice(0, 5).map((e, i) => <li key={i}>{e.step}: {e.message}</li>)}
                    </ul>
                  )}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => runQuality.mutate()}
                  disabled={runQuality.isPending || !r.case_id}
                >
                  {runQuality.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Qualitätsprüfung starten
                </Button>
                <Link
                  to="/admin/qualitaetsmanager"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Zum Qualitätsmanager
                </Link>
              </div>
            </Section>

            <Section title="11 · Interne Redaktionsnotizen">
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Interne Notiz …" />
              <div className="mt-2 flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}>
                  {saveNotes.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                  Notiz speichern
                </Button>
              </div>
            </Section>

            <Section title="12 · Aktionen">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                <Button type="button" size="sm" variant="outline" disabled={setStatus.isPending || r.status === "in_review"} onClick={() => setStatus.mutate("in_review")}>
                  <ShieldCheck className="h-4 w-4" /> In Prüfung nehmen
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={setStatus.isPending || r.status === "quality_check"} onClick={() => setStatus.mutate("quality_check")}>
                  <Sparkles className="h-4 w-4" /> Qualitätsprüfung
                </Button>
                <Button type="button" size="sm" disabled={setStatus.isPending || r.status === "resolved"} onClick={() => setStatus.mutate("resolved")}>
                  <CheckCircle2 className="h-4 w-4" /> Als erledigt markieren
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={setStatus.isPending || r.status === "rejected"} onClick={() => setStatus.mutate("rejected")}>
                  <XCircle className="h-4 w-4" /> Ablehnen
                </Button>
              </div>
            </Section>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function QualitySummary({ evalRes, tasks }: { evalRes: EvalResult; tasks: QualityTask[] }) {
  const s = statusLabel(evalRes);
  const dot = s.tone === "gruen" ? "bg-emerald-500" : s.tone === "gelb" ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span>{s.label}</span>
        <span className="text-xs text-muted-foreground">· {tasks.length} Aufgabe(n)</span>
      </div>
      {tasks.length > 0 && (
        <ul className="space-y-1 text-xs">
          {tasks.slice(0, 8).map((t) => (
            <li key={`${t.caseId}:${t.code}`} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span>{t.title}</span>
            </li>
          ))}
          {tasks.length > 8 && <li className="text-muted-foreground">… und {tasks.length - 8} weitere</li>}
        </ul>
      )}
    </div>
  );
}
