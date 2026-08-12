import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DocumentStructureService,
  DocumentNavigator,
  buildDocumentTree,
  SECTION_TYPE_LABELS,
} from "@/services/legal-knowledge/document";
import type {
  DocumentTree,
  SectionNode,
  ValidationIssue,
} from "@/services/legal-knowledge/document";
import type { LegalSourceDomain } from "@/services/legal-knowledge";
import {
  ChevronDown,
  ChevronRight,
  Search,
  FileJson,
  ListTree,
  Download,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";

interface Props {
  source: LegalSourceDomain;
}

export function DocumentStructurePanel({ source }: Props) {
  const qc = useQueryClient();
  const [tree, setTree] = useState<DocumentTree | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const persisted = useQuery({
    queryKey: ["legal-doc-structure", source.id],
    queryFn: () => DocumentStructureService.loadForSource(source.id),
  });

  const rebuild = useMutation({
    mutationFn: async () => {
      const text = source.normalizedContent ?? source.originalContent ?? "";
      if (!text.trim()) throw new Error("Keine Quelle vorhanden – bitte zuerst Inhalt einfügen.");
      const result = await DocumentStructureService.buildAndPersist({
        sourceId: source.id,
        sourceLabel: source.shortName || source.title,
        text,
        baseMetadata: {
          sourceLabel: source.shortName || source.title,
          authority: source.authority ?? undefined,
          jurisdiction: source.jurisdiction ?? undefined,
          version: source.versionLabel ?? undefined,
          language: source.sourceLanguage ?? undefined,
        },
      });
      return result;
    },
    onSuccess: (result) => {
      setTree(result.tree);
      qc.invalidateQueries({ queryKey: ["legal-doc-structure", source.id] });
    },
  });

  const previewOnly = useMutation({
    mutationFn: async () => {
      const text = source.normalizedContent ?? source.originalContent ?? "";
      return buildDocumentTree({
        text,
        sourceId: source.id,
        sourceLabel: source.shortName || source.title,
      });
    },
    onSuccess: setTree,
  });

  const navigator = useMemo(() => (tree ? new DocumentNavigator(tree) : null), [tree]);
  const searchHits = useMemo(
    () => (navigator && search.trim() ? navigator.search(search) : []),
    [navigator, search],
  );
  const selected = useMemo(
    () => (tree && selectedId ? (tree.flat.find((n) => n.localId === selectedId) ?? null) : null),
    [tree, selectedId],
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
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3">
        <div>
          <h3 className="text-sm font-semibold">Dokumentstruktur</h3>
          <p className="text-xs text-muted-foreground">
            Deterministische Analyse in Kapitel, Paragraphen, Absätze, Sätze und Nummern. Keine KI.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => previewOnly.mutate()}
            disabled={previewOnly.isPending}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent"
          >
            {previewOnly.isPending ? "Analysiere …" : "Nur Vorschau"}
          </button>
          <button
            onClick={() => rebuild.mutate()}
            disabled={rebuild.isPending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
          >
            {rebuild.isPending ? "Baue Struktur …" : "Struktur aufbauen & speichern"}
          </button>
        </div>
      </header>

      {rebuild.error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {(rebuild.error as Error).message}
        </p>
      )}

      {!tree && (
        <p className="text-xs text-muted-foreground">
          Bislang keine Struktur analysiert.{" "}
          {persisted.data?.sections.length
            ? `${persisted.data.sections.length} Abschnitte sind in der Datenbank gespeichert.`
            : `Klicke auf „Struktur aufbauen", um zu starten.`}
        </p>
      )}

      {tree && (
        <>
          <StatisticsCard tree={tree} />
          <ValidatorCard
            issues={[
              ...tree.validation.errors,
              ...tree.validation.warnings,
              ...tree.validation.info,
            ]}
            ok={tree.validation.ok}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suche in diesem Dokument …"
                  className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs"
                />
              </div>
              {search.trim() && (
                <div className="max-h-40 overflow-auto rounded-md border border-border bg-background p-2 text-xs">
                  {searchHits.length === 0 && (
                    <p className="text-muted-foreground">Keine Treffer.</p>
                  )}
                  {searchHits.slice(0, 20).map((n) => (
                    <button
                      key={n.localId}
                      onClick={() => setSelectedId(n.localId)}
                      className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-muted"
                    >
                      {n.displayPath}
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-[520px] overflow-auto rounded-lg border border-border bg-background p-2">
                <TreeView node={tree.root} selectedId={selectedId} onSelect={setSelectedId} />
              </div>
              <div className="flex flex-wrap gap-2">
                <ExportBtn
                  label="JSON"
                  icon={<FileJson className="h-3 w-3" />}
                  onClick={() =>
                    download(
                      `${source.shortName || "dokument"}.json`,
                      DocumentStructureService.export.json(tree),
                    )
                  }
                />
                <ExportBtn
                  label="Outline"
                  icon={<ListTree className="h-3 w-3" />}
                  onClick={() =>
                    download(
                      `${source.shortName || "dokument"}-outline.json`,
                      DocumentStructureService.export.outline(tree),
                    )
                  }
                />
                <ExportBtn
                  label="Baum"
                  icon={<Download className="h-3 w-3" />}
                  onClick={() =>
                    download(
                      `${source.shortName || "dokument"}-tree.txt`,
                      DocumentStructureService.export.tree(tree),
                    )
                  }
                />
                <ExportBtn
                  label="Metadaten"
                  icon={<Download className="h-3 w-3" />}
                  onClick={() =>
                    download(
                      `${source.shortName || "dokument"}-metadata.json`,
                      DocumentStructureService.export.metadata(tree),
                    )
                  }
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              {selected ? (
                <SectionDetail node={selected} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Wähle links einen Eintrag, um Original, Normalisierung, Metadaten und Referenzen
                  zu sehen.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ExportBtn({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:border-accent"
    >
      {icon} {label}
    </button>
  );
}

function StatisticsCard({ tree }: { tree: DocumentTree }) {
  const s = tree.statistics;
  const items: Array<[string, number | string]> = [
    ["Kapitel", s.chapters],
    ["Paragraphen", s.paragraphs],
    ["Artikel", s.articles],
    ["Absätze", s.absaetze],
    ["Sätze", s.sentences],
    ["Nummern", s.numbers],
    ["Anlagen", s.annexes],
    ["Referenzen", s.references],
    ["Zeichen", s.characters],
    ["Tokens (geschätzt)", s.tokensEstimated],
    ["Max. Tiefe", s.maxDepth],
    ["⌀ Tiefe", s.averageDepth],
    ["Konfidenz", s.parserConfidence.toFixed(2)],
    ["Abschnitte gesamt", s.sectionsTotal],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-md border border-border bg-background p-2 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
          <div className="font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}

function ValidatorCard({ issues, ok }: { issues: ValidationIssue[]; ok: boolean }) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        )}
        Validierung
      </div>
      <ul className="space-y-1 text-xs">
        {issues.map((i, idx) => (
          <li key={idx} className="flex items-start gap-2">
            {i.level === "error" && <AlertTriangle className="mt-0.5 h-3 w-3 text-red-600" />}
            {i.level === "warning" && <AlertTriangle className="mt-0.5 h-3 w-3 text-amber-600" />}
            {i.level === "info" && <Info className="mt-0.5 h-3 w-3 text-muted-foreground" />}
            <span>
              <span className="font-medium">{i.code}</span> · {i.message}
              {i.path && <span className="ml-1 text-muted-foreground">({i.path})</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TreeView({
  node,
  selectedId,
  onSelect,
}: {
  node: SectionNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {node.children.map((c) => (
        <TreeNode key={c.localId} node={c} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  selectedId,
  onSelect,
}: {
  node: SectionNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(node.depth <= 2);
  const active = selectedId === node.localId;
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs ${active ? "bg-accent/10 text-accent" : "hover:bg-muted"}`}
      >
        {hasChildren ? (
          <button onClick={() => setOpen((v) => !v)} className="p-0.5">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <button onClick={() => onSelect(node.localId)} className="flex-1 truncate text-left">
          <span className="text-muted-foreground">[{SECTION_TYPE_LABELS[node.type]}]</span>{" "}
          <span className="font-medium">{node.label}</span>
          {node.title && node.title !== node.label && (
            <span className="text-muted-foreground"> – {node.title}</span>
          )}
        </button>
      </div>
      {open && hasChildren && (
        <ul className="ml-3 border-l border-border pl-2">
          {node.children.map((c) => (
            <TreeNode key={c.localId} node={c} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SectionDetail({ node }: { node: SectionNode }) {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Pfad</div>
        <div className="font-medium">{node.displayPath}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetaRow k="Typ" v={SECTION_TYPE_LABELS[node.type]} />
        <MetaRow k="Nummer" v={node.number ?? "—"} />
        <MetaRow k="Tiefe" v={String(node.depth)} />
        <MetaRow k="Reihenfolge" v={String(node.order)} />
        <MetaRow k="Zeichenbereich" v={`${node.startOffset}–${node.endOffset}`} />
        <MetaRow k="Parser-Konfidenz" v={node.confidence.toFixed(2)} />
        <MetaRow k="Parser-Methode" v={node.parserMethod} />
        <MetaRow k="Stabile ID" v={node.stableHash} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Original</div>
        <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted/50 p-2 text-[11px]">
          {node.originalText || "—"}
        </pre>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Normalisiert
        </div>
        <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted/50 p-2 text-[11px]">
          {node.normalizedText || "—"}
        </pre>
      </div>
      {node.references.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Referenzen ({node.references.length})
          </div>
          <ul className="mt-1 space-y-1">
            {node.references.map((r, i) => (
              <li key={i} className="rounded border border-border bg-background p-1.5">
                <span className="font-mono">{r.raw}</span>{" "}
                <span className="text-muted-foreground">— {r.refType}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {Object.keys(node.metadata).length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Metadaten</div>
          <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted/50 p-2 text-[11px]">
            {JSON.stringify(node.metadata, null, 2)}
          </pre>
        </div>
      )}
      {node.children.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Kinder ({node.children.length})
          </div>
          <ul className="mt-1 list-disc pl-4">
            {node.children.map((c) => (
              <li key={c.localId}>{c.displayTitle}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-border bg-background p-1.5">
      <div className="text-[10px] text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
