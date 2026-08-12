import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShieldCheck,
  Search,
  RefreshCw,
  ArrowRight,
  CircleDot,
  ScrollText,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Pencil,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSourceWatcher,
  markCheckedNow,
  dismissChange,
  type ChangeEntry,
  type SourceStatus,
} from "@/lib/sourceWatcher";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/DataStates";

export const Route = createFileRoute("/admin/quellenwaechter")({
  component: QuellenwaechterPage,
});

const STATUS_META: Record<SourceStatus, { label: string; dot: string; text: string }> = {
  green: {
    label: "aktuell",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  yellow: {
    label: "Prüfung empfohlen",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  red: {
    label: "Aktualisierung erforderlich",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
  },
};

const KIND_LABEL: Record<ChangeEntry["kind"], string> = {
  "new-section": "Neuer Abschnitt",
  "updated-section": "Geänderter Abschnitt",
  "stale-section": "Prüfung überfällig",
  "orphan-section": "Ohne Verknüpfung",
  "missing-source": "Fehlende Rechtsgrundlage",
  "new-source": "Neue Quelle",
};

const PRIO_META = {
  high: { label: "hoch", class: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  medium: { label: "mittel", class: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  low: { label: "niedrig", class: "bg-muted text-muted-foreground" },
} as const;

function QuellenwaechterPage() {
  const { report, isLoading } = useSourceWatcher();
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState<ChangeEntry | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  async function handleCheck() {
    setChecking(true);
    // Force reload of underlying data, then update timestamp
    await qc.invalidateQueries({ queryKey: ["knowledge-index"] });
    markCheckedNow();
    setRefreshTick((t) => t + 1);
    setChecking(false);
  }

  function handleDismiss(entry: ChangeEntry) {
    dismissChange(entry.id);
    setSelected(null);
    setRefreshTick((t) => t + 1);
  }

  return (
    <div className="space-y-8" key={refreshTick}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Quellenwächter
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Rechtsquellen überwachen
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Erkennt Änderungen offizieller Rechtsquellen, analysiert deren Auswirkungen und
            erstellt redaktionelle Aktualisierungsvorschläge. Es erfolgt keine automatische
            Veröffentlichung – jede Übernahme wird redaktionell freigegeben.
          </p>
        </div>
        <Button onClick={handleCheck} disabled={checking} className="shrink-0">
          {checking ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Auf Änderungen prüfen
        </Button>
      </header>

      {isLoading || !report ? (
        <LoadingState />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <MetaCard
              icon={<Clock3 className="h-4 w-4" />}
              label="Letzte Prüfung"
              value={
                report.lastCheck
                  ? report.lastCheck.toLocaleString("de-DE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "noch nie"
              }
            />
            <MetaCard
              icon={<ScrollText className="h-4 w-4" />}
              label="Erkannte Änderungen"
              value={report.changes.length}
            />
            <MetaCard
              icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
              label="Hoch priorisiert"
              value={report.changes.filter((c) => c.priority === "high").length}
            />
            <MetaCard
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Quellen aktuell"
              value={`${report.sources.filter((s) => s.status === "green").length}/${report.sources.length}`}
            />
          </section>

          <section className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Überwachte Rechtsquellen</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {report.sources.length} Quellen · Single Source of Truth
              </span>
            </header>
            {report.sources.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                Noch keine Rechtsquellen hinterlegt.{" "}
                <Link to="/admin/rechtsgrundlagen" className="text-primary hover:underline">
                  Quelle anlegen
                </Link>
                .
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {report.sources.map((s) => {
                  const meta = STATUS_META[s.status];
                  return (
                    <li key={s.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {s.shortName || s.name}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {s.sectionCount} Abschnitte
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.name} · {s.scope ?? "Geltungsbereich unbekannt"}
                        </div>
                      </div>
                      <div className="hidden text-right text-xs sm:block">
                        <div className={`font-medium ${meta.text}`}>{meta.label}</div>
                        <div className="text-muted-foreground">
                          {s.lastCheck
                            ? `zuletzt: ${s.lastCheck.toLocaleDateString("de-DE")}`
                            : "keine Prüfung"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Änderungsbericht</h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  {report.changes.length} Vorschläge
                </span>
              </header>
              {report.changes.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Keine Änderungen erkannt. Die Wissensbasis ist aktuell.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {report.changes.map((c) => (
                    <li
                      key={c.id}
                      className={`cursor-pointer px-5 py-3 text-sm transition-colors hover:bg-muted/50 ${
                        selected?.id === c.id ? "bg-muted/70" : ""
                      }`}
                      onClick={() => setSelected(c)}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${PRIO_META[c.priority].class}`}
                        >
                          {PRIO_META[c.priority].label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{c.title}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                              {KIND_LABEL[c.kind]}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {c.diffSummary}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Betroffen: {c.impact.cases} Fälle · {c.impact.templates} Vorlagen ·{" "}
                            {c.impact.faqs} FAQ · {c.impact.checks} Checklisten
                          </p>
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">
                          {c.detectedAt.toLocaleDateString("de-DE")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Vorschlag prüfen</h2>
                </div>
                {selected && (
                  <span className="text-[11px] text-muted-foreground">
                    {selected.detectedAt.toLocaleString("de-DE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                )}
              </header>
              {!selected ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Wähle links einen Eintrag, um Alt/Neu, Auswirkung und Handlungsoptionen zu
                  sehen.
                </div>
              ) : (
                <div className="space-y-4 p-5 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {KIND_LABEL[selected.kind]}
                    </div>
                    <div className="text-base font-semibold">{selected.title}</div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DiffBlock label="Alt" content={selected.before ?? "—"} tone="rose" />
                    <DiffBlock label="Neu" content={selected.after ?? "—"} tone="emerald" />
                  </div>

                  <InfoRow label="Was hat sich geändert?">{selected.diffSummary}</InfoRow>
                  <InfoRow label="Warum erkannt?">{selected.reason}</InfoRow>

                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                    <div className="mb-1 font-medium text-foreground">Auswirkungen</div>
                    <div className="grid grid-cols-2 gap-y-1 sm:grid-cols-4">
                      <ImpactChip label="Praxisfälle" value={selected.impact.cases} />
                      <ImpactChip label="Vorlagen" value={selected.impact.templates} />
                      <ImpactChip label="FAQ" value={selected.impact.faqs} />
                      <ImpactChip label="Checklisten" value={selected.impact.checks} />
                    </div>
                    {selected.affectedCases.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {selected.affectedCases.slice(0, 5).map((c) => (
                          <li key={c.id} className="flex items-center gap-1.5 truncate">
                            <CircleDot className="h-3 w-3 text-muted-foreground" />
                            <Link
                              to="/admin/faelle/$id"
                              params={{ id: c.id }}
                              className="truncate text-primary hover:underline"
                            >
                              {c.title}
                            </Link>
                          </li>
                        ))}
                        {selected.affectedCases.length > 5 && (
                          <li className="text-muted-foreground">
                            … und {selected.affectedCases.length - 5} weitere
                          </li>
                        )}
                      </ul>
                    )}
                  </div>

                  <InfoRow label="KI-Vorschlag">{selected.suggestion}</InfoRow>

                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    {selected.to && (
                      <Link
                        to={selected.to as any}
                        params={selected.params as any}
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Übernehmen (im Editor)
                      </Link>
                    )}
                    {selected.to && (
                      <Link
                        to={selected.to as any}
                        params={selected.params as any}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Bearbeiten
                      </Link>
                    )}
                    <button
                      onClick={() => handleDismiss(selected)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Verwerfen
                    </button>
                    <span className="ml-auto self-center text-[11px] italic text-muted-foreground">
                      Fachliche Entscheidung bleibt bei der Redaktion.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Der Quellenwächter arbeitet auf derselben Wissensbasis wie KI-Redaktionsassistent,
                Qualitätsmanager, Knowledge Graph und Lehrer-App. Externe Quellenanbindungen
                (BASS NRW, recht.nrw.de, EUR-Lex, Bundesgesetzblatt, KMK …) lassen sich später
                ohne UI-Änderung anschließen. Prüfintervalle (täglich / wöchentlich / manuell)
                werden künftig konfigurierbar.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function DiffBlock({
  label,
  content,
  tone,
}: {
  label: string;
  content: string;
  tone: "rose" | "emerald";
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-500/30 bg-rose-500/5"
      : "border-emerald-500/30 bg-emerald-500/5";
  const badgeClass =
    tone === "rose"
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div
        className={`mb-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${badgeClass}`}
      >
        {label}
      </div>
      <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
        {content || "—"}
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs">
      <div className="mb-0.5 font-medium text-muted-foreground">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

function ImpactChip({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
