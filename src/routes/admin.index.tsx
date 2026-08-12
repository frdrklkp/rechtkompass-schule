import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Scale, Link2, FileText, Clock, EyeOff, ArrowRight, Tags, CheckCircle2, FileEdit, Network, AlertTriangle, Sparkles, ShieldCheck, Copy, ListChecks, Radar, Megaphone, CalendarDays, TrendingUp, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listCases, listSources, listTemplates, listKeywords, STATUS_LABELS } from "@/lib/coreBuilder";
import { importDashboardStats } from "@/lib/importJobs";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { useKnowledgeIndex } from "@/lib/knowledgeIndex";
import { useSourceWatcher, markLoginNow, getLastLogin } from "@/lib/sourceWatcher";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  tone?: "primary" | "green" | "amber" | "rose";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    green: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${tones}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

async function loadDashboard() {
  const [cases, sources, templates, keywords, linksHead] = await Promise.all([
    listCases(),
    listSources(),
    listTemplates(),
    listKeywords(),
    supabase.from("case_legal_links").select("id", { count: "exact", head: true }),
  ]);
  return {
    cases,
    sources,
    templates,
    keywords,
    linkCount: linksHead.count ?? 0,
  };
}

function Dashboard() {
  const q = useQuery({ queryKey: ["admin", "dashboard"], queryFn: loadDashboard });
  const ki = useKnowledgeIndex();

  // Capture "seit letztem Login" snapshot once per browser session, then mark now.
  const lastLoginSnapshot = useRef<Date | null>(getLastLogin());
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("rk.loginTracked") === "1") return;
    window.sessionStorage.setItem("rk.loginTracked", "1");
    markLoginNow();
  }, []);
  const sw = useSourceWatcher();
  void lastLoginSnapshot;

  const published = q.data?.cases.filter((c) => c.status === "published").length ?? 0;
  const drafts = q.data?.cases.filter((c) => c.status !== "published").length ?? 0;
  const lastChange = q.data?.cases[0]?.created_at
    ? new Date(q.data.cases[0].created_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Core Builder</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zentrale Übersicht über alle Inhalte des RechtKompass Schule.
        </p>
      </header>

      {/* Vorschau: Teacher App (kein Redaktionsbereich) */}
      <Link
        to="/navigator"
        className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary"
      >
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">Entscheidungsnavigator testen</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Öffnet die Teacher App zur Vorschau. Der Core Builder bleibt Redaktions- und
            Verwaltungsbereich.
          </p>
        </div>
      </Link>

      {q.isLoading && <LoadingState />}
      {q.error && <ErrorState error={q.error} />}
      {q.data && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={BookOpen} label="Praxisfälle" value={q.data.cases.length} sub="in der Datenbank" />
            <StatCard icon={Scale} label="Rechtsgrundlagen" value={q.data.sources.length} tone="green" sub="Gesetze / Verordnungen" />
            <StatCard icon={Link2} label="Rechtsverknüpfungen" value={q.data.linkCount} tone="amber" sub="Fall ↔ Rechtsabschnitt" />
            <StatCard icon={FileText} label="Dokumentationsvorlagen" value={q.data.templates.length} tone="rose" sub="Formulare" />
            <StatCard icon={Tags} label="Schlagwörter" value={q.data.keywords.length} sub="Suchbegriffe" />
            <StatCard icon={CheckCircle2} label="Veröffentlichte Inhalte" value={published} tone="green" sub="Fälle im Livebetrieb" />
            <StatCard icon={FileEdit} label="Entwürfe" value={drafts} tone="amber" sub="in Bearbeitung / Prüfung" />
            <StatCard icon={Clock} label="Letzte Änderung" value={lastChange} tone="rose" sub="jüngste Bearbeitung" />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Letzte Änderungen</h2>
                </div>
                <Link to="/admin/aenderungen" className="text-xs text-primary hover:underline">
                  alle ansehen
                </Link>
              </header>
              {q.data.cases.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="Noch keine Praxisfälle"
                    description="Lege den ersten Praxisfall an, um hier eine Änderungsliste zu sehen."
                    action={
                      <Link
                        to="/admin/faelle/$id"
                        params={{ id: "neu" }}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                      >
                        Praxisfall erstellen
                      </Link>
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {q.data.cases.slice(0, 6).map((c) => (
                    <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.category ?? "—"} · {STATUS_LABELS[c.status] ?? c.status}
                        </div>
                      </div>
                      <Link
                        to="/admin/faelle/$id"
                        params={{ id: c.id }}
                        className="ml-4 text-xs text-primary hover:underline"
                      >
                        öffnen
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Noch nicht veröffentlicht</h2>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                  {q.data.cases.filter((c) => c.status !== "published").length} Einträge
                </span>
              </header>
              {q.data.cases.filter((c) => c.status !== "published").length === 0 ? (
                <div className="p-5">
                  <EmptyState title="Alles veröffentlicht" description="Es liegen keine Entwürfe oder Prüfungen vor." />
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {q.data.cases
                    .filter((c) => c.status !== "published")
                    .slice(0, 6)
                    .map((c) => (
                      <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {STATUS_LABELS[c.status] ?? c.status}
                          </div>
                        </div>
                        <Link
                          to="/admin/faelle/$id"
                          params={{ id: c.id }}
                          className="ml-4 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          bearbeiten <ArrowRight className="h-3 w-3" />
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>

          {/* 📊 Import-Status */}
          <ImportStatusPanel />

          {/* 📢 Quellenwächter – Seit letztem Login */}
          <SinceLastLoginPanel />

          {/* 📅 Heute empfohlen + Monatsübersicht */}
          <DailyMonthlyPanel />


          {/* 🕸 Wissensbasis / Digitaler Zwilling */}
          <KnowledgeBasePanel />

          {/* 🤖 Qualitätsmanager – Zusammenfassung */}
          <QualityManagerPanel />
        </>
      )}
    </div>
  );

  function ImportStatusPanel() {
    const iq = useQuery({ queryKey: ["admin", "import-dashboard"], queryFn: importDashboardStats });
    if (iq.isLoading || !iq.data) return null;
    const d = iq.data;
    return (
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Import-Status</h2>
          </div>
          <Link to="/admin/import-protokoll" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Import-Protokoll öffnen <ArrowRight className="h-3 w-3" />
          </Link>
        </header>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <MiniStat icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Quellen importiert" value={`${d.sourcesImported} / ${d.sourcesTotal}`} />
          <MiniStat icon={<ListChecks className="h-3.5 w-3.5" />} label="Import-Jobs" value={d.totalJobs} />
          <MiniStat icon={<Sparkles className="h-3.5 w-3.5" />} label="KI-Wissenskarten" value={d.enrichedCards} />
          <MiniStat icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Erfolgreich" value={`${d.successRate}%`} />
          <MiniStat icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Fehler" value={d.errors} />
        </div>
      </section>
    );
  }

  function SinceLastLoginPanel() {
    if (!sw.report) return null;
    const items = sw.report.sinceLastLogin.slice(0, 8);
    return (
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Seit Ihrem letzten Login</h2>
          </div>
          <Link
            to="/admin/quellenwaechter"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Quellenwächter öffnen <ArrowRight className="h-3 w-3" />
          </Link>
        </header>
        {items.length === 0 ? (
          <div className="p-5 text-xs text-muted-foreground">
            Keine neuen Meldungen. {sw.report.lastLogin && `Letzter Login: ${sw.report.lastLogin.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}.`}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span
                  className={`h-2 w-2 rounded-full ${
                    c.priority === "high"
                      ? "bg-rose-500"
                      : c.priority === "medium"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{c.title}</div>
                  <div className="truncate text-[11px] italic text-muted-foreground">
                    Betroffen: {c.impact.cases} Fälle · {c.impact.templates} Vorlagen · {c.impact.faqs} FAQ
                  </div>
                </div>
                {c.to && (
                  <Link
                    to={c.to as any}
                    params={c.params as any}
                    className="text-xs text-primary hover:underline"
                  >
                    öffnen
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  function DailyMonthlyPanel() {
    if (!sw.report) return null;
    const d = sw.report.daily;
    const m = sw.report.monthly;
    return (
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-5 py-3">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Heute empfohlen</h2>
          </header>
          <ul className="divide-y divide-border text-sm">
            <TodoRow label="Rechtsänderungen prüfen" count={d.changesHigh} to="/admin/quellenwaechter" />
            <TodoRow label="Praxisfälle aktualisieren" count={d.casesToRefresh} to="/admin/qualitaet" />
            <TodoRow label="Dokumentvorlage ergänzen" count={d.templatesToRefresh} to="/admin/vorlagen" />
            <TodoRow label="Wissenskarten überprüfen" count={d.cardsToReview} to="/admin/quellenwaechter" />
            <TodoRow label="Offene KI-Vorschläge prüfen" count={d.openAiSuggestions} to="/admin/qualitaet" />
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-5 py-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Im letzten Monat</h2>
          </header>
          <div className="grid grid-cols-2 gap-3 p-4">
            <MiniStat icon={<Radar className="h-3.5 w-3.5" />} label="Rechtsänderungen erkannt" value={m.detectedChanges} />
            <MiniStat icon={<FileEdit className="h-3.5 w-3.5" />} label="Praxisfälle aktualisiert" value={m.updatedCases} />
            <MiniStat icon={<Scale className="h-3.5 w-3.5" />} label="Neue Rechtsabschnitte" value={m.newSections} />
            <MiniStat icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Inhalte aktuell" value={`${m.freshnessPct}%`} />
          </div>
        </div>
      </section>
    );
  }

  function QualityManagerPanel() {
    if (!ki.index) return null;
    const o = ki.index.overall;
    const topTasks = ki.index.tasks.slice(0, 5);
    return (
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Qualitätsmanager (KI)</h2>
          </div>
          <Link
            to="/admin/qualitaet"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            alle Analysen öffnen <ArrowRight className="h-3 w-3" />
          </Link>
        </header>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Gesamtqualität" value={`${o.avgQuality}%`} />
          <MiniStat icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Vertrauensindex ∅" value={`${o.avgTrust}%`} />
          <MiniStat icon={<ListChecks className="h-3.5 w-3.5" />} label="Offene Aufgaben" value={o.openTasks} />
          <MiniStat icon={<Copy className="h-3.5 w-3.5" />} label="Dubletten / Lücken" value={`${o.duplicateCount} / ${o.gapCount}`} />
        </div>
        {topTasks.length === 0 ? (
          <div className="p-5 text-xs text-muted-foreground">
            Keine offenen Aufgaben – die Wissensbasis ist vollständig verknüpft.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {topTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                    t.priority === "high"
                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                      : t.priority === "medium"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t.priority === "high" ? "hoch" : t.priority === "medium" ? "mittel" : "niedrig"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{t.title}</div>
                  <div className="truncate text-[11px] italic text-muted-foreground">{t.reason}</div>
                </div>
                {t.to && (
                  <Link
                    to={t.to as any}
                    params={t.params as any}
                    className="text-xs text-primary hover:underline"
                  >
                    öffnen
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  function KnowledgeBasePanel() {
    if (!ki.index) {
      return (
        <section className="rounded-xl border border-border bg-card p-5">
          <header className="mb-3 flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Wissensbasis</h2>
          </header>
          <p className="text-xs text-muted-foreground">Digitaler Zwilling wird geladen …</p>
        </section>
      );
    }
    const orphSections = ki.index.orphansByKind.section;
    const orphTemplates = ki.index.orphansByKind.template;
    const orphKeywords = ki.index.orphansByKind.keyword;
    const orphCases = ki.index.orphansByKind.case;
    const lowQuality = [...ki.index.qualityByCase.values()]
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 5);

    return (
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Wissensbasis (Digitaler Zwilling)</h2>
          </div>
          <Link
            to="/admin/knowledge-graph"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Knowledge Graph öffnen <ArrowRight className="h-3 w-3" />
          </Link>
        </header>
        <p className="text-xs text-muted-foreground">
          Zeigt fehlende oder ungenutzte Inhalte. Jede Information wird an einer Stelle gepflegt
          und überall wiederverwendet.
        </p>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <OrphanCard
            icon={<Scale className="h-4 w-4" />}
            title="Verwaiste Rechtsgrundlagen"
            hint="ohne verknüpften Praxisfall"
            items={orphSections.map((n) => ({
              id: n.id,
              label: n.label,
              to: n.editorTo,
              params: n.editorParams,
            }))}
          />
          <OrphanCard
            icon={<FileText className="h-4 w-4" />}
            title="Verwaiste Vorlagen"
            hint="keinem Fall zugeordnet"
            items={orphTemplates.map((n) => ({
              id: n.id,
              label: n.label,
              to: n.editorTo,
              params: n.editorParams,
            }))}
          />
          <OrphanCard
            icon={<Tags className="h-4 w-4" />}
            title="Ungenutzte Schlagwörter"
            hint="in keinem Fall verwendet"
            items={orphKeywords.map((n) => ({
              id: n.id,
              label: n.label,
              to: n.editorTo,
              params: n.editorParams,
            }))}
          />
          <OrphanCard
            icon={<BookOpen className="h-4 w-4" />}
            title="Praxisfälle ohne Rechtsgrundlage"
            hint="Fälle ganz ohne Verknüpfungen"
            items={orphCases.map((n) => ({
              id: n.id,
              label: n.label,
              to: n.editorTo,
              params: n.editorParams,
            }))}
          />
        </div>

        <div className="rounded-xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-5 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Fälle mit den größten Lücken</h3>
          </header>
          {lowQuality.length === 0 ? (
            <div className="p-5 text-xs text-muted-foreground">Noch keine Praxisfälle vorhanden.</div>
          ) : (
            <ul className="divide-y divide-border">
              {lowQuality.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      Fehlt: {c.missing.slice(0, 4).join(", ") || "—"}
                      {c.missing.length > 4 ? ` · +${c.missing.length - 4}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${
                          c.pct >= 80
                            ? "bg-emerald-500"
                            : c.pct >= 50
                              ? "bg-amber-500"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                      {c.pct}%
                    </span>
                    <Link
                      to="/admin/faelle/$id"
                      params={{ id: c.id }}
                      className="text-xs text-primary hover:underline"
                    >
                      öffnen
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }
}

function OrphanCard({
  icon,
  title,
  hint,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  items: { id: string; label: string; to?: string; params?: Record<string, string> }[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {title}
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {items.length}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>
      {items.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">Alles verknüpft.</p>
      ) : (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1 text-xs">
          {items.slice(0, 15).map((n) =>
            n.to ? (
              <li key={n.id} className="truncate">
                <Link
                  to={n.to as any}
                  params={n.params as any}
                  className="text-primary hover:underline"
                >
                  {n.label}
                </Link>
              </li>
            ) : (
              <li key={n.id} className="truncate text-muted-foreground">
                {n.label}
              </li>
            ),
          )}
          {items.length > 15 && (
            <li className="text-[11px] italic text-muted-foreground">
              … +{items.length - 15} weitere
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TodoRow({ label, count, to }: { label: string; count: number; to: string }) {
  return (
    <li className="flex items-center justify-between px-5 py-2.5">
      <div className="flex items-center gap-2">
        <CheckCircle2
          className={`h-3.5 w-3.5 ${count > 0 ? "text-primary" : "text-muted-foreground"}`}
        />
        <span className={count > 0 ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
            count > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
        {count > 0 && (
          <Link to={to as any} className="text-[11px] text-primary hover:underline">
            öffnen
          </Link>
        )}
      </div>
    </li>
  );
}
