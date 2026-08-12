import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles, ShieldCheck, ClipboardList, Wand2, ExternalLink, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  deriveQualityTasks,
  loadCaseForEvaluation,
  statusLabel,
  type EvalResult,
  type QualityTask,
  type QualityTaskCategory,
  type QualityTaskFixType,
} from "@/lib/qualityEngine";
import { fixCaseQualityTasks, optimizeUntilStable, type BatchFixReport, type QualityFixResult } from "@/lib/qualityFixManager";
import { publishCasesBatch, type PublishReport } from "@/lib/casePipeline";

export const Route = createFileRoute("/admin/qualitaetsmanager")({
  component: QualityManagerPage,
});

type SourceMode = "last-run" | "all-drafts" | "published-review";

type CaseMeta = {
  id: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  status: string | null;
};

type EvalMap = Record<string, EvalResult>;

const CATS: QualityTaskCategory[] = ["INHALT", "RECHT", "VERNETZUNG", "REDAKTION", "TECHNIK"];

function readLastRunIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem("rk:lastGeneratedCaseIds");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function loadCaseMetas(ids: string[]): Promise<CaseMeta[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("practice_cases")
    .select("id, title, category, subcategory, status")
    .in("id", ids);
  if (error) throw error;
  return ((data ?? []) as unknown as CaseMeta[]);
}

async function loadDraftCaseMetas(): Promise<CaseMeta[]> {
  const { data, error } = await supabase
    .from("practice_cases")
    .select("id, title, category, subcategory, status")
    .neq("status", "published")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as CaseMeta[]);
}

async function loadPublishedCaseMetas(): Promise<CaseMeta[]> {
  const { data, error } = await supabase
    .from("practice_cases")
    .select("id, title, category, subcategory, status")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as CaseMeta[]);
}

type LegalLinkInfo = {
  section_id: string;
  section_number: string;
  source_short: string;
};

/**
 * Ermittelt pro Fall die zugeordneten Rechtsgrundlagen inkl. Section-Nummer und Quellen-Kurz.
 * Wird für die §53-Standardzuordnungs-Prüfung genutzt.
 */
async function loadLegalLinksForCases(caseIds: string[]): Promise<Record<string, LegalLinkInfo[]>> {
  if (caseIds.length === 0) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("case_legal_links") as any)
    .select("case_id, legal_section_id, legal_sections(section_number, legal_sources(short_name, name))")
    .in("case_id", caseIds);
  if (error) throw error;
  const out: Record<string, LegalLinkInfo[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const sec = row.legal_sections;
    const src = sec?.legal_sources;
    const info: LegalLinkInfo = {
      section_id: row.legal_section_id,
      section_number: String(sec?.section_number ?? ""),
      source_short: String(src?.short_name ?? src?.name ?? ""),
    };
    (out[row.case_id] ??= []).push(info);
  }
  return out;
}

function isSchulg53Only(links: LegalLinkInfo[] | undefined): boolean {
  if (!links || links.length !== 1) return false;
  const l = links[0];
  const num = l.section_number.replace(/\s/g, "");
  const src = l.source_short.toLowerCase();
  return (num.startsWith("53") || num.startsWith("§53")) && (src.includes("schulg") || src.includes("schulgesetz"));
}

function QualityManagerPage() {
  const qc = useQueryClient();
  const [source, setSource] = useState<SourceMode>("last-run");
  const [caseMetas, setCaseMetas] = useState<CaseMeta[]>([]);
  const [evals, setEvals] = useState<EvalMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTaskKeys, setSelectedTaskKeys] = useState<Set<string>>(new Set());
  const [filterCat, setFilterCat] = useState<"all" | QualityTaskCategory | "fixable" | "critical" | "review">("all");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"tasks" | "cases">("tasks");

  const [fixing, setFixing] = useState(false);
  const [fixProgress, setFixProgress] = useState<{ processed: number; total: number; succeeded: number; needsReview: number; failed: number } | null>(null);
  const [lastReport, setLastReport] = useState<BatchFixReport | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeRounds, setOptimizeRounds] = useState<BatchFixReport[] | null>(null);

  const [threshold, setThreshold] = useState<100 | 95 | 90>(100);
  const [publishing, setPublishing] = useState(false);
  const [publishReport, setPublishReport] = useState<PublishReport | null>(null);

  // Nur relevant im "published-review"-Modus: pro Fall die aktuellen Rechts-Zuordnungen.
  const [legalLinks, setLegalLinks] = useState<Record<string, LegalLinkInfo[]>>({});

  const taskKey = (t: QualityTask) => `${t.caseId}::${t.code}`;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const metas =
        source === "last-run"
          ? await loadCaseMetas(readLastRunIds())
          : source === "all-drafts"
            ? await loadDraftCaseMetas()
            : await loadPublishedCaseMetas();
      setCaseMetas(metas);
      const ids = metas.map((m) => m.id);
      const [evalArr, links] = await Promise.all([
        Promise.all(
          ids.map(async (id) => {
            try {
              return [id, await loadCaseForEvaluation(id)] as const;
            } catch (e) {
              return [id, null, e instanceof Error ? e.message : String(e)] as const;
            }
          }),
        ),
        source === "published-review" ? loadLegalLinksForCases(ids) : Promise.resolve({} as Record<string, LegalLinkInfo[]>),
      ]);
      const map: EvalMap = {};
      for (const [id, ev] of evalArr) if (ev) map[id] = ev;
      setEvals(map);
      setLegalLinks(links);
      setSelectedTaskKeys(new Set());
      setLastReport(null);
      setOptimizeRounds(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => { void reload(); }, [reload]);

  const schulg53OnlyIds = useMemo(() => {
    if (source !== "published-review") return new Set<string>();
    const s = new Set<string>();
    for (const meta of caseMetas) {
      if (isSchulg53Only(legalLinks[meta.id])) s.add(meta.id);
    }
    return s;
  }, [source, caseMetas, legalLinks]);

  const allTasks = useMemo(() => {
    const out: QualityTask[] = [];
    for (const meta of caseMetas) {
      const ev = evals[meta.id];
      if (!ev) continue;
      for (const t of deriveQualityTasks(ev)) out.push(t);
      // Synthetische Aufgabe im Published-Review-Modus:
      // Nur §53 zugeordnet → weitere passende Rechtsgrundlagen ermitteln (Re-Matching).
      if (schulg53OnlyIds.has(meta.id)) {
        out.push({
          caseId: meta.id,
          code: "SCHULG53_ONLY",
          category: "RECHT",
          severity: "error",
          title: "Nur §53 SchulG NRW zugeordnet – weitere Rechtsgrundlagen ergänzen",
          description:
            "§53 wurde vermutlich als Standard-Fallback zugeordnet. Bitte über das zentrale Rechts-Matching weitere passende Rechtsgrundlagen ermitteln. §53 wird nicht automatisch entfernt.",
          fixable: true,
          fixType: "legal_matching",
          currentPoints: 0,
          expectedImpact: 5,
        });
      }
    }
    return out;
  }, [caseMetas, evals, schulg53OnlyIds]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTasks.filter((t) => {
      if (filterCat === "fixable" && !t.fixable) return false;
      if (filterCat === "critical" && t.severity !== "critical") return false;
      if (filterCat === "review" && t.fixable) return false;
      if (filterCat !== "all" && filterCat !== "fixable" && filterCat !== "critical" && filterCat !== "review" && t.category !== filterCat) return false;
      if (q) {
        const meta = caseMetas.find((m) => m.id === t.caseId);
        const hay = `${meta?.title ?? ""} ${t.title} ${t.description} ${t.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allTasks, filterCat, search, caseMetas]);

  // KPIs
  const kpis = useMemo(() => {
    let ge100 = 0, ge90 = 0, lt90 = 0, hb = 0, ready = 0, sum = 0, cnt = 0;
    for (const meta of caseMetas) {
      const ev = evals[meta.id];
      if (!ev) continue;
      cnt++;
      sum += ev.score;
      if (ev.score >= 100) ge100++;
      else if (ev.score >= 90) ge90++;
      else lt90++;
      if (ev.hardBlockers.length > 0) hb++;
      if (ev.publicationReady) ready++;
    }
    const fixable = allTasks.filter((t) => t.fixable).length;
    const review = allTasks.filter((t) => !t.fixable).length;
    return {
      total: caseMetas.length,
      ge100, ge90, lt90, hb, ready,
      avg: cnt > 0 ? Math.round(sum / cnt) : 0,
      openTasks: allTasks.length,
      fixable,
      review,
    };
  }, [caseMetas, evals, allTasks]);

  const readyForPublish = useMemo(() => {
    return caseMetas.filter((m) => {
      const ev = evals[m.id];
      if (!ev) return false;
      if (ev.hardBlockers.length > 0) return false;
      if (m.status === "published") return false;
      return ev.score >= threshold;
    });
  }, [caseMetas, evals, threshold]);

  const toggleTask = (k: string) => {
    setSelectedTaskKeys((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k); else s.add(k);
      return s;
    });
  };
  const selectAllVisible = () => setSelectedTaskKeys(new Set(filteredTasks.map(taskKey)));
  const selectAllFixable = () => setSelectedTaskKeys(new Set(filteredTasks.filter((t) => t.fixable).map(taskKey)));
  const clearSelection = () => setSelectedTaskKeys(new Set());

  const runFix = async (tasks: QualityTask[]) => {
    if (tasks.length === 0) {
      toast.warning("Keine Aufgaben ausgewählt.");
      return;
    }
    setFixing(true);
    setFixProgress({ processed: 0, total: tasks.length, succeeded: 0, needsReview: 0, failed: 0 });
    setLastReport(null);
    try {
      const report = await fixCaseQualityTasks(tasks, {
        onProgress: (p) => setFixProgress(p),
      });
      setLastReport(report);
      // finalize evals
      setEvals((prev) => ({ ...prev, ...report.reevaluated }));
      setSelectedTaskKeys(new Set());
      // Nach dem Fix alle relevanten Caches invalidieren, damit KPIs, Fallakte,
      // Wissenskarten und veröffentlichte Fälle sofort den DB-Stand zeigen.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["published-cases"] }),
        qc.invalidateQueries({ queryKey: ["admin", "cases"] }),
        qc.invalidateQueries({ queryKey: ["knowledge-index"] }),
        qc.invalidateQueries({ queryKey: ["case-legal-links"] }),
        qc.invalidateQueries({ queryKey: ["case-keywords"] }),
        qc.invalidateQueries({ queryKey: ["case-templates"] }),
        qc.invalidateQueries({ queryKey: ["case-detail"] }),
      ]);
      // Für die betroffenen Fälle die Statuszellen im Manager direkt neu laden,
      // damit Aufgaben, die durch den Fix wegfallen, sofort verschwinden.
      const affectedIds = Array.from(new Set(tasks.map((t) => t.caseId)));
      const refreshed = await Promise.all(
        affectedIds.map(async (id) => {
          try {
            return [id, await loadCaseForEvaluation(id)] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      setEvals((prev) => {
        const next = { ...prev };
        for (const [id, ev] of refreshed) if (ev) next[id] = ev;
        return next;
      });
      if (source === "published-review") {
        const refreshedLinks = await loadLegalLinksForCases(affectedIds);
        setLegalLinks((prev) => {
          const next = { ...prev };
          for (const id of affectedIds) next[id] = refreshedLinks[id] ?? [];
          return next;
        });
      }
      toast.success(`Fix abgeschlossen: ${report.summary.succeeded} erfolgreich, ${report.summary.needsReview} zur Prüfung, ${report.summary.failed} fehlgeschlagen.`);
    } catch (e) {
      toast.error("Batch-Fix fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setFixing(false);
    }
  };

  const fixSelected = () => {
    const set = selectedTaskKeys;
    const tasks = allTasks.filter((t) => set.has(taskKey(t)));
    void runFix(tasks);
  };

  const optimizeAll = async () => {
    setOptimizing(true);
    setOptimizeRounds(null);
    try {
      const { rounds, finalEvals } = await optimizeUntilStable(caseMetas.map((m) => m.id), {
        maxRounds: 3,
        onRound: (round, report) => {
          toast(`Runde ${round}: ${report.summary.succeeded} behoben, ${report.summary.needsReview} zur Prüfung.`);
        },
      });
      setOptimizeRounds(rounds);
      setEvals((prev) => ({ ...prev, ...finalEvals }));
      toast.success(`Optimierung abgeschlossen (${rounds.length} Runde${rounds.length === 1 ? "" : "n"}).`);
    } catch (e) {
      toast.error("Optimierung fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOptimizing(false);
    }
  };

  const publish = async () => {
    if (readyForPublish.length === 0) {
      toast.warning("Keine Fälle zur Veröffentlichung verfügbar.");
      return;
    }
    setPublishing(true);
    setPublishReport(null);
    try {
      const rep = await publishCasesBatch(readyForPublish.map((m) => m.id));
      setPublishReport(rep);
      toast.success(`${rep.published.length} Fälle veröffentlicht, ${rep.rejected.length} abgelehnt, ${rep.errors.length} Fehler.`);
      await qc.invalidateQueries({ queryKey: ["published-cases"] });
      await qc.invalidateQueries({ queryKey: ["knowledge-index"] });
      await qc.invalidateQueries({ queryKey: ["admin", "cases"] });
      await reload();
    } catch (e) {
      toast.error("Veröffentlichung fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Sparkles className="h-6 w-6 text-primary" />
            Qualitätsmanager
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministische Quality Engine · konkrete Aufgaben pro Fall · Batch-Fix · erneute Prüfung · Veröffentlichung. Der Qualitätsscore wird ausschließlich datenbasiert berechnet – nie durch die KI festgelegt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/ki-entwurfsmaschine"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            KI-Entwurfsmaschine
          </Link>
        </div>
      </div>

      {/* 1. Runselector */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs font-semibold uppercase text-muted-foreground">Datenquelle</Label>
          <button
            type="button"
            onClick={() => setSource("last-run")}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${source === "last-run" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
          >
            Aktueller/letzter Generierungslauf ({readLastRunIds().length})
          </button>
          <button
            type="button"
            onClick={() => setSource("all-drafts")}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${source === "all-drafts" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
          >
            Alle Draft-Fälle (max. 200)
          </button>
          <button
            type="button"
            onClick={() => setSource("published-review")}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${source === "published-review" ? "border-amber-500 bg-amber-500/10 text-amber-800" : "border-border hover:bg-muted"}`}
            title="Bereits veröffentlichte Fälle prüfen, §53-Standardzuordnung erkennen und Do's auf mindestens 5 anheben."
          >
            Veröffentlichte Fälle prüfen und nachbessern
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Neu prüfen
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {source === "published-review" && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900">
            <p className="font-semibold">Nachprüfung veröffentlichter Fälle</p>
            <p className="mt-1">
              Geprüft: {caseMetas.length} veröffentlichte Fälle · Nur §53 SchulG NRW zugeordnet: <strong>{schulg53OnlyIds.size}</strong> · Fälle mit weniger als 5 Do's: <strong>{caseMetas.filter((m) => (evals[m.id]?.counts.doCount ?? 0) < 5).length}</strong> · Ohne Schlagwörter: <strong>{caseMetas.filter((m) => (evals[m.id]?.counts.keywordCount ?? 0) === 0).length}</strong> · Ohne Vorlagen: <strong>{caseMetas.filter((m) => (evals[m.id]?.counts.templateCount ?? 0) === 0).length}</strong>.
            </p>
            <p className="mt-1">
              Eindeutig unpassende §53-Zuordnungen werden automatisch entfernt; unklare Fälle bleiben redaktionelle Prüfung. Der Batch-Fix führt danach das zentrale Rechts-Matching, Schlagwort-/Vorlagen-Matching sowie eine gezielte Do's-Nachbesserung aus. Bestehender Status <code>published</code> bleibt erhalten.
            </p>
          </div>
        )}
      </section>

      {/* 2. KPI-Kacheln */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Gesamt" value={kpis.total} />
        <Kpi label="100 % Qualität" value={kpis.ge100} tone="green" />
        <Kpi label="90–99 %" value={kpis.ge90} tone="amber" />
        <Kpi label="< 90 %" value={kpis.lt90} tone="rose" />
        <Kpi label="Hard Blocker" value={kpis.hb} tone="rose" />
        <Kpi label="Offene Aufgaben" value={kpis.openTasks} />
        <Kpi label="Automatisch behebbar" value={kpis.fixable} tone="primary" />
        <Kpi label="Redaktionelle Prüfung" value={kpis.review} tone="amber" />
        <Kpi label="Veröffentlichungsreif" value={kpis.ready} tone="green" />
        <Kpi label="Ø Qualität" value={`${kpis.avg} %`} />
      </section>

      {/* 5. Tabs */}
      <div className="inline-flex rounded-lg border border-border bg-card p-1 text-xs">
        <button
          onClick={() => setTab("tasks")}
          className={`rounded-md px-3 py-1.5 font-medium ${tab === "tasks" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          Aufgaben ({allTasks.length})
        </button>
        <button
          onClick={() => setTab("cases")}
          className={`ml-1 rounded-md px-3 py-1.5 font-medium ${tab === "cases" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          Praxisfälle ({caseMetas.length})
        </button>
      </div>

      {/* 6. Filter + 7. Liste */}
      {tab === "tasks" && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FilterBtn label="Alle" active={filterCat === "all"} onClick={() => setFilterCat("all")} />
            <FilterBtn label="Automatisch behebbar" active={filterCat === "fixable"} onClick={() => setFilterCat("fixable")} />
            <FilterBtn label="Redaktionelle Prüfung" active={filterCat === "review"} onClick={() => setFilterCat("review")} />
            <FilterBtn label="Kritisch" active={filterCat === "critical"} onClick={() => setFilterCat("critical")} />
            {CATS.map((c) => (
              <FilterBtn key={c} label={c} active={filterCat === c} onClick={() => setFilterCat(c)} />
            ))}
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche Fall/Aufgabe/Kategorie"
              className="h-8 max-w-xs"
            />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={selectAllVisible}>Alle sichtbaren auswählen</Button>
            <Button size="sm" variant="outline" onClick={selectAllFixable}>Alle behebbaren auswählen</Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>Auswahl aufheben</Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {selectedTaskKeys.size} von {filteredTasks.length} ausgewählt
            </span>
          </div>

          <div className="max-h-[600px] overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="p-2 w-8"></th>
                  <th className="p-2">Praxisfall</th>
                  <th className="p-2">Kategorie</th>
                  <th className="p-2">Aufgabe</th>
                  <th className="p-2">Schwere</th>
                  <th className="p-2">Fix-Typ</th>
                  <th className="p-2">Impact</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 && (
                  <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Keine Aufgaben.</td></tr>
                )}
                {filteredTasks.map((t) => {
                  const meta = caseMetas.find((m) => m.id === t.caseId);
                  const k = taskKey(t);
                  const result = lastReport?.results.find((r) => r.task.caseId === t.caseId && r.task.code === t.code);
                  return (
                    <tr key={k} className="border-t border-border">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedTaskKeys.has(k)}
                          onChange={() => toggleTask(k)}
                        />
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{meta?.title ?? t.caseId.slice(0, 8)}</div>
                        <div className="text-[10px] text-muted-foreground">{meta?.category ?? "—"}</div>
                      </td>
                      <td className="p-2"><CatBadge cat={t.category} /></td>
                      <td className="p-2">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-[11px] text-muted-foreground">{t.description}</div>
                      </td>
                      <td className="p-2"><SevBadge s={t.severity} /></td>
                      <td className="p-2 text-[11px]"><FixTypeBadge f={t.fixType} /></td>
                      <td className="p-2 text-[11px]">+{t.expectedImpact}</td>
                      <td className="p-2 text-[11px]">
                        {result ? <OutcomeBadge outcome={result.outcome} message={result.message} /> : "Offen"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "cases" && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="max-h-[600px] overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="p-2">Titel</th>
                  <th className="p-2">Kategorie</th>
                  <th className="p-2">Qualität</th>
                  <th className="p-2">Inhalt/Recht/Vern./Red.</th>
                  <th className="p-2">Aufgaben</th>
                  <th className="p-2">Hard Blocker</th>
                  <th className="p-2">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {caseMetas.map((m) => {
                  const ev = evals[m.id];
                  if (!ev) return (
                    <tr key={m.id} className="border-t border-border">
                      <td colSpan={8} className="p-2 text-muted-foreground">{m.title} – Prüfung nicht verfügbar</td>
                    </tr>
                  );
                  const tasks = deriveQualityTasks(ev);
                  const status = statusLabel(ev);
                  return (
                    <tr key={m.id} className="border-t border-border">
                      <td className="p-2 font-medium">{m.title}</td>
                      <td className="p-2">{m.category ?? "—"}</td>
                      <td className="p-2 font-mono">{ev.score}/100</td>
                      <td className="p-2 font-mono">{ev.sub.inhalt}/{ev.sub.recht}/{ev.sub.vernetzung}/{ev.sub.redaktion}</td>
                      <td className="p-2">{tasks.length}</td>
                      <td className="p-2">{ev.hardBlockers.length > 0 ? <span className="text-rose-600">{ev.hardBlockers.length}</span> : "—"}</td>
                      <td className="p-2">{status.label}</td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => runFix(tasks.filter((t) => t.fixable))}>Fall fixen</Button>
                          <Link to="/admin/faelle/$id" params={{ id: m.id }} className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><ExternalLink className="mr-1 h-3 w-3" />öffnen</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 8. Batch-Fix-Aktionen */}
      <section className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4" />Schritt 1: Qualität verbessern</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={fixSelected} disabled={fixing || optimizing || selectedTaskKeys.size === 0}>
            {fixing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Ausgewählte Aufgaben beheben ({selectedTaskKeys.size})
          </Button>
          <Button size="lg" variant="secondary" onClick={optimizeAll} disabled={fixing || optimizing || caseMetas.length === 0}>
            {optimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Alle behebbaren Qualitätsaufgaben optimieren (max. 3 Runden)
          </Button>
        </div>
        {fixProgress && fixing && (
          <div className="mt-4 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${(fixProgress.processed / Math.max(1, fixProgress.total)) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {fixProgress.processed} / {fixProgress.total} bearbeitet · {fixProgress.succeeded} behoben · {fixProgress.needsReview} zur Prüfung · {fixProgress.failed} fehlgeschlagen
            </p>
          </div>
        )}
      </section>

      {/* 9. Ergebnisbereich */}
      {(lastReport || optimizeRounds) && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Qualitätsoptimierung abgeschlossen</h2>
          {lastReport && (
            <FixResultBlock report={lastReport} caseMetas={caseMetas} title="Letzter Batch-Fix" />
          )}
          {optimizeRounds && optimizeRounds.map((r, i) => (
            <FixResultBlock key={i} report={r} caseMetas={caseMetas} title={`Optimierung – Runde ${i + 1}`} />
          ))}
        </section>
      )}

      {/* 10. Veröffentlichung */}
      <section className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />Schritt 2: Qualitätsgeprüfte Fälle veröffentlichen</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Label className="font-semibold uppercase text-muted-foreground">Schwelle</Label>
          {([100, 95, 90] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setThreshold(v)}
              className={`rounded-md border px-3 py-1.5 font-medium ${threshold === v ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "border-border hover:bg-muted"}`}
            >
              {v === 100 ? "Nur 100/100" : `Ab ${v}/100`}
            </button>
          ))}
          <span className="ml-2 text-muted-foreground">Hard Blocker verhindern die Veröffentlichung immer.</span>
        </div>
        <Button
          size="lg"
          onClick={publish}
          disabled={publishing || readyForPublish.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          Alle qualitätsgeprüften Fälle veröffentlichen ({readyForPublish.length})
        </Button>
        {publishReport && (
          <div className="mt-4 space-y-2 text-xs">
            <p><CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-600" />Veröffentlicht: {publishReport.published.length}</p>
            <p><AlertTriangle className="mr-1 inline h-3 w-3 text-amber-600" />Abgelehnt: {publishReport.rejected.length}</p>
            <p><XCircle className="mr-1 inline h-3 w-3 text-rose-600" />Fehler: {publishReport.errors.length}</p>
            {publishReport.rejected.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">Abgelehnte Fälle</summary>
                <ul className="mt-1 space-y-1 pl-4">
                  {publishReport.rejected.map((r) => (
                    <li key={r.caseId}>
                      <span className="font-mono">{r.caseId.slice(0, 8)}</span> – Score {r.score} · Blocker: {r.hardBlockers.join(", ") || "—"}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Vor jeder Veröffentlichung wird jeder Fall serverseitig erneut durch die zentrale Quality Engine geprüft (Race-Condition-Schutz).
        </p>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: number | string; tone?: "neutral" | "green" | "amber" | "rose" | "primary" }) {
  const tones = {
    neutral: "bg-card",
    green: "bg-emerald-500/10 text-emerald-700",
    amber: "bg-amber-500/10 text-amber-700",
    rose: "bg-rose-500/10 text-rose-700",
    primary: "bg-primary/10 text-primary",
  }[tone];
  return (
    <div className={`rounded-xl border border-border p-4 ${tones}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
    >
      {label}
    </button>
  );
}

function CatBadge({ cat }: { cat: QualityTaskCategory }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{cat}</span>;
}

function SevBadge({ s }: { s: QualityTask["severity"] }) {
  const color = s === "critical" ? "bg-rose-500/15 text-rose-700" : s === "error" ? "bg-orange-500/15 text-orange-700" : s === "warn" ? "bg-amber-500/15 text-amber-700" : "bg-muted";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>{s}</span>;
}

function FixTypeBadge({ f }: { f: QualityTaskFixType }) {
  const map: Record<QualityTaskFixType, string> = {
    ai_content: "KI-Inhalt",
    legal_matching: "Recht-Matching",
    legal_remove_irrelevant_53: "Rechtsgrundlage entfernen",
    keyword_matching: "Schlagwort-Matching",
    template_matching: "Vorlagen-Matching",
    similarity_matching: "Ähnlichkeit",
    manual: "Redaktion",
  };
  const color = f === "manual" ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>{map[f]}</span>;
}

function OutcomeBadge({ outcome, message }: { outcome: QualityFixResult["outcome"]; message: string }) {
  const map = {
    succeeded: ["bg-emerald-500/15 text-emerald-700", "✓ Behoben"],
    needs_review: ["bg-amber-500/15 text-amber-700", "⚠ Prüfung"],
    failed: ["bg-rose-500/15 text-rose-700", "✗ Fehler"],
    skipped: ["bg-muted", "übersprungen"],
  } as const;
  const [cls, label] = map[outcome];
  const visible = outcome === "skipped" && message ? `${label}: ${message.replace(/^Übersprungen:\s*/i, "")}` : label;
  return <span className={`inline-block max-w-48 rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`} title={message}>{visible}</span>;
}

function FixResultBlock({ report, caseMetas, title }: { report: BatchFixReport; caseMetas: CaseMeta[]; title: string }) {
  const s = report.summary;
  return (
    <div className="mb-4 rounded-md border border-border p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-4 font-semibold">
        <span>{title}</span>
        <span className="text-emerald-700">✓ {s.succeeded}</span>
        <span className="text-amber-700">⚠ {s.needsReview}</span>
        <span className="text-rose-700">✗ {s.failed}</span>
        <span className="text-muted-foreground">({s.total} Aufgaben, {s.casesAffected} Fälle)</span>
      </div>
      {report.results.filter((r) => r.outcome === "failed").length > 0 && (
        <details>
          <summary className="cursor-pointer">Fehlgeschlagene Aufgaben</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {report.results.filter((r) => r.outcome === "failed").map((r, i) => {
              const meta = caseMetas.find((m) => m.id === r.task.caseId);
              return (
                <li key={i}>
                  <span className="font-medium">{meta?.title ?? r.task.caseId.slice(0, 8)}</span> · {r.task.title} · {r.task.fixType}
                  {r.errorCode ? ` [${r.errorCode}]` : ""}: <span className="text-rose-600">{r.message}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {report.results.filter((r) => r.outcome === "skipped").length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer">Übersprungene Aufgaben mit Grund</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {report.results.filter((r) => r.outcome === "skipped").map((r, i) => {
              const meta = caseMetas.find((m) => m.id === r.task.caseId);
              return (
                <li key={i}>
                  <span className="font-medium">{meta?.title ?? r.task.caseId.slice(0, 8)}</span> · {r.task.title} · {r.task.fixType}: <span className="text-muted-foreground">{r.message}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
