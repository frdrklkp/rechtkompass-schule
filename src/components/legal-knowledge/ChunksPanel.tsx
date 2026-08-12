import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ChunkEngine,
  ChunkExporter,
  ChunkNavigator,
  CHUNK_TYPE_LABELS,
  type ChunkCollection,
  type ChunkNode,
} from "@/services/legal-knowledge/chunks";
import { buildDocumentTree } from "@/services/legal-knowledge/document";
import type { LegalSourceDomain } from "@/services/legal-knowledge";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Info,
  Layers,
  Search,
} from "lucide-react";

interface Props {
  source: LegalSourceDomain;
}

export function ChunksPanel({ source }: Props) {
  const [collection, setCollection] = useState<ChunkCollection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const generate = useMutation({
    mutationFn: async () => {
      const text = source.normalizedContent ?? source.originalContent ?? "";
      if (!text.trim()) throw new Error("Keine Quelle vorhanden – bitte zuerst Inhalt einfügen.");
      const tree = buildDocumentTree({
        text,
        sourceId: source.id,
        sourceLabel: source.shortName || source.title,
        baseMetadata: {
          sourceLabel: source.shortName || source.title,
          authority: source.authority ?? undefined,
          jurisdiction: source.jurisdiction ?? undefined,
          version: source.versionLabel ?? undefined,
        },
      });
      return ChunkEngine.run({
        tree,
        options: {
          baseMetadata: {
            law: source.shortName || source.title,
            authority: source.authority ?? undefined,
            jurisdiction: source.jurisdiction ?? undefined,
            version: source.versionLabel ?? undefined,
            lifecycle: source.lifecycleStatus,
            reviewStatus: source.verificationStatus,
          },
        },
      });
    },
    onSuccess: setCollection,
  });

  const navigator = useMemo(
    () => (collection ? new ChunkNavigator(collection) : null),
    [collection],
  );
  const filtered = useMemo(() => {
    if (!collection) return [];
    let list = collection.chunks;
    if (typeFilter !== "all") list = list.filter((c) => c.chunkType === typeFilter);
    if (search.trim() && navigator)
      list = navigator.search(search, 500).filter((c) => list.includes(c));
    return list;
  }, [collection, navigator, search, typeFilter]);
  const selected = useMemo(
    () =>
      collection && selectedId
        ? (collection.chunks.find((c) => c.localId === selectedId) ?? null)
        : null,
    [collection, selectedId],
  );

  const download = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
        >
          {generate.isPending
            ? "Erzeuge Chunks …"
            : collection
              ? "Chunks neu erzeugen"
              : "Chunks erzeugen"}
        </button>
        {collection && (
          <>
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() =>
                download(
                  `${source.shortName || source.id}-chunks.json`,
                  ChunkExporter.json(collection),
                )
              }
            >
              <FileJson className="h-3.5 w-3.5" /> JSON
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() =>
                download(
                  `${source.shortName || source.id}-chunks.outline.txt`,
                  ChunkExporter.outline(collection),
                )
              }
            >
              <Download className="h-3.5 w-3.5" /> Outline
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() =>
                download(
                  `${source.shortName || source.id}-chunks.list.txt`,
                  ChunkExporter.list(collection),
                )
              }
            >
              <Download className="h-3.5 w-3.5" /> Liste
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() =>
                download(
                  `${source.shortName || source.id}-chunks.metadata.json`,
                  ChunkExporter.metadata(collection),
                )
              }
            >
              <Download className="h-3.5 w-3.5" /> Metadaten
            </button>
          </>
        )}
      </div>

      {generate.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {String(generate.error instanceof Error ? generate.error.message : generate.error)}
        </p>
      )}

      {collection && (
        <>
          <StatsGrid collection={collection} />

          <ValidationSummary collection={collection} />

          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  placeholder="Suche in Chunks …"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="all">Alle Strategien</option>
                  {Array.from(new Set(collection.chunks.map((c) => c.chunkType))).map((t) => (
                    <option key={t} value={t}>
                      {CHUNK_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="max-h-[520px] overflow-y-auto pr-1">
                <ul className="space-y-1">
                  {filtered.map((c) => (
                    <li key={c.localId}>
                      <button
                        onClick={() => setSelectedId(c.localId)}
                        className={`w-full rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted ${selectedId === c.localId ? "border-accent bg-accent/10" : "border-transparent"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{c.displayTitle}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {c.token.tokenEstimate}t
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Layers className="h-2.5 w-2.5" />
                          {CHUNK_TYPE_LABELS[c.chunkType]}
                        </div>
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 && (
                    <li className="p-2 text-xs text-muted-foreground">
                      Keine Chunks passend zum Filter.
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              {selected ? (
                <ChunkDetail chunk={selected} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Chunk aus der Liste auswählen, um Details anzuzeigen.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {!collection && !generate.isPending && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Noch keine Chunks erzeugt. Klicke auf „Chunks erzeugen", um die redaktionellen
          Wissenseinheiten aufzubauen.
        </p>
      )}
    </div>
  );
}

function StatsGrid({ collection }: { collection: ChunkCollection }) {
  const s = collection.statistics;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Stat label="Chunks" value={s.chunkCount} />
      <Stat label="Ø Tokens" value={s.avgTokens} />
      <Stat label="Max Tokens" value={s.maxTokens} />
      <Stat label="Abdeckung" value={`${Math.round(s.coverageRatio * 100)}%`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ValidationSummary({ collection }: { collection: ChunkCollection }) {
  const v = collection.validation;
  const total = v.errors.length + v.warnings.length + v.info.length;
  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Alle Chunks sind valide.
      </div>
    );
  }
  return (
    <div className="space-y-1 rounded-lg border border-border bg-background p-3">
      {v.errors.map((e, i) => (
        <Issue key={`e${i}`} kind="error" issue={e} />
      ))}
      {v.warnings.map((w, i) => (
        <Issue key={`w${i}`} kind="warning" issue={w} />
      ))}
      {v.info.slice(0, 5).map((info, i) => (
        <Issue key={`i${i}`} kind="info" issue={info} />
      ))}
    </div>
  );
}

function Issue({
  kind,
  issue,
}: {
  kind: "error" | "warning" | "info";
  issue: { message: string; path?: string };
}) {
  const Icon = kind === "error" ? AlertTriangle : kind === "warning" ? AlertTriangle : Info;
  const cls =
    kind === "error"
      ? "text-red-600"
      : kind === "warning"
        ? "text-amber-600"
        : "text-muted-foreground";
  return (
    <div className={`flex items-start gap-1.5 text-xs ${cls}`}>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        {issue.message} {issue.path && <span className="opacity-60">({issue.path})</span>}
      </span>
    </div>
  );
}

function ChunkDetail({ chunk }: { chunk: ChunkNode }) {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pfad</div>
        <div className="font-medium">{chunk.displayPath}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetaCell label="Strategie" value={CHUNK_TYPE_LABELS[chunk.chunkType]} />
        <MetaCell label="Tokens" value={String(chunk.token.tokenEstimate)} />
        <MetaCell label="Wörter" value={String(chunk.token.wordCount)} />
        <MetaCell label="Sätze" value={String(chunk.token.sentenceCount)} />
        <MetaCell label="Kapitel" value={chunk.metadata.chapter ?? "—"} />
        <MetaCell
          label="Paragraph"
          value={chunk.metadata.paragraph ?? chunk.metadata.article ?? "—"}
        />
        <MetaCell label="Absatz" value={chunk.metadata.absatz ?? "—"} />
        <MetaCell label="Konfidenz" value={chunk.metadata.parserConfidence?.toFixed(2) ?? "—"} />
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Inhalt
        </div>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-2 font-mono text-[11px]">
          {chunk.content}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Normalisiert
        </div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-2 font-mono text-[11px]">
          {chunk.normalizedContent}
        </pre>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Referenzen ({chunk.references.length})
          </div>
          <ul className="space-y-0.5 text-[11px]">
            {chunk.references.map((r, i) => (
              <li key={i} className="rounded bg-muted/60 px-1.5 py-0.5">
                {r.raw}
              </li>
            ))}
            {chunk.references.length === 0 && (
              <li className="text-muted-foreground">Keine Verweise erkannt.</li>
            )}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Hash / IDs
          </div>
          <ul className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
            <li>chunk_id: {chunk.chunkId}</li>
            <li>stable_hash: {chunk.stableHash.slice(0, 16)}…</li>
            <li>parent: {chunk.parentChunk ? chunk.parentChunk.slice(0, 10) + "…" : "—"}</li>
            <li>kinder: {chunk.children.length}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}
