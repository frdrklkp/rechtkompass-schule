import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LoadingState, ErrorState } from "@/components/DataStates";
import {
  AuditFilterBar,
  AuditRowDetail,
  AuditTable,
  InventoryCards,
  InventoryDistributions,
} from "@/components/matching/MatchingAuditTable";
import { IndexControls } from "@/components/matching/MatchingIndexControls";
import { MatchingTestPanel } from "@/components/matching/MatchingTestPanel";
import { MatchingProfilePanel } from "@/components/matching/MatchingProfilePanel";
import { useMatchingDashboard } from "@/hooks/matching/usePracticeCaseMatching";
import {
  EMPTY_AUDIT_FILTER,
  filterAuditRows,
  type PracticeCaseAuditFilter,
} from "@/services/practice-case-matching";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/praxisfall-matching")({
  component: PracticeCaseMatchingPage,
  head: () => ({
    meta: [
      { title: "Praxisfall-Matching – Core Builder" },
      {
        name: "description",
        content:
          "Bestandsaudit, Indexsteuerung und Matching-Test für die dynamische Praxisfallzuordnung.",
      },
    ],
  }),
});

const TABS = [
  { key: "audit", label: "Bestandsaudit" },
  { key: "index", label: "Indexsteuerung" },
  { key: "test", label: "Matching-Test" },
] as const;

function PracticeCaseMatchingPage() {
  const dashboard = useMatchingDashboard();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("audit");
  const [filter, setFilter] = useState<PracticeCaseAuditFilter>(EMPTY_AUDIT_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => filterAuditRows(dashboard.rows, filter), [dashboard.rows, filter]);
  const selectedRow = rows.find((r) => r.caseId === selectedId) ?? null;
  const selectedSource = dashboard.sources.find((s) => s.id === selectedId) ?? null;

  if (dashboard.loading) return <LoadingState />;
  if (dashboard.error) return <ErrorState error={dashboard.error} />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Praxisfall-Matching</h1>
        <p className="text-sm text-muted-foreground">
          Alle Werte werden live aus dem Praxisfallbestand berechnet. Neue veröffentlichte Fälle
          wachsen ohne Codeänderung in den Index hinein.
        </p>
      </header>

      <InventoryCards inventory={dashboard.inventory} />

      <nav className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "audit" && (
        <div className="space-y-3">
          <InventoryDistributions inventory={dashboard.inventory} />
          <AuditFilterBar
            filter={filter}
            onChange={setFilter}
            categories={dashboard.inventory.categories.map((c) => c.category)}
          />
          <p className="text-xs text-muted-foreground">
            {rows.length} von {dashboard.rows.length} Praxisfällen angezeigt.
          </p>
          <AuditTable
            rows={rows}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
            onReindex={(id) => {
              dashboard.reindexOne(id);
              toast.success("Praxisfall neu indexiert.");
            }}
          />
          {selectedRow && <AuditRowDetail row={selectedRow} />}
          {selectedRow && selectedSource && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">
                Matching-Profil pflegen – {selectedRow.title}
              </h2>
              <MatchingProfilePanel caseId={selectedRow.caseId} source={selectedSource} />
            </div>
          )}
        </div>
      )}

      {tab === "index" && <IndexControls dashboard={dashboard} />}
      {tab === "test" && <MatchingTestPanel index={dashboard.index} />}
    </div>
  );
}
