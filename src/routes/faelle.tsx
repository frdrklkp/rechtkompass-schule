import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { ChevronRight, Search } from "lucide-react";
import { CASES as STATIC_CASES } from "../data/cases";
import { PageShell } from "../components/PageShell";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { matches } from "../lib/synonyms";
import { usePublishedCases } from "../lib/casesFromDb";
import { LoadingState, ErrorState } from "../components/DataStates";

const searchSchema = z.object({
  cat: z.string().optional(),
  ampel: z.enum(["gruen", "gelb", "rot"]).optional(),
});

export const Route = createFileRoute("/faelle")({
  validateSearch: searchSchema,
  component: FaellePage,
});

const ampelColors: Record<string, string> = {
  gruen: "bg-success",
  gelb: "bg-warning",
  rot: "bg-danger",
};

function FaellePage() {
  const { cat, ampel } = Route.useSearch();
  const [q, setQ] = useState("");
  const navigate = Route.useNavigate();
  const { data: dbCases, isLoading, error } = usePublishedCases();

  // Use Supabase data if any published cases exist; else fall back to static.
  const cases = useMemo(() => {
    if (dbCases && dbCases.length > 0) return dbCases;
    return STATIC_CASES;
  }, [dbCases]);

  const categories = useMemo(
    () => Array.from(new Set(cases.map((c) => c.category).filter(Boolean))),
    [cases],
  );

  const filtered = cases.filter((c) => {
    if (cat && c.category !== cat) return false;
    if (ampel && c.ampel !== ampel) return false;
    if (q) {
      const hay = [
        c.title,
        c.category,
        c.subcategory,
        c.shortDescription,
        c.shortAnswer,
        c.tags.join(" "),
        c.searchTerms.join(" "),
        c.legalBasis.join(" "),
      ].join(" ");
      if (!matches(hay, q)) return false;
    }
    return true;
  });

  return (
    <PageShell
      title="Praxisfälle"
      subtitle={`${cases.length} Situationen aus dem Schulalltag am BKO – filtern oder gezielt suchen.`}
    >
      <div className="mb-3"><Breadcrumbs items={[{ label: "Praxisfälle" }]} /></div>
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Titel, Stichwort, Rechtsgrundlage …"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="mb-3 flex gap-2">
        {(["gruen", "gelb", "rot"] as const).map((a) => (
          <button
            key={a}
            onClick={() =>
              navigate({
                search: (prev: z.infer<typeof searchSchema>) => ({
                  ...prev,
                  ampel: prev.ampel === a ? undefined : a,
                }),
              })
            }
            data-active={ampel === a}
            className={`inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium data-[active=true]:border-accent`}
          >
            <span className={`h-2 w-2 rounded-full ${ampelColors[a]}`} />
            {a === "gruen" ? "Grün" : a === "gelb" ? "Gelb" : "Rot"}
          </button>
        ))}
      </div>

      <div className="mb-5 -mx-4 overflow-x-auto px-4">
        <div className="flex gap-2">
          <button
            onClick={() =>
              navigate({
                search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, cat: undefined }),
              })
            }
            data-active={!cat}
            className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 data-[active=true]:border-accent data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
          >
            Alle Kategorien
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() =>
                navigate({
                  search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, cat: c }),
                })
              }
              data-active={cat === c}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 data-[active=true]:border-accent data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !dbCases ? (
        <LoadingState label="Praxisfälle werden geladen…" />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {filtered.length} von {cases.length} Fällen
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Keine Treffer für diese Auswahl.
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/fall/$id"
                    params={{ id: c.id }}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/60"
                  >
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ampelColors[c.ampel]}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {c.category}{c.subcategory ? ` · ${c.subcategory}` : ""}
                      </p>
                      <h3 className="mt-0.5 truncate text-sm font-semibold text-foreground">
                        {c.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {c.shortDescription}
                      </p>
                    </div>
                    <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PageShell>
  );
}
