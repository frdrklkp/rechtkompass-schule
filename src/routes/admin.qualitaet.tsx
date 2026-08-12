import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Lightbulb,
  ListChecks,
  ArrowRight,
  Info,
  TrendingUp,
} from "lucide-react";
import { useKnowledgeIndex } from "@/lib/knowledgeIndex";
import { LoadingState, ErrorState } from "@/components/DataStates";

export const Route = createFileRoute("/admin/qualitaet")({
  component: QualityManager,
});

function Bar({ pct, tone }: { pct: number; tone?: "quality" | "trust" }) {
  const color =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 50
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "primary",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "primary" | "green" | "amber" | "rose";
  icon: React.ComponentType<{ className?: string }>;
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

function QualityManager() {
  const ki = useKnowledgeIndex();
  const [tab, setTab] = useState<"tasks" | "trust" | "duplicates" | "gaps" | "suggestions">(
    "tasks",
  );

  if (ki.isLoading) return <LoadingState />;
  if (ki.error) return <ErrorState error={ki.error as Error} />;
  if (!ki.index) return null;

  const idx = ki.index;
  const trustSorted = [...idx.trustByCase.values()].sort((a, b) => a.pct - b.pct);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Redaktion
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="h-5 w-5 text-primary" />
          Qualitätsmanager
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Die KI analysiert ausschließlich die eigene, redaktionell freigegebene Wissensbasis.
          Sie erkennt Lücken, Dubletten und Verbesserungspotenzial — verändert aber niemals
          Inhalte selbstständig. Alle Vorschläge bleiben freigabepflichtig.
        </p>
      </header>

      {/* Gesamt-Metriken */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={TrendingUp}
          label="Gesamtqualität"
          value={`${idx.overall.avgQuality}%`}
          sub={`${idx.overall.completeCases} vollständig · ${idx.overall.incompleteCases} unvollständig`}
          tone="green"
        />
        <Metric
          icon={ShieldCheck}
          label="Vertrauensindex ∅"
          value={`${idx.overall.avgTrust}%`}
          sub="Fachliche Belastbarkeit"
          tone="primary"
        />
        <Metric
          icon={ListChecks}
          label="Offene Aufgaben"
          value={idx.overall.openTasks}
          sub="automatisch generiert"
          tone="amber"
        />
        <Metric
          icon={Copy}
          label="Dubletten / Lücken"
          value={`${idx.overall.duplicateCount} / ${idx.overall.gapCount}`}
          sub="ähnliche Inhalte · fehlende Wissenskarten"
          tone="rose"
        />
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 text-xs">
        {[
          { k: "tasks", label: `Aufgaben (${idx.tasks.length})`, icon: ListChecks },
          { k: "trust", label: `Vertrauensindex (${trustSorted.length})`, icon: ShieldCheck },
          { k: "duplicates", label: `Dubletten (${idx.duplicates.length})`, icon: Copy },
          { k: "gaps", label: `Wissenslücken (${idx.gaps.length})`, icon: AlertTriangle },
          {
            k: "suggestions",
            label: "Verbesserungsvorschläge",
            icon: Lightbulb,
          },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k as any)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "tasks" && <TasksView tasks={idx.tasks} />}
      {tab === "trust" && <TrustView trust={trustSorted} />}
      {tab === "duplicates" && <DuplicatesView duplicates={idx.duplicates} />}
      {tab === "gaps" && <GapsView gaps={idx.gaps} />}
      {tab === "suggestions" && <SuggestionsView idx={idx} />}
    </div>
  );
}

function TasksView({ tasks }: { tasks: ReturnType<typeof useKnowledgeIndex>["index"] extends null ? never : NonNullable<ReturnType<typeof useKnowledgeIndex>["index"]>["tasks"] }) {
  if (tasks.length === 0)
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Keine offenen redaktionellen Aufgaben. Die Wissensbasis ist vollständig verknüpft.
      </div>
    );
  const priTone = {
    high: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    low: "bg-muted text-muted-foreground",
  } as const;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-3 px-5 py-3">
          <span
            className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${priTone[t.priority]}`}
          >
            {t.priority === "high" ? "hoch" : t.priority === "medium" ? "mittel" : "niedrig"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{t.title}</div>
            <div className="truncate text-xs text-muted-foreground">{t.hint}</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] italic text-muted-foreground">
              <Info className="h-3 w-3" /> {t.reason}
            </div>
          </div>
          {t.to && (
            <Link
              to={t.to as any}
              params={t.params as any}
              className="inline-flex items-center gap-1 self-center text-xs text-primary hover:underline"
            >
              öffnen <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function TrustView({ trust }: { trust: NonNullable<ReturnType<typeof useKnowledgeIndex>["index"]>["trustByCase"] extends Map<any, infer V> ? V[] : never }) {
  if (trust.length === 0)
    return <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Noch keine Praxisfälle.</div>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {trust.map((t) => (
        <li key={t.id} className="grid gap-2 px-5 py-3 md:grid-cols-[1fr_auto_auto] md:items-start">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{t.title}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
              {t.positives.slice(0, 4).map((p, i) => (
                <span key={`p${i}`} className="text-emerald-600 dark:text-emerald-400">
                  {p}
                </span>
              ))}
              {t.negatives.slice(0, 4).map((n, i) => (
                <span key={`n${i}`} className="text-rose-600 dark:text-rose-400">
                  {n}
                </span>
              ))}
            </div>
          </div>
          <Bar pct={t.pct} />
          <Link
            to="/admin/faelle/$id"
            params={{ id: t.id }}
            className="text-xs text-primary hover:underline md:self-center"
          >
            öffnen
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DuplicatesView({
  duplicates,
}: {
  duplicates: NonNullable<ReturnType<typeof useKnowledgeIndex>["index"]>["duplicates"];
}) {
  if (duplicates.length === 0)
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Keine auffälligen Dubletten erkannt.
      </div>
    );
  const kindLabel: Record<string, string> = {
    case: "Praxisfälle",
    faq: "FAQ",
    template: "Vorlagen",
    keyword: "Schlagwörter",
  };
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {duplicates.map((d, i) => (
        <li key={`${d.aId}-${d.bId}-${i}`} className="px-5 py-3 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {kindLabel[d.kind]}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Ähnlichkeit {(d.score * 100).toFixed(0)}%
            </span>
          </div>
          <div className="grid gap-1 md:grid-cols-2">
            <DupRow label={d.aLabel} to={d.to} params={d.aParams} />
            <DupRow label={d.bLabel} to={d.to} params={d.bParams} />
          </div>
          <p className="mt-1 flex items-center gap-1 text-[11px] italic text-muted-foreground">
            <Info className="h-3 w-3" /> {d.reason} · Diese Inhalte könnten zusammengeführt werden.
            Keine automatische Zusammenführung.
          </p>
        </li>
      ))}
    </ul>
  );
}

function DupRow({
  label,
  to,
  params,
}: {
  label: string;
  to?: string;
  params?: Record<string, string>;
}) {
  if (!to) return <div className="truncate">{label}</div>;
  return (
    <Link
      to={to as any}
      params={params as any}
      className="truncate text-primary hover:underline"
    >
      {label}
    </Link>
  );
}

function GapsView({
  gaps,
}: {
  gaps: NonNullable<ReturnType<typeof useKnowledgeIndex>["index"]>["gaps"];
}) {
  if (gaps.length === 0)
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Keine Wissenslücken erkannt. Für jedes häufig genutzte Schlagwort existiert eine
        Wissenskarte.
      </div>
    );
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {gaps.map((g) => (
        <li key={g.keywordId} className="flex items-start gap-3 px-5 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">Neue Wissenskarte: „{g.keyword}"</div>
            <div className="truncate text-xs text-muted-foreground">{g.reason}</div>
          </div>
          <Link
            to="/admin/faelle/$id"
            params={{ id: "neu" }}
            className="self-center text-xs text-primary hover:underline"
          >
            anlegen
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SuggestionsView({
  idx,
}: {
  idx: NonNullable<ReturnType<typeof useKnowledgeIndex>["index"]>;
}) {
  // Für die 10 Fälle mit den größten Lücken: KI-Vorschläge aus dem Digitalen Zwilling
  const targets = useMemo(
    () =>
      [...idx.qualityByCase.values()]
        .filter((q) => q.pct < 100)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 10),
    [idx],
  );
  if (targets.length === 0)
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Alle Praxisfälle sind vollständig — derzeit keine Verbesserungsvorschläge.
      </div>
    );
  return (
    <div className="space-y-3">
      {targets.map((q) => {
        const sug = idx.suggestionsForCase(q.id);
        return (
          <div key={q.id} className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{q.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  Qualität {q.pct}% · fehlt: {q.missing.slice(0, 3).join(", ") || "—"}
                </div>
              </div>
              <Link
                to="/admin/faelle/$id"
                params={{ id: q.id }}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                bearbeiten <ArrowRight className="h-3 w-3" />
              </Link>
            </header>
            {sug.length === 0 ? (
              <p className="px-5 py-3 text-xs text-muted-foreground">
                Keine passenden Vorschläge aus vergleichbaren Fällen gefunden.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {sug.map((s, i) => (
                  <li key={`${s.kind}-${s.refId}-${i}`} className="flex items-start gap-3 px-5 py-2 text-sm">
                    <span className="mt-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
                      {s.kind === "section"
                        ? "Rechtsgrundlage"
                        : s.kind === "template"
                          ? "Vorlage"
                          : s.kind === "keyword"
                            ? "Schlagwort"
                            : "Ähnlicher Fall"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{s.label}</div>
                      <div className="flex items-center gap-1 text-[11px] italic text-muted-foreground">
                        <Info className="h-3 w-3" /> {s.reason}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
