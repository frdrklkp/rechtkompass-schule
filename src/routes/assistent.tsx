import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  Compass,
  GraduationCap,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import { TileIntakeContainer } from "@/components/assistant/tile-intake";
import { DescriptionIntake } from "@/components/assistant/DescriptionIntake";
import { useTileIntake } from "@/hooks/assistant/useTileIntake";
import { Breadcrumbs } from "@/components/Breadcrumbs";

import { TimeModeToggle } from "@/components/TimeModeToggle";
import { usePublishedCases } from "@/lib/casesFromDb";
import { getCategoryVisual } from "@/lib/categoryVisual";
import type { CaseData } from "@/data/cases";

export const Route = createFileRoute("/assistent")({
  head: () => ({
    meta: [
      { title: "Fall schildern – RechtKompass Schule" },
      {
        name: "description",
        content:
          "Schildern Sie den Vorfall in eigenen Worten: RechtKompass strukturiert Ihre Angaben, gleicht sie mit Praxisfällen ab und führt Sie anschließend durch die weitere Bearbeitung.",
      },
      { property: "og:title", content: "Fall schildern – RechtKompass Schule" },
      {
        property: "og:description",
        content:
          "Geführter Einstieg: Fallschilderung strukturieren, mit Praxisfällen abgleichen und direkt weiterbearbeiten – ohne Doppeleingabe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistentPage,
});

const AMPEL_DOT: Record<string, string> = {
  gruen: "bg-success",
  gelb: "bg-warning",
  rot: "bg-danger",
};

const UNCATEGORIZED = "Nicht kategorisiert";

function caseMatchesQuery(c: CaseData, q: string): boolean {
  if (!q) return true;
  const hay = [
    c.title,
    c.shortDescription,
    c.shortAnswer,
    c.category,
    c.subcategory,
    c.recommendation,
    c.responsibleParty,
    ...(c.tags ?? []),
    ...(c.searchTerms ?? []),
    ...(c.legalBasis ?? []),
    ...(c.applicableTemplates ?? []),
  ]
    .filter(Boolean)
    .join(" \u00b7 ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

function AssistentPage() {
  const assistant = useTileIntake();
  const { data: cases, isLoading, error } = usePublishedCases();

  // Fall-schildern-Neubau 2026-09-01: die strukturierte Kachel-Erfassung ist
  // kein Einstieg mehr, sondern ein Dokumentationswerkzeug, das erst auf der
  // Ergebnisseite (oder bewusst hier unten) geöffnet wird.
  const [docOpen, setDocOpen] = useState(false);
  const [docDescription, setDocDescription] = useState("");
  const docSectionRef = useRef<HTMLDetailsElement | null>(null);

  const openDocumentation = (description: string) => {
    setDocDescription(description);
    setDocOpen(true);
    requestAnimationFrame(() => {
      docSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const published = cases ?? [];

  const categoryGroups = useMemo(() => {
    const map = new Map<string, CaseData[]>();
    for (const c of published) {
      const key = (c.category?.trim() || UNCATEGORIZED);
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => {
        if (a.name === UNCATEGORIZED) return 1;
        if (b.name === UNCATEGORIZED) return -1;
        return a.name.localeCompare(b.name, "de");
      });
  }, [published]);

  const subcategoryGroups = useMemo(() => {
    if (!category) return [];
    const inCat = published.filter(
      (c) => (c.category?.trim() || UNCATEGORIZED) === category,
    );
    const map = new Map<string, CaseData[]>();
    for (const c of inCat) {
      const key = c.subcategory?.trim() || "Allgemein";
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [category, published]);

  const results: CaseData[] = useMemo(() => {
    if (query.trim()) {
      return published.filter((c) => caseMatchesQuery(c, query.trim()));
    }
    if (category && subcategory) {
      return published.filter(
        (c) =>
          (c.category?.trim() || UNCATEGORIZED) === category &&
          (c.subcategory?.trim() || "Allgemein") === subcategory,
      );
    }
    return [];
  }, [category, subcategory, query, published]);

  const reset = () => {
    setCategory(null);
    setSubcategory(null);
    setQuery("");
  };

  const searching = query.trim().length > 0;
  const step = searching ? 3 : !category ? 1 : !subcategory ? 2 : 3;

  const uncategorizedCount = useMemo(
    () =>
      published.filter((c) => !c.category?.trim()).length,
    [published],
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-40 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Breadcrumbs items={[{ label: "Fall schildern" }]} />
        <TimeModeToggle compact />
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Compass className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fall schildern</h1>
          <p className="text-xs text-muted-foreground">
            Situation beschreiben, passende Praxisfälle prüfen, anschließend direkt
            weiterbearbeiten.
          </p>
        </div>
      </div>

      <DescriptionIntake onDocument={openDocumentation} />

      <details
        ref={docSectionRef}
        open={docOpen}
        onToggle={(e) => setDocOpen((e.target as HTMLDetailsElement).open)}
        className="mt-8 rounded-2xl border border-border bg-card p-4"
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Vorfall strukturiert dokumentieren (Fallakte)
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">
          Schritt für Schritt: Beteiligte, Zeitpunkt, Nachweise und Maßnahmen erfassen – z. B. nach einer
          Einschätzung oben.
        </p>
        {docDescription && (
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Ihre Schilderung:</span> {docDescription}
          </div>
        )}
        <div className="mt-4">
          <TileIntakeContainer controller={assistant} />
        </div>
      </details>

      <details className="mt-4 rounded-2xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Stattdessen selbst nach einem Praxisfall suchen
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">
          Schritt {step} von 3 – nur veröffentlichte Praxisfälle.
        </p>


      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      {/* Search */}
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche: Titel, Schlagwort, Rechtsgrundlage …"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {(query || category || subcategory) && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] hover:border-accent"
          >
            <RotateCcw className="h-3 w-3" /> Neu
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Veröffentlichte Praxisfälle werden geladen …
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-foreground">
          Die veröffentlichten Praxisfälle konnten nicht geladen werden.
        </div>
      )}

      {!isLoading && !error && published.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Noch keine veröffentlichten Praxisfälle vorhanden.
        </div>
      )}

      {/* Step 1: Categories */}
      {!searching && !category && published.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Welches Themenfeld?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {published.length} veröffentlichte{published.length === 1 ? "r Fall" : " Fälle"} in{" "}
            {categoryGroups.length} Kategorie{categoryGroups.length === 1 ? "" : "n"}.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {categoryGroups.map((g) => {
              const v = getCategoryVisual(g.name);
              return (
                <button
                  key={g.name}
                  onClick={() => setCategory(g.name)}
                  className={`group flex flex-col gap-3 rounded-2xl border ${v.border} bg-card p-4 text-left transition-all hover:-translate-y-0.5 ${v.hoverBorder} hover:shadow-[var(--shadow-card)]`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl ${v.iconBg} ${v.iconText}`}
                      aria-hidden="true"
                    >
                      <span>{v.emoji}</span>
                    </div>
                    <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{g.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {v.description}
                    </p>
                    <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                      {g.items.length} {g.items.length === 1 ? "Praxisfall" : "Praxisfälle"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 2: Subcategories */}
      {!searching && category && !subcategory && (
        <section>
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={() => setCategory(null)} className="hover:text-accent">
              ← Kategorien
            </button>
            <span className="rounded-full bg-muted px-2 py-0.5">{category}</span>
          </div>
          <h2 className="text-lg font-semibold">Unterbereich wählen</h2>
          <div className="mt-4 space-y-2">
            {subcategoryGroups.map((g) => (
              <button
                key={g.name}
                onClick={() => setSubcategory(g.name)}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-card)]"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{g.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.items.length} Fall{g.items.length === 1 ? "" : "ä"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 3: Results */}
      {(searching || (category && subcategory)) && (
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            {searching ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Suche: „{query.trim()}“
              </span>
            ) : (
              <>
                <button
                  onClick={() => setSubcategory(null)}
                  className="hover:text-accent text-muted-foreground"
                >
                  ← Unterbereiche
                </button>
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  {category} · {subcategory}
                </span>
              </>
            )}
          </div>
          <h2 className="text-lg font-semibold">
            {results.length} passende{results.length === 1 ? "r Fall" : " Fälle"}
          </h2>
          {results.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Keine veröffentlichten Praxisfälle gefunden.
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {results.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/fall/$id"
                    params={{ id: c.id }}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/60"
                  >
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${AMPEL_DOT[c.ampel] ?? "bg-muted"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {(c.category?.trim() || UNCATEGORIZED)}
                        {c.subcategory ? ` · ${c.subcategory}` : ""}
                      </p>
                      <h3 className="mt-0.5 truncate text-sm font-semibold">{c.title}</h3>
                      {c.shortAnswer && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {c.shortAnswer}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Link
              to="/faelle"
              className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm hover:border-accent"
            >
              <BookOpen className="h-4 w-4 text-accent" /> Alle Praxisfälle
            </Link>
            <Link
              to="/dokumentation"
              className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm hover:border-accent"
            >
              <ClipboardList className="h-4 w-4 text-accent" /> Dokumentation starten
            </Link>
          </div>

          <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
            <GraduationCap className="mb-1 inline h-4 w-4 text-accent" /> Es werden ausschließlich
            redaktionell freigegebene Praxisfälle angezeigt.
          </div>
        </section>
      )}

      {import.meta.env.DEV && !isLoading && (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
          <p className="font-semibold text-foreground">Dev-Diagnose</p>
          <ul className="mt-1 space-y-0.5">
            <li>Fetch: usePublishedCases() · Filter: status = 'published'</li>
            <li>Geladene Fälle: {published.length}</li>
            <li>Kategorien: {categoryGroups.length}</li>
            <li>Ohne Kategorie: {uncategorizedCount}</li>
            <li>Ohne ID/Slug: {published.filter((c) => !c.id).length}</li>
          </ul>
        </div>
      )}
      </details>
    </div>

  );
}
