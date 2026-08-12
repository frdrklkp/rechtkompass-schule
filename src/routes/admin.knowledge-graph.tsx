import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  Network,
  ExternalLink,
} from "lucide-react";
import {
  listCases,
  listSections,
  listSources,
  listTemplates,
  listKeywords,
  listCaseLegalLinks,
} from "@/lib/coreBuilder";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/DataStates";

export const Route = createFileRoute("/admin/knowledge-graph")({
  component: KnowledgeGraphPage,
});

// ---------------- Types ----------------
type NodeKind = "case" | "section" | "template" | "keyword" | "faq" | "checklist";

type GNode = {
  id: string;
  kind: NodeKind;
  label: string;
  meta?: string;
  editorTo?: string;
  editorParams?: Record<string, string>;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type GEdge = { source: string; target: string; kind: string };

const KIND_COLOR: Record<NodeKind, string> = {
  case: "hsl(221 83% 53%)",
  section: "hsl(142 71% 45%)",
  template: "hsl(35 92% 50%)",
  keyword: "hsl(280 65% 60%)",
  faq: "hsl(199 89% 48%)",
  checklist: "hsl(0 72% 55%)",
};
const KIND_LABEL: Record<NodeKind, string> = {
  case: "Praxisfälle",
  section: "Rechtsgrundlagen",
  template: "Dokumentvorlagen",
  keyword: "Schlagwörter",
  faq: "FAQ",
  checklist: "Checklisten",
};
const KIND_RADIUS: Record<NodeKind, number> = {
  case: 10,
  section: 8,
  template: 8,
  keyword: 6,
  faq: 5,
  checklist: 5,
};

// ---------------- Layout ----------------
function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function forceLayout(nodes: GNode[], edges: GEdge[], iters = 220) {
  if (nodes.length === 0) return;
  const W = 1200,
    H = 800;
  const rand = seededRand(1337);
  for (const n of nodes) {
    const r = seededRand(hashId(n.id));
    n.x = (rand() * 0.3 + r() * 0.7) * W - W / 2;
    n.y = (rand() * 0.3 + r() * 0.7) * H - H / 2;
    n.vx = 0;
    n.vy = 0;
  }
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const k = Math.sqrt((W * H) / Math.max(1, nodes.length)) * 0.8;
  let temp = W / 8;
  for (let it = 0; it < iters; it++) {
    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      let fx = 0,
        fy = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const f = (k * k) / d2;
        fx += dx * f;
        fy += dy * f;
      }
      a.vx = fx;
      a.vy = fy;
    }
    // attraction
    for (const e of edges) {
      const ai = idx.get(e.source);
      const bi = idx.get(e.target);
      if (ai == null || bi == null) continue;
      const a = nodes[ai];
      const b = nodes[bi];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = (d * d) / k;
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      a.vx -= ux;
      a.vy -= uy;
      b.vx += ux;
      b.vy += uy;
    }
    // gravity toward center
    for (const a of nodes) {
      a.vx += -a.x * 0.01;
      a.vy += -a.y * 0.01;
    }
    // step + cool
    for (const a of nodes) {
      const disp = Math.sqrt(a.vx * a.vx + a.vy * a.vy) + 0.01;
      a.x += (a.vx / disp) * Math.min(disp, temp);
      a.y += (a.vy / disp) * Math.min(disp, temp);
    }
    temp *= 0.97;
  }
}

// ---------------- Component ----------------
function KnowledgeGraphPage() {
  const casesQ = useQuery({ queryKey: ["kg", "cases"], queryFn: listCases });
  const sectionsQ = useQuery({ queryKey: ["kg", "sections"], queryFn: listSections });
  const sourcesQ = useQuery({ queryKey: ["kg", "sources"], queryFn: listSources });
  const templatesQ = useQuery({ queryKey: ["kg", "templates"], queryFn: listTemplates });
  const keywordsQ = useQuery({ queryKey: ["kg", "keywords"], queryFn: listKeywords });
  const linksQ = useQuery({ queryKey: ["kg", "legal-links"], queryFn: () => listCaseLegalLinks() });
  const caseKwQ = useQuery({
    queryKey: ["kg", "case-keywords"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_keywords")
        .select("case_id, keyword_id");
      if (error) throw error;
      return (data ?? []) as Array<{ case_id: string; keyword_id: string }>;
    },
  });

  const loading =
    casesQ.isLoading ||
    sectionsQ.isLoading ||
    templatesQ.isLoading ||
    keywordsQ.isLoading ||
    linksQ.isLoading ||
    caseKwQ.isLoading;
  const error =
    casesQ.error ||
    sectionsQ.error ||
    templatesQ.error ||
    keywordsQ.error ||
    linksQ.error ||
    caseKwQ.error;

  // Filters + search
  const [enabled, setEnabled] = useState<Record<NodeKind, boolean>>({
    case: true,
    section: true,
    template: true,
    keyword: true,
    faq: false,
    checklist: false,
  });
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Build graph
  const graph = useMemo(() => {
    const cases = (casesQ.data ?? []) as any[];
    const sections = (sectionsQ.data ?? []) as any[];
    const sources = (sourcesQ.data ?? []) as any[];
    const templates = (templatesQ.data ?? []) as any[];
    const keywords = (keywordsQ.data ?? []) as any[];
    const links = (linksQ.data ?? []) as any[];
    const caseKws = (caseKwQ.data ?? []) as any[];

    const sourceById = new Map(sources.map((s) => [s.id, s]));
    const nodes: GNode[] = [];
    const edges: GEdge[] = [];

    for (const c of cases) {
      nodes.push({
        id: `c:${c.id}`,
        kind: "case",
        label: c.title ?? "(ohne Titel)",
        meta: c.category ?? c.subcategory ?? undefined,
        editorTo: "/admin/faelle/$id",
        editorParams: { id: c.id },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
    for (const s of sections) {
      const src = sourceById.get(s.source_id);
      nodes.push({
        id: `s:${s.id}`,
        kind: "section",
        label: `${(src?.short_name ?? src?.name ?? "").toString()} ${s.section_number ?? ""}`.trim() || (s.title ?? "Abschnitt"),
        meta: s.title ?? undefined,
        editorTo: "/admin/rechtsgrundlagen",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
    for (const t of templates) {
      nodes.push({
        id: `t:${t.id}`,
        kind: "template",
        label: t.title ?? "(Vorlage)",
        editorTo: "/admin/vorlagen",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
    for (const k of keywords) {
      nodes.push({
        id: `k:${k.id}`,
        kind: "keyword",
        label: k.keyword ?? "(Schlagwort)",
        editorTo: "/admin/schlagwoerter",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
    // FAQ + Checklist nodes (per case, aggregate)
    for (const c of cases) {
      const faqArr = Array.isArray(c.faq) ? c.faq : [];
      if (faqArr.length > 0) {
        const id = `faq:${c.id}`;
        nodes.push({
          id,
          kind: "faq",
          label: `FAQ (${faqArr.length})`,
          meta: c.title,
          editorTo: "/admin/faelle/$id",
          editorParams: { id: c.id },
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
        });
        edges.push({ source: `c:${c.id}`, target: id, kind: "case-faq" });
      }
      const clArr = Array.isArray(c.checklist) ? c.checklist : [];
      if (clArr.length > 0) {
        const id = `cl:${c.id}`;
        nodes.push({
          id,
          kind: "checklist",
          label: `Checkliste (${clArr.length})`,
          meta: c.title,
          editorTo: "/admin/faelle/$id",
          editorParams: { id: c.id },
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
        });
        edges.push({ source: `c:${c.id}`, target: id, kind: "case-checklist" });
      }
    }

    // Edges: legal links
    for (const l of links) {
      if (l.case_id && l.legal_section_id) {
        edges.push({
          source: `c:${l.case_id}`,
          target: `s:${l.legal_section_id}`,
          kind: "case-section",
        });
      }
    }
    // Edges: case ↔ keyword
    for (const ck of caseKws) {
      edges.push({ source: `c:${ck.case_id}`, target: `k:${ck.keyword_id}`, kind: "case-keyword" });
    }
    // Edges: case ↔ template (match by title in documentation array)
    const templateByTitle = new Map(templates.map((t) => [String(t.title ?? "").toLowerCase().trim(), t.id]));
    for (const c of cases) {
      const docs = Array.isArray(c.documentation) ? c.documentation : [];
      for (const d of docs) {
        const tid = templateByTitle.get(String(d ?? "").toLowerCase().trim());
        if (tid) edges.push({ source: `c:${c.id}`, target: `t:${tid}`, kind: "case-template" });
      }
    }
    // Edges: case ↔ related case
    for (const c of cases) {
      const rel = Array.isArray(c.related_cases) ? c.related_cases : [];
      for (const rid of rel) {
        if (typeof rid === "string" && rid && rid !== c.id) {
          edges.push({ source: `c:${c.id}`, target: `c:${rid}`, kind: "case-case" });
        }
      }
    }

    // Filter by enabled kinds
    const nodesF = nodes.filter((n) => enabled[n.kind]);
    const idSet = new Set(nodesF.map((n) => n.id));
    const edgesF = edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));

    // Degree map (for orphan detection & sizing)
    const deg = new Map<string, number>();
    for (const e of edgesF) {
      deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
      deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
    }

    forceLayout(nodesF, edgesF);

    return { nodes: nodesF, edges: edgesF, deg, cases, sections, sources, templates, keywords, links, caseKws };
  }, [
    casesQ.data,
    sectionsQ.data,
    sourcesQ.data,
    templatesQ.data,
    keywordsQ.data,
    linksQ.data,
    caseKwQ.data,
    enabled,
  ]);

  // Pan / zoom
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => ({ ...v, k: Math.max(0.2, Math.min(4, v.k * factor)) }));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setView((v) => ({ ...v, x: drag.current!.vx + dx, y: drag.current!.vy + dy }));
  };
  const onMouseUp = () => {
    drag.current = null;
  };

  const resetView = () => setView({ x: 0, y: 0, k: 1 });

  // Search highlight
  const qLower = q.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!qLower) return null;
    const s = new Set<string>();
    for (const n of graph.nodes) {
      if (
        n.label.toLowerCase().includes(qLower) ||
        (n.meta ?? "").toLowerCase().includes(qLower)
      )
        s.add(n.id);
    }
    return s;
  }, [qLower, graph.nodes]);

  // Selected node info
  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const neighbors = useMemo(() => {
    if (!selected) return [] as GNode[];
    const ids = new Set<string>();
    for (const e of graph.edges) {
      if (e.source === selected.id) ids.add(e.target);
      if (e.target === selected.id) ids.add(e.source);
    }
    return graph.nodes.filter((n) => ids.has(n.id));
  }, [selected, graph.edges, graph.nodes]);

  // Orphans (no edges under active filters)
  const orphans = useMemo(
    () => graph.nodes.filter((n) => (graph.deg.get(n.id) ?? 0) === 0),
    [graph],
  );

  // Impact analysis for selected section
  const impact = useMemo(() => {
    if (!selected || selected.kind !== "section") return null;
    const sid = selected.id.slice(2);
    const linkedCases = (graph.links ?? []).filter((l: any) => l.legal_section_id === sid);
    const caseIds = new Set(linkedCases.map((l: any) => l.case_id));
    let docs = 0;
    let faqs = 0;
    for (const c of graph.cases) {
      if (!caseIds.has(c.id)) continue;
      docs += Array.isArray(c.documentation) ? c.documentation.length : 0;
      faqs += Array.isArray(c.faq) ? c.faq.length : 0;
    }
    return { cases: caseIds.size, docs, faqs };
  }, [selected, graph]);

  // Quality assessment for cases
  const qualityByCase = useMemo(() => {
    const linkCount = new Map<string, number>();
    for (const l of graph.links ?? []) {
      linkCount.set(l.case_id, (linkCount.get(l.case_id) ?? 0) + 1);
    }
    const kwCount = new Map<string, number>();
    for (const ck of graph.caseKws ?? []) {
      kwCount.set(ck.case_id, (kwCount.get(ck.case_id) ?? 0) + 1);
    }
    const titleMap = new Map<string, string[]>();
    for (const c of graph.cases) {
      const key = String(c.title ?? "").trim().toLowerCase();
      if (!key) continue;
      const arr = titleMap.get(key) ?? [];
      arr.push(c.id);
      titleMap.set(key, arr);
    }
    return graph.cases.map((c: any) => {
      const checks = [
        Boolean(c.short_answer),
        Boolean(c.legal_explanation ?? c.short_description),
        Boolean(c.recommendation ?? c.practice_tip),
        (linkCount.get(c.id) ?? 0) > 0,
        (kwCount.get(c.id) ?? 0) > 0,
        Array.isArray(c.checklist) && c.checklist.length > 0,
        Array.isArray(c.documentation) && c.documentation.length > 0,
      ];
      const done = checks.filter(Boolean).length;
      const pct = Math.round((done / checks.length) * 100);
      const missing: string[] = [];
      if (!checks[3]) missing.push("Rechtsgrundlage");
      if (!checks[4]) missing.push("Schlagwort");
      if (!checks[5]) missing.push("Checkliste");
      if (!checks[6]) missing.push("Dokumentvorlage");
      if (!checks[0]) missing.push("Kurzantwort");
      const dupIds = titleMap.get(String(c.title ?? "").trim().toLowerCase()) ?? [];
      const duplicate = dupIds.length > 1;
      const similar = Array.isArray(c.related_cases) ? c.related_cases.length : 0;
      return { id: c.id, title: c.title as string, pct, missing, duplicate, similar };
    });
  }, [graph]);

  if (loading) return <LoadingState label="Knowledge Graph wird geladen …" />;
  if (error) return <ErrorState error={error as Error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Knowledge Graph</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Visualisiert alle Inhalte und ihre Verbindungen. Klick auf einen Knoten öffnet den zugehörigen Editor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Graph canvas */}
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Knoten suchen …"
                className="pl-7 h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setView((v) => ({ ...v, k: Math.min(4, v.k * 1.2) }))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setView((v) => ({ ...v, k: Math.max(0.2, v.k / 1.2) }))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={resetView}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2 text-xs">
            {(Object.keys(KIND_LABEL) as NodeKind[]).map((k) => (
              <label
                key={k}
                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={enabled[k]}
                  onChange={(e) => setEnabled((s) => ({ ...s, [k]: e.target.checked }))}
                />
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: KIND_COLOR[k] }}
                />
                {KIND_LABEL[k]}
              </label>
            ))}
          </div>

          <div className="relative">
            <svg
              ref={svgRef}
              viewBox="-600 -400 1200 800"
              className="h-[600px] w-full cursor-grab active:cursor-grabbing"
              onWheel={onWheel}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                {graph.edges.map((e, i) => {
                  const a = graph.nodes.find((n) => n.id === e.source);
                  const b = graph.nodes.find((n) => n.id === e.target);
                  if (!a || !b) return null;
                  const isHighlight =
                    selected && (e.source === selected.id || e.target === selected.id);
                  return (
                    <line
                      key={i}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={isHighlight ? "hsl(221 83% 53%)" : "hsl(0 0% 60% / 0.35)"}
                      strokeWidth={isHighlight ? 1.5 : 0.6}
                    />
                  );
                })}
                {graph.nodes.map((n) => {
                  const isMatch = matchIds ? matchIds.has(n.id) : true;
                  const isSel = selected?.id === n.id;
                  const r = KIND_RADIUS[n.kind] + Math.min(6, (graph.deg.get(n.id) ?? 0) * 0.4);
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x} ${n.y})`}
                      opacity={isMatch ? 1 : 0.15}
                      style={{ cursor: "pointer" }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelectedId(n.id);
                      }}
                    >
                      <circle
                        r={r}
                        fill={KIND_COLOR[n.kind]}
                        stroke={isSel ? "hsl(0 0% 100%)" : "hsl(0 0% 0% / 0.25)"}
                        strokeWidth={isSel ? 3 : 0.8}
                      />
                      {(view.k >= 1.2 || isSel) && (
                        <text
                          y={r + 10}
                          textAnchor="middle"
                          fontSize={9}
                          fill="hsl(var(--foreground))"
                          style={{ pointerEvents: "none" }}
                        >
                          {n.label.length > 32 ? n.label.slice(0, 30) + "…" : n.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
            <div className="pointer-events-none absolute bottom-2 right-3 rounded bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
              {graph.nodes.length} Knoten · {graph.edges.length} Verbindungen · Zoom {Math.round(view.k * 100)}%
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Auswahl</h2>
            {!selected && (
              <p className="text-xs text-muted-foreground">
                Klicken Sie einen Knoten an, um Details, „Verwendet in …“ und Impact anzuzeigen.
              </p>
            )}
            {selected && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: KIND_COLOR[selected.kind] }}
                  />
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {KIND_LABEL[selected.kind]}
                  </span>
                </div>
                <div className="font-medium">{selected.label}</div>
                {selected.meta && <div className="text-xs text-muted-foreground">{selected.meta}</div>}
                {selected.editorTo && (
                  <Link
                    to={selected.editorTo as any}
                    params={selected.editorParams as any}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Editor öffnen
                  </Link>
                )}
                <div className="pt-2">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Verwendet in / verknüpft mit ({neighbors.length})
                  </div>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto pr-1 text-xs">
                    {neighbors.map((n) => (
                      <li key={n.id} className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: KIND_COLOR[n.kind] }}
                        />
                        <button
                          className="truncate text-left hover:underline"
                          onClick={() => setSelectedId(n.id)}
                        >
                          {n.label}
                        </button>
                      </li>
                    ))}
                    {neighbors.length === 0 && (
                      <li className="text-muted-foreground">Keine Verknüpfungen (verwaist).</li>
                    )}
                  </ul>
                </div>
                {impact && (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                    <div className="font-semibold text-amber-700 dark:text-amber-400">
                      Impact-Analyse
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      Eine Änderung dieser Rechtsgrundlage betrifft:
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      <li>· {impact.cases} Praxisfälle</li>
                      <li>· {impact.docs} Dokumente</li>
                      <li>· {impact.faqs} FAQ-Einträge</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Verwaiste Inhalte ({orphans.length})
            </h2>
            {orphans.length === 0 ? (
              <p className="text-xs text-muted-foreground">Alle sichtbaren Knoten sind verknüpft.</p>
            ) : (
              <ul className="max-h-48 space-y-0.5 overflow-y-auto pr-1 text-xs">
                {orphans.slice(0, 100).map((n) => (
                  <li key={n.id} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: KIND_COLOR[n.kind] }}
                    />
                    <button
                      className="truncate text-left hover:underline"
                      onClick={() => setSelectedId(n.id)}
                    >
                      {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Quality panel */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Qualitätsprüfung Praxisfälle</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-2">Fall</th>
                <th className="py-1.5 pr-2">Vollständigkeit</th>
                <th className="py-1.5 pr-2">Fehlend</th>
                <th className="py-1.5 pr-2">Ähnliche</th>
                <th className="py-1.5 pr-2">Dublette</th>
                <th className="py-1.5 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {qualityByCase.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-2 font-medium">{c.title}</td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${
                            c.pct >= 80
                              ? "bg-emerald-500"
                              : c.pct >= 50
                                ? "bg-amber-500"
                                : "bg-rose-500"
                          }`}
                          style={{ width: `${c.pct}%` }}
                        />
                      </div>
                      <span className="tabular-nums">{c.pct}%</span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {c.missing.length === 0 ? "—" : c.missing.join(", ")}
                  </td>
                  <td className="py-1.5 pr-2">{c.similar}</td>
                  <td className="py-1.5 pr-2">
                    {c.duplicate ? (
                      <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-700 dark:text-rose-400">
                        Titel doppelt
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <Link
                      to="/admin/faelle/$id"
                      params={{ id: c.id }}
                      className="text-primary hover:underline"
                    >
                      Öffnen
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
