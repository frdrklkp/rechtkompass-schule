import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCategories, listCases } from "@/lib/coreBuilder";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";

export const Route = createFileRoute("/admin/kategorien")({
  component: () => {
    const catsQ = useQuery({ queryKey: ["admin", "categories"], queryFn: listCategories });
    const casesQ = useQuery({ queryKey: ["admin", "cases"], queryFn: listCases });

    if (catsQ.isLoading || casesQ.isLoading) return <LoadingState />;
    if (catsQ.error) return <ErrorState error={catsQ.error} />;

    const cats = catsQ.data ?? [];
    const cases = casesQ.data ?? [];
    const countFor = (name: string) => cases.filter((c) => c.category === name).length;
    const subsFor = (name: string) => {
      const map = new Map<string, number>();
      for (const c of cases) if (c.category === name && c.subcategory) map.set(c.subcategory, (map.get(c.subcategory) ?? 0) + 1);
      return Array.from(map.entries());
    };

    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Struktur</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Kategorien</h1>
          <p className="mt-1 text-sm text-muted-foreground">{cats.length} Kategorien insgesamt.</p>
        </header>

        {cats.length === 0 ? (
          <EmptyState title="Keine Kategorien" description="Lege Kategorien für Praxisfälle an." />
        ) : (
          <div className="space-y-3">
            {cats.map((cat) => (
              <div key={cat.id} className="rounded-xl border border-border bg-card p-4">
                <div>
                  <h2 className="text-sm font-semibold">{cat.name}</h2>
                  <p className="text-xs text-muted-foreground">{countFor(cat.name)} Fälle</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {subsFor(cat.name).map(([sub, n]) => (
                    <span key={sub} className="rounded-md bg-muted px-2 py-0.5 text-[11px]">
                      {sub} <span className="text-muted-foreground">· {n}</span>
                    </span>
                  ))}
                  {subsFor(cat.name).length === 0 && (
                    <span className="text-[11px] text-muted-foreground">Keine Unterkategorien.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
});
