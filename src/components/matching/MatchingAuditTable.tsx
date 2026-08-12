/**
 * Sprint 4.6E – Bestandsaudit und Filter der Praxisfall-Matching-Übersicht.
 * Reine Darstellung der Auditwerte aus PracticeCaseAuditor.
 */
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MATCH_PROFILE_STATUS_LABELS,
  type CaseIndexState,
  type PracticeCaseAuditFilter,
  type PracticeCaseAuditRow,
  type PracticeCaseInventoryAudit,
} from "@/services/practice-case-matching";

const INDEX_STATE_LABELS: Record<CaseIndexState, string> = {
  indexed: "indexiert",
  stale: "veraltet",
  notIndexed: "nicht indexiert",
  skipped: "übersprungen",
};

const READINESS_LABELS = {
  ready: "bereit",
  partial: "teilweise",
  notReady: "nicht bereit",
} as const;

export function InventoryCards({ inventory }: { inventory: PracticeCaseInventoryAudit }) {
  const cards: Array<{ label: string; value: string | number; hint?: string }> = [
    { label: "Praxisfälle", value: inventory.totalCases, hint: `${inventory.publishedCases} veröffentlicht` },
    { label: "Matching-bereit", value: inventory.matchReady, hint: `${inventory.notIndexable} nicht indexierbar` },
    { label: "Im Index", value: inventory.indexedCount, hint: `${inventory.staleCount} veraltet` },
    { label: "Schlagwortverknüpfungen", value: inventory.keywordLinkCount },
    { label: "Rechtsverknüpfungen", value: inventory.legalLinkCount },
    { label: "Entscheidungsbäume", value: inventory.withDecisionTree },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</div>
          {c.hint && <div className="text-[11px] text-muted-foreground">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}

export function InventoryDistributions({ inventory }: { inventory: PracticeCaseInventoryAudit }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Profilstatus
        </div>
        <ul className="space-y-1 text-xs">
          {inventory.profileStatusDistribution.map((d) => (
            <li key={d.status} className="flex justify-between gap-2">
              <span>{MATCH_PROFILE_STATUS_LABELS[d.status]}</span>
              <span className="tabular-nums text-muted-foreground">{d.count}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Reifegrad
        </div>
        <ul className="space-y-1 text-xs">
          {inventory.readinessDistribution.map((d) => (
            <li key={d.level} className="flex justify-between gap-2">
              <span>{READINESS_LABELS[d.level]}</span>
              <span className="tabular-nums text-muted-foreground">{d.count}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Index
        </div>
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Version</dt>
            <dd>{inventory.indexVersion ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Aufgebaut</dt>
            <dd>
              {inventory.builtAt
                ? new Date(inventory.builtAt).toLocaleString("de-DE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Indexhash</dt>
            <dd className="font-mono text-[10px]">{inventory.indexHash ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Bestandshash</dt>
            <dd className="font-mono text-[10px]">{inventory.inventoryHash}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export interface AuditFilterBarProps {
  filter: PracticeCaseAuditFilter;
  onChange: (next: PracticeCaseAuditFilter) => void;
  categories: string[];
}

export function AuditFilterBar({ filter, onChange, categories }: AuditFilterBarProps) {
  const set = (patch: Partial<PracticeCaseAuditFilter>) => onChange({ ...filter, ...patch });
  const selectCls = "h-8 rounded-md border border-input bg-transparent px-2 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={filter.search ?? ""}
        onChange={(e) => set({ search: e.target.value })}
        placeholder="Titel suchen"
        className="h-8 w-56 text-xs"
      />
      <select
        className={selectCls}
        value={filter.profileStatus ?? "all"}
        onChange={(e) => set({ profileStatus: e.target.value as PracticeCaseAuditFilter["profileStatus"] })}
      >
        <option value="all">Profilstatus: alle</option>
        {(Object.keys(MATCH_PROFILE_STATUS_LABELS) as Array<keyof typeof MATCH_PROFILE_STATUS_LABELS>).map(
          (s) => (
            <option key={s} value={s}>
              {MATCH_PROFILE_STATUS_LABELS[s]}
            </option>
          ),
        )}
      </select>
      <select
        className={selectCls}
        value={filter.readiness ?? "all"}
        onChange={(e) => set({ readiness: e.target.value as PracticeCaseAuditFilter["readiness"] })}
      >
        <option value="all">Reifegrad: alle</option>
        <option value="ready">bereit</option>
        <option value="partial">teilweise</option>
        <option value="notReady">nicht bereit</option>
      </select>
      <select
        className={selectCls}
        value={filter.indexState ?? "all"}
        onChange={(e) => set({ indexState: e.target.value as PracticeCaseAuditFilter["indexState"] })}
      >
        <option value="all">Indexzustand: alle</option>
        {(Object.keys(INDEX_STATE_LABELS) as CaseIndexState[]).map((s) => (
          <option key={s} value={s}>
            {INDEX_STATE_LABELS[s]}
          </option>
        ))}
      </select>
      <select
        className={selectCls}
        value={filter.category ?? "all"}
        onChange={(e) => set({ category: e.target.value })}
      >
        <option value="all">Kategorie: alle</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        className={selectCls}
        value={filter.indexable ?? "all"}
        onChange={(e) => set({ indexable: e.target.value as PracticeCaseAuditFilter["indexable"] })}
      >
        <option value="all">Indexierbar: alle</option>
        <option value="yes">nur indexierbare</option>
        <option value="no">nur nicht indexierbare</option>
      </select>
      <select
        className={selectCls}
        value={filter.errors ?? "all"}
        onChange={(e) => set({ errors: e.target.value as PracticeCaseAuditFilter["errors"] })}
      >
        <option value="all">Fehler: alle</option>
        <option value="only">nur mit Fehlern</option>
      </select>
    </div>
  );
}

export interface AuditTableProps {
  rows: PracticeCaseAuditRow[];
  selectedId: string | null;
  onSelect: (caseId: string) => void;
  onReindex: (caseId: string) => void;
}

export function AuditTable({ rows, selectedId, onSelect, onReindex }: AuditTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Praxisfall</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Profil</th>
            <th className="px-3 py-2">Reifegrad</th>
            <th className="px-3 py-2">Index</th>
            <th className="px-3 py-2 text-right">Verknüpfungen</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={row.caseId}
              className={cn(
                "cursor-pointer hover:bg-muted/30",
                selectedId === row.caseId && "bg-primary/5",
              )}
              onClick={() => onSelect(row.caseId)}
            >
              <td className="px-3 py-2">
                <div className="font-medium">{row.title}</div>
                <div className="text-[11px] text-muted-foreground">{row.category ?? "—"}</div>
              </td>
              <td className="px-3 py-2">{row.status}</td>
              <td className="px-3 py-2">
                {MATCH_PROFILE_STATUS_LABELS[row.profile.status]}
                {row.curated && <span className="ml-1 text-[10px] text-primary">kuratiert</span>}
              </td>
              <td className="px-3 py-2">
                {READINESS_LABELS[row.readiness.level]}{" "}
                <span className="tabular-nums text-muted-foreground">{row.readiness.score}</span>
              </td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    row.indexState === "indexed" && "text-emerald-700",
                    row.indexState === "stale" && "text-amber-700",
                    row.indexState === "skipped" && "text-rose-700",
                  )}
                >
                  {INDEX_STATE_LABELS[row.indexState]}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {row.keywordCount} / {row.legalCount} / {row.templateCount}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReindex(row.caseId);
                  }}
                >
                  neu indexieren
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                Keine Praxisfälle entsprechen den gewählten Filtern.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AuditRowDetail({ row }: { row: PracticeCaseAuditRow }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-xs">
      <div>
        <div className="text-sm font-semibold">{row.title}</div>
        <div className="text-[11px] text-muted-foreground">
          Profil-Hash <span className="font-mono">{row.contentHash}</span>
          {row.indexedHash ? (
            <>
              {" · "}Index-Hash <span className="font-mono">{row.indexedHash}</span>
            </>
          ) : null}
          {row.indexedAt
            ? " · indexiert am " + new Date(row.indexedAt).toLocaleString("de-DE")
            : ""}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 font-medium">Wirksames Profil</div>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>Kategorien: {row.profile.categories.join(", ") || "—"}</li>
            <li>Schlagwörter: {row.profile.keywords.join(", ") || "—"}</li>
            <li>Rollen: {row.profile.roles.join(", ") || "—"}</li>
            <li>Orte: {row.profile.locationTypes.join(", ") || "—"}</li>
            <li>Erwartet: {row.profile.expectedSignals.join(", ") || "—"}</li>
            <li>Pflicht: {row.profile.requiredSignals.join(", ") || "—"}</li>
            <li>Ausschluss: {row.profile.excludedSignals.join(", ") || "—"}</li>
          </ul>
        </div>
        <div>
          <div className="mb-1 font-medium">Prüfungen</div>
          <ul className="space-y-0.5">
            {row.readiness.checks.map((c) => (
              <li key={c.id} className={c.passed ? "text-emerald-700" : "text-amber-700"}>
                {c.passed ? "✓" : "•"} {c.label}
                {!c.passed && <span className="text-muted-foreground"> – {c.hint}</span>}
              </li>
            ))}
          </ul>
          {row.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-rose-700">
              {row.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
