import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useRunLegalRetrieval } from "@/hooks/legal-knowledge/useLegalRetrieval";
import type { RetrievalHit, SearchType } from "@/services/legal-knowledge/retrieval";

export const Route = createFileRoute("/admin/legal-knowledge/suche")({
  head: () => ({
    meta: [
      { title: "Wissenssuche – RechtsKompass Schule" },
      { name: "description", content: "Redaktionelle Suche über geprüfte Rechtsquellen mit Fundstellen und Relevanzbewertung." },
      { property: "og:title", content: "Wissenssuche – RechtsKompass Schule" },
      { property: "og:description", content: "Redaktionelle Suche über geprüfte Rechtsquellen mit Fundstellen und Relevanzbewertung." },
    ],
  }),
  component: LegalKnowledgeSearchPage,
});

function pct(x: number): string { return `${Math.round((x ?? 0) * 100)} %`; }

function LegalKnowledgeSearchPage() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("hybrid");
  const [debug, setDebug] = useState(false);
  const [law, setLaw] = useState("");
  const [paragraph, setParagraph] = useState("");
  const [lifecycle, setLifecycle] = useState<string>("");
  const run = useRunLegalRetrieval();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    run.mutate({
      query,
      searchType,
      debug,
      filters: {
        law: law.trim() || undefined,
        paragraph: paragraph.trim() || undefined,
        lifecycle: lifecycle ? [lifecycle] : undefined,
        activeOnly: true,
      },
    });
  }

  const result = run.data?.result ?? null;
  const hits = result?.hits ?? [];
  const stats = result?.statistics;

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-lg font-semibold">Wissenssuche</h1>
        <p className="text-sm text-muted-foreground">
          Findet passende Fundstellen in geprüften Rechtsquellen. Keine automatischen Antworten – nur Verweise auf Quellen.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-3 py-2 text-sm"
            placeholder="z. B. Nachteilsausgleich LRS im Zeugnis"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground" disabled={run.isPending}>
            {run.isPending ? "Suche läuft …" : "Suchen"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <label className="text-xs">
            Suchmodus
            <select className="mt-1 w-full rounded border px-2 py-1 text-sm" value={searchType} onChange={(e) => setSearchType(e.target.value as SearchType)}>
              <option value="hybrid">Hybrid (empfohlen)</option>
              <option value="keyword_only">Nur Stichwörter</option>
              <option value="vector_only">Nur inhaltliche Nähe</option>
            </select>
          </label>
          <label className="text-xs">
            Gesetz enthält
            <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={law} onChange={(e) => setLaw(e.target.value)} placeholder="SchulG NRW" />
          </label>
          <label className="text-xs">
            Paragraph
            <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={paragraph} onChange={(e) => setParagraph(e.target.value)} placeholder="§ 42" />
          </label>
          <label className="text-xs">
            Status
            <select className="mt-1 w-full rounded border px-2 py-1 text-sm" value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
              <option value="">Alle</option>
              <option value="active">Aktiv</option>
              <option value="verified">Geprüft</option>
              <option value="imported">Importiert</option>
              <option value="needs_review">Prüfung erforderlich</option>
              <option value="outdated">Veraltet</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
          Debug-Modus (nur für Admins)
        </label>
      </form>

      {run.error ? <p className="text-sm text-red-600">Suche fehlgeschlagen: {(run.error as Error).message}</p> : null}

      {stats ? (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          {stats.returned} Treffer · Ø-Relevanz {pct(stats.averageScore)} · {stats.totalCandidates} durchsuchte Einheiten · {Math.round(stats.latencyMs)} ms
        </div>
      ) : null}

      <ol className="space-y-3">
        {hits.map((hit) => <HitCard key={hit.chunkId} hit={hit} debug={debug} />)}
      </ol>

      {result && hits.length === 0 && !run.isPending ? (
        <p className="text-sm text-muted-foreground">Keine passenden Fundstellen gefunden.</p>
      ) : null}
    </div>
  );
}

function HitCard({ hit, debug }: { hit: RetrievalHit; debug: boolean }) {
  return (
    <li className="rounded-md border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{hit.citation.display}</p>
        <span className="text-xs text-muted-foreground">Relevanz {pct(hit.score)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hit.displayPath}</p>
      {hit.excerpt ? <p className="mt-2 text-sm leading-relaxed">{hit.excerpt}</p> : null}
      {hit.highlights.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {hit.highlights.slice(0, 3).map((h, i) => <li key={i}>„{h}“</li>)}
        </ul>
      ) : null}
      <ul className="mt-2 flex flex-wrap gap-2 text-xs">
        {hit.reasons.filter((r) => r.code === "explanation").slice(0, 3).map((r, i) => (
          <li key={i} className="rounded bg-muted px-2 py-0.5">{r.message}</li>
        ))}
      </ul>
      {debug ? (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Debug-Details</summary>
          <pre className="mt-1 overflow-auto rounded bg-muted p-2">{JSON.stringify(hit.scoreBreakdown, null, 2)}</pre>
        </details>
      ) : null}
    </li>
  );
}
