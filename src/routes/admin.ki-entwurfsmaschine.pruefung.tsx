import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, ExternalLink } from "lucide-react";
import { listCases } from "@/lib/coreBuilder";
import { computeCompleteness } from "@/lib/caseCompleteness";

export const Route = createFileRoute("/admin/ki-entwurfsmaschine/pruefung")({
  component: DraftReviewList,
});

type Row = {
  id: string;
  title: string;
  category: string;
  status: string;
  score: number;
  ampel: "gruen" | "gelb" | "rot";
  missing: string[];
  topic: string;
};

function ampelClass(a: string) {
  return a === "gruen"
    ? "bg-emerald-500/15 text-emerald-700"
    : a === "gelb"
      ? "bg-amber-500/15 text-amber-700"
      : "bg-rose-500/15 text-rose-700";
}

function DraftReviewList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<"score" | "title">("score");

  useEffect(() => {
    (async () => {
      try {
        const cases = await listCases();
        const filtered = (cases as Array<Record<string, unknown>>)
          .filter((c) => {
            const meta = (c.faq as { meta?: { source?: string } } | null)?.meta;
            return meta?.source === "ki-entwurfsmaschine";
          })
          .map((c) => {
            const faqObj = c.faq as {
              meta?: {
                completeness_score?: number;
                completeness_ampel?: "gruen" | "gelb" | "rot";
                completeness_missing?: string[];
                topic?: string;
                faq_items?: Array<{ q: string; a: string }>;
              };
            } | null;
            const meta = faqObj?.meta ?? {};
            const scoreFromMeta = typeof meta.completeness_score === "number" ? meta.completeness_score : null;
            const fallback = computeCompleteness({
              short_description: c.short_description as string,
              legal_explanation: c.legal_explanation as string,
              responsibilities: c.responsibilities as string,
              practice_tip: c.practice_tip as string,
              common_mistakes: (c.common_mistakes as string[]) ?? [],
              checklist: (c.checklist as string[]) ?? [],
              documentation: (c.documentation as string[]) ?? [],
              faq: meta.faq_items ?? [],
            });
            return {
              id: c.id as string,
              title: (c.title as string) ?? "(ohne Titel)",
              category: (c.category as string) ?? "",
              status: (c.status as string) ?? "draft",
              score: scoreFromMeta ?? fallback.score,
              ampel: meta.completeness_ampel ?? fallback.ampel,
              missing: meta.completeness_missing ?? fallback.missing,
              topic: meta.topic ?? "",
            } as Row;
          });
        setRows(filtered);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "score") copy.sort((a, b) => a.score - b.score);
    else copy.sort((a, b) => a.title.localeCompare(b.title));
    return copy;
  }, [rows, sort]);

  const counts = useMemo(() => {
    let g = 0, y = 0, r = 0;
    for (const row of rows) {
      if (row.ampel === "gruen") g++;
      else if (row.ampel === "gelb") y++;
      else r++;
    }
    return { g, y, r };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardList className="h-6 w-6 text-primary" />
          KI-Entwürfe zur Prüfung
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alle Praxisfälle, die von der KI-Entwurfsmaschine erzeugt wurden. Sortiert nach
          Vollständigkeit – niedrigste zuerst.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-xs">
        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700">🟢 fast fertig: {counts.g}</span>
        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-700">🟡 prüfen: {counts.y}</span>
        <span className="rounded bg-rose-500/15 px-2 py-0.5 text-rose-700">🔴 unvollständig: {counts.r}</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-muted-foreground">Sortierung:</label>
          <select
            className="rounded border border-border bg-background px-2 py-1"
            value={sort}
            onChange={(e) => setSort(e.target.value as "score" | "title")}
          >
            <option value="score">Vollständigkeit (aufsteigend)</option>
            <option value="title">Titel</option>
          </select>
          <Link
            to="/admin/ki-entwurfsmaschine"
            className="rounded-md border border-border bg-muted/30 px-2 py-1 hover:bg-muted"
          >
            ← zur Maschine
          </Link>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade Entwürfe…
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700">
          {err}
        </div>
      )}

      {!loading && !err && sorted.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Noch keine KI-Entwürfe vorhanden. Erzeuge welche über die{" "}
          <Link to="/admin/ki-entwurfsmaschine" className="text-primary hover:underline">
            KI-Entwurfsmaschine
          </Link>
          .
        </div>
      )}

      <ul className="space-y-2">
        {sorted.map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm"
          >
            <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${ampelClass(r.ampel)}`}>
              {r.score}%
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium">{r.title}</span>
                {r.category && (
                  <span className="shrink-0 text-xs text-muted-foreground">· {r.category}</span>
                )}
                {r.topic && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {r.topic}
                  </span>
                )}
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {r.status}
                </span>
              </div>
              {r.missing.length > 0 && (
                <div className="mt-0.5 text-xs text-amber-700">
                  fehlt: {r.missing.join(", ")}
                </div>
              )}
            </div>
            <Link
              to="/admin/faelle/$id"
              params={{ id: r.id }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs hover:bg-muted"
            >
              öffnen <ExternalLink className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
