// Quality Center – URL-persistierte Filter, Sortierung, Aging-Sichtbarkeit.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import {
  useQualityCases,
  useQualityDashboard,
} from "@/hooks/editorial/useQuality";
import { QualitySummaryCard } from "@/components/editorial/quality/QualitySummaryCard";
import { ReadinessBadge } from "@/components/editorial/quality/ReadinessBadge";
import { AgingBadge } from "@/components/editorial/quality/AgingBadge";
import { WorkflowBadge } from "@/components/editorial/badges";
import {
  GRADE_LABEL,
  READINESS_LABEL,
  type PublishReadinessStatus,
  type QualityGrade,
} from "@/services/editorial/quality";
import { cn } from "@/lib/utils";

const READINESS_KEYS = [
  "ready",
  "ready_with_warnings",
  "blocked",
  "not_assessable",
] as const;
const GRADES: QualityGrade[] = ["A", "B", "C", "D", "F", "ungraded"];

const AGING_KEYS = ["current", "review_recommended", "outdated"] as const;

const sortFieldSchema = z.enum(["updated_at", "title"]).default("updated_at");
const sortDirSchema = z.enum(["asc", "desc"]).default("desc");

const searchSchema = z.object({
  readiness: z.array(z.enum(READINESS_KEYS)).default([]),
  grade: z.array(z.enum(["A", "B", "C", "D", "E", "F", "ungraded"])).default([]),
  aging: z.array(z.enum(AGING_KEYS)).default([]),
  blockers: z.coerce.boolean().default(false),
  warnings: z.coerce.boolean().default(false),
  missingLegal: z.coerce.boolean().default(false),
  sort: sortFieldSchema,
  dir: sortDirSchema,
  page: z.coerce.number().int().min(1).default(1),
});

type SearchIn = z.input<typeof searchSchema>;
type SortField = z.infer<typeof sortFieldSchema>;
type SortDir = z.infer<typeof sortDirSchema>;

export const Route = createFileRoute("/admin/editorial/qualitaet")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Quality Center · RechtsKompass Redaktion" },
      {
        name: "description",
        content:
          "Deterministische Qualitätsübersicht aller redaktionellen Fälle mit Sortierung, Filter und redaktioneller Alterung.",
      },
    ],
  }),
  component: QualityCenter,
});

// Aus der Route abgeleitete, vollständig validierte Search-Form.
type SearchOut = ReturnType<typeof Route.useSearch>;

function QualityCenter() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/editorial/qualitaet" });

  const patch = (p: Partial<SearchIn>) =>
    navigate({ to: ".", search: (prev: SearchOut) => ({ ...prev, page: 1, ...p }) });

  const dash = useQualityDashboard();
  const list = useQualityCases({
    filters: {
      readiness: search.readiness.length
        ? (search.readiness as PublishReadinessStatus[])
        : undefined,
      grade: search.grade.length ? search.grade : undefined,
      missingLegal: search.missingLegal,
      hasBlockers: search.blockers,
      hasWarnings: search.warnings,
    },
    pagination: { page: search.page, pageSize: 20 },
    sorting: { field: search.sort, direction: search.dir },
  });

  const filteredRows = useMemo(() => {
    if (!list.data) return [];
    if (search.aging.length === 0) return list.data.rows;
    return list.data.rows.filter((r) =>
      search.aging.includes(r.assessment.agingLevel),
    );
  }, [list.data, search.aging]);

  const toggleArray = <T extends string>(
    field: "readiness" | "grade" | "aging",
    v: T,
  ) => {
    const cur = (search[field] as string[]) ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    patch({ [field]: next } as Partial<SearchIn>);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Quality Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deterministische Qualitätsbewertung. Kein KI-Einsatz. Alle Filter
          werden in der URL persistiert und sind teilbar.
        </p>
      </header>

      {/* Kennzahlen */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dash.isLoading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : dash.data ? (
          <>
            <Kpi
              label="Ø Score"
              value={`${dash.data.avgPercentage}%`}
              hint={`${dash.data.totalAssessed} Fälle geprüft`}
            />
            <Kpi
              label={READINESS_LABEL.ready}
              value={dash.data.ready}
              tone="emerald"
            />
            <Kpi
              label={READINESS_LABEL.ready_with_warnings}
              value={dash.data.readyWithWarnings}
              tone="amber"
            />
            <Kpi
              label={READINESS_LABEL.blocked}
              value={dash.data.blocked}
              tone="rose"
            />
          </>
        ) : null}
      </section>

      {/* Filter */}
      <section className="rounded-xl border border-border bg-card p-3 text-xs">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <FilterChips
            label="Veröffentlichungsstatus"
            values={READINESS_KEYS}
            labels={Object.fromEntries(
              READINESS_KEYS.map((k) => [k, READINESS_LABEL[k]]),
            )}
            selected={search.readiness}
            onToggle={(v) => toggleArray("readiness", v)}
          />
          <FilterChips
            label="Note"
            values={GRADES}
            labels={Object.fromEntries(GRADES.map((g) => [g, GRADE_LABEL[g]]))}
            selected={search.grade}
            onToggle={(v) => toggleArray("grade", v)}
          />
          <FilterChips
            label="Redaktionelle Alterung"
            values={AGING_KEYS}
            labels={{
              current: "Aktuell",
              review_recommended: "Prüfung empfohlen",
              outdated: "Überfällig",
            }}
            selected={search.aging}
            onToggle={(v) => toggleArray("aging", v)}
          />
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Signalfilter</span>
            <div className="flex flex-wrap gap-1">
              <Toggle
                label="Blocker vorhanden"
                active={search.blockers}
                onClick={() => patch({ blockers: !search.blockers })}
              />
              <Toggle
                label="Warnungen vorhanden"
                active={search.warnings}
                onClick={() => patch({ warnings: !search.warnings })}
              />
              <Toggle
                label="Rechtsgrundlage fehlt"
                active={search.missingLegal}
                onClick={() => patch({ missingLegal: !search.missingLegal })}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Sortierung:</span>
            <SortButton
              label="Zuletzt aktualisiert"
              field="updated_at"
              activeField={search.sort}
              dir={search.dir}
              onClick={(f, d) => patch({ sort: f, dir: d })}
            />
            <SortButton
              label="Titel"
              field="title"
              activeField={search.sort}
              dir={search.dir}
              onClick={(f, d) => patch({ sort: f, dir: d })}
            />
          </div>
          {(search.readiness.length ||
            search.grade.length ||
            search.aging.length ||
            search.blockers ||
            search.warnings ||
            search.missingLegal) && (
            <button
              type="button"
              onClick={() =>
                navigate({
                  search: {
                    readiness: [],
                    grade: [],
                    aging: [],
                    blockers: false,
                    warnings: false,
                    missingLegal: false,
                    sort: "updated_at",
                    dir: "desc",
                    page: 1,
                  },
                })
              }
              className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
            >
              Alle Filter zurücksetzen
            </button>
          )}
        </div>
      </section>

      {/* Liste */}
      <section>
        {list.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : filteredRows.length > 0 ? (
          <div className="space-y-2">
            {filteredRows.map((r) => (
              <Link
                key={r.case.id}
                to="/admin/editorial/faelle/$id"
                params={{ id: r.case.id }}
                search={{}}
                className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:bg-muted/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {r.case.title}
                      </span>
                      <WorkflowBadge status={r.case.workflow_status} />
                      <ReadinessBadge
                        status={r.assessment.readinessStatus}
                        compact
                      />
                      <AgingBadge level={r.assessment.agingLevel} compact />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.case.category ?? "—"}
                      {r.case.subcategory ? ` · ${r.case.subcategory}` : ""}
                      {" · "}
                      {r.assessment.blockers.length} Blocker ·{" "}
                      {r.assessment.warnings.length} Warnungen
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums">
                      {r.assessment.percentage}%
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Note{" "}
                      {r.assessment.grade === "ungraded"
                        ? "—"
                        : r.assessment.grade}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            <Pagination
              page={search.page}
              setPage={(p) => navigate({ to: ".", search: (prev: SearchOut) => ({ ...prev, page: p }) })}
              total={list.data?.total ?? 0}
              shown={filteredRows.length}
              pageSize={20}
            />
          </div>
        ) : (
          <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Keine Fälle entsprechen den aktuellen Filtern.
          </p>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "emerald" | "amber" | "rose";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "rose"
          ? "text-rose-700 dark:text-rose-300"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", cls)}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function FilterChips<T extends string>({
  label,
  values,
  labels,
  selected,
  onToggle,
}: {
  label: string;
  values: readonly T[];
  labels: Record<string, string>;
  selected: readonly T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Toggle
            key={v}
            label={labels[v]}
            active={selected.includes(v)}
            onClick={() => onToggle(v)}
          />
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-0.5 text-[11px]",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:bg-muted",
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function SortButton({
  label,
  field,
  activeField,
  dir,
  onClick,
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  dir: SortDir;
  onClick: (f: SortField, d: SortDir) => void;
}) {
  const active = field === activeField;
  const nextDir: SortDir = active && dir === "desc" ? "asc" : "desc";
  const Icon = active && dir === "asc" ? ArrowUpAZ : ArrowDownAZ;
  return (
    <button
      type="button"
      onClick={() => onClick(field, nextDir)}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
      <Icon className="h-3 w-3" aria-hidden />
    </button>
  );
}

function Pagination({
  page,
  setPage,
  total,
  shown,
  pageSize,
}: {
  page: number;
  setPage: (p: number) => void;
  total: number;
  shown: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        Seite {page} von {pages} · {shown} angezeigt · {total} gesamt
      </span>
      <div className="flex gap-1">
        <button
          className="rounded-md border border-border px-2 py-0.5 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          ← Zurück
        </button>
        <button
          className="rounded-md border border-border px-2 py-0.5 disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Weiter →
        </button>
      </div>
    </div>
  );
}

// QualitySummaryCard bleibt für Detailseite exportiert.
export { QualitySummaryCard };
