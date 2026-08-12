import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, RefreshCw, Check, X, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  listSections,
  listSources,
  listKeywords,
  listCaseKeywords,
  linkCaseKeyword,
  createKeyword,
  listCaseLegalLinks,
  createLegalLink,
  listCases,
  listTemplates,
} from "@/lib/coreBuilder";
import { supabase } from "@/integrations/supabase/client";
import {
  matchCase,
  confidenceAmpel,
  ampelDot,
  type CaseMatchInput,
  type CaseMatchResult,
  type Catalogs,
  type SectionMatchEnriched,
  type TemplateMatch,
  type SimilarCaseMatch,
} from "@/lib/caseMatching";
import { applyKeywordMatches, type KeywordMatch } from "@/lib/keywordMatching";
import { applyTemplateMatches } from "@/lib/templateMatching";
import { cn } from "@/lib/utils";
import { completePracticeCase, type CompletionReport } from "@/lib/casePipeline.completion";
import { invalidatePracticeCaseQueries } from "@/lib/casePipeline.invalidate";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: string;
  input: CaseMatchInput;
};

const AUTO_ACCEPT_MIN = 70;

export function CaseNetworkingDialog({ open, onOpenChange, caseId, input }: Props) {
  const qc = useQueryClient();
  const [result, setResult] = useState<CaseMatchResult | null>(null);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineReport, setPipelineReport] = useState<CompletionReport | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"legal" | "cards" | "keywords" | "templates" | "similar">(
    "legal",
  );

  // Kataloge parallel laden
  const catalogsQ = useQuery({
    queryKey: ["case-networking", "catalogs", caseId],
    queryFn: async (): Promise<Catalogs> => {
      const [sections, sources, keywords, caseKws, caseLegal, cases, templates] =
        await Promise.all([
          listSections(),
          listSources(),
          listKeywords(),
          listCaseKeywords(caseId),
          listCaseLegalLinks(caseId),
          listCases(),
          listTemplates(),
        ]);
      // Case-Templates verknüpfte laden
      const linkedTplRes = await (supabase as any)
        .from("case_templates")
        .select("template_id")
        .eq("case_id", caseId);
      const linkedTemplateIds = (linkedTplRes.data ?? []).map((r: any) => r.template_id);

      // Legal-Sections mit Quelle & Wissenskarten-Flag
      const srcById = new Map((sources as any[]).map((s) => [s.id, s]));
      const sectionRefs = (sections as any[]).map((s) => {
        const src = srcById.get(s.source_id);
        const isCard = Boolean(
          s.practice_relevance || s.common_mistakes || s.recommendations || s.action_hint,
        );
        return {
          id: s.id,
          source_short: src?.short_name ?? src?.name ?? "",
          section_number: s.section_number ?? "",
          title: s.title ?? "",
          summary: (s.summary ?? "").slice(0, 260),
          is_knowledge_card: isCard,
        };
      });

      const caseRefs = (cases as any[])
        .filter((c) => c.id !== caseId)
        .map((c) => ({
          id: c.id,
          title: c.title ?? "",
          short_description: (c.short_description ?? "").slice(0, 400),
          category: c.category ?? "",
          subcategory: c.subcategory ?? "",
          keywords: [] as string[],
          legal_section_ids: [] as string[],
        }));

      return {
        sections: sectionRefs,
        keywords: (keywords ?? []).map((k: any) => k.keyword),
        templates: (templates as any[]).map((t) => ({
          id: t.id,
          title: t.title ?? "",
          type: t.template_type ?? "",
          description: "",
        })),
        cases: caseRefs,
        already_linked_sections: (caseLegal ?? []).map((l: any) => l.legal_section_id),
        already_linked_keywords: (caseKws ?? [])
          .map((k: any) => k?.keywords?.keyword as string | undefined)
          .filter((n): n is string => !!n),
        already_linked_templates: linkedTemplateIds,
      } satisfies Catalogs;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const run = async () => {
    if (!catalogsQ.data) return;
    setRunning(true);
    setResult(null);
    setDismissed(new Set());
    try {
      const enrichedInput: CaseMatchInput = {
        ...input,
        case_id: caseId,
        keywords: catalogsQ.data.already_linked_keywords ?? [],
        legal_section_ids: catalogsQ.data.already_linked_sections ?? [],
      };
      const r = await matchCase(enrichedInput, catalogsQ.data);
      setResult(r);
    } catch (e) {
      toast.error("KI-Analyse fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRunning(false);
    }
  };

  const alreadyLinkedSections = new Set(catalogsQ.data?.already_linked_sections ?? []);
  const alreadyLinkedKeywords = new Set(
    (catalogsQ.data?.already_linked_keywords ?? []).map((k) => k.toLowerCase()),
  );
  const alreadyLinkedTemplates = new Set(catalogsQ.data?.already_linked_templates ?? []);

  // Lookup-Maps für lesbare Titel im Vorschlag-Panel
  const sectionById = useMemo(() => {
    const m = new Map<string, { source_short?: string; section_number?: string; title?: string }>();
    for (const s of catalogsQ.data?.sections ?? []) m.set(s.id, s);
    return m;
  }, [catalogsQ.data?.sections]);
  const templateById = useMemo(() => {
    const m = new Map<string, { title: string; type?: string }>();
    for (const t of catalogsQ.data?.templates ?? []) m.set(t.id, t);
    return m;
  }, [catalogsQ.data?.templates]);

  const summary = useMemo(() => {
    if (!result) return null;
    return {
      legal: result.legal.status === "ok" ? result.legal.items.length : "!",
      cards: result.cards.status === "ok" ? result.cards.items.length : "!",
      keywords: result.keywords.status === "ok" ? result.keywords.items.length : "!",
      templates: result.templates.status === "ok" ? result.templates.items.length : "!",
      similar: result.similar.status === "ok" ? result.similar.items.length : "!",
      duplicates:
        result.similar.status === "ok"
          ? result.similar.items.filter((s) => s.is_possible_duplicate).length
          : 0,
      missing: result.debug.missing_areas,
    };
  }, [result]);

  const invalidateAll = () => {
    invalidatePracticeCaseQueries(qc, caseId);
  };

  const runCompletePipeline = async () => {
    setPipelineRunning(true);
    setPipelineReport(null);
    try {
      const report = await completePracticeCase(caseId, { source: "manual" });
      setPipelineReport(report);
      invalidateAll();
      const parts = [
        `${report.legal.assigned.length} Rechtsgrundlagen +`,
        report.legal.removed.length > 0 ? `${report.legal.removed.length} entfernt` : "",
        `${report.keywords.assigned} Schlagwörter`,
        `${report.templates.assigned} Vorlagen`,
        report.quality ? `Score ${report.quality.score}/100` : "",
      ].filter(Boolean);
      if (report.status === "completed_with_errors") {
        toast.warning("Pipeline mit Fehlern beendet: " + parts.join(" · "));
      } else {
        toast.success("Fall vollständig geprüft: " + parts.join(" · "));
      }
    } catch (e) {
      toast.error("Pipeline fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPipelineRunning(false);
    }
  };


  const applyLegalItem = async (m: SectionMatchEnriched) => {
    if (alreadyLinkedSections.has(m.id)) return;
    const relevance =
      m.relevance_stars >= 5 ? "high" : m.relevance_stars >= 3 ? "medium" : "low";
    await createLegalLink(caseId, m.id, m.reason, relevance as any);
    alreadyLinkedSections.add(m.id);
  };
  const applyKeywordItem = async (m: KeywordMatch) => {
    const lower = m.keyword.trim().toLowerCase();
    if (alreadyLinkedKeywords.has(lower)) return;
    const res = await applyKeywordMatches(caseId, [{ keyword: m.keyword }], {
      alreadyLinked: Array.from(alreadyLinkedKeywords),
    });
    if (res.failed > 0) {
      const first = res.errors[0];
      throw new Error(first?.message ?? "Zuordnung fehlgeschlagen");
    }
    alreadyLinkedKeywords.add(lower);
  };

  const applyTemplateItem = async (m: TemplateMatch) => {
    if (alreadyLinkedTemplates.has(m.id)) return;
    const relevance =
      m.confidence >= 85 ? "high" : m.confidence >= 60 ? "medium" : "low";
    const res = await applyTemplateMatches(
      caseId,
      [{ template_id: m.id, relevance, explanation: m.reason }],
      { alreadyLinked: Array.from(alreadyLinkedTemplates) },
    );
    if (res.failed > 0) {
      const first = res.errors[0];
      throw new Error(first?.message ?? "Zuordnung fehlgeschlagen");
    }
    alreadyLinkedTemplates.add(m.id);
  };

  const applyAllRecommended = async () => {
    if (!result) return;
    setApplying(true);
    const stats = { legal: 0, keywords: 0, templates: 0, fail: 0 };
    const errors: string[] = [];
    const isRecommended = (c: number) => c >= AUTO_ACCEPT_MIN;

    if (result.legal.status === "ok") {
      for (const m of result.legal.items) {
        if (!isRecommended(m.confidence) || dismissed.has("l:" + m.id)) continue;
        try { await applyLegalItem(m); stats.legal++; }
        catch (e) { stats.fail++; errors.push(`Rechtsgrundlage: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
    if (result.keywords.status === "ok") {
      for (const m of result.keywords.items) {
        if (!isRecommended(m.confidence) || dismissed.has("k:" + m.keyword)) continue;
        try { await applyKeywordItem(m); stats.keywords++; }
        catch (e) { stats.fail++; errors.push(`Schlagwort „${m.keyword}": ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
    if (result.templates.status === "ok") {
      for (const m of result.templates.items) {
        if (!isRecommended(m.confidence) || dismissed.has("t:" + m.id)) continue;
        try { await applyTemplateItem(m); stats.templates++; }
        catch (e) { stats.fail++; errors.push(`Vorlage: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
    setApplying(false);
    invalidateAll();
    const cards = result.cards.status === "ok" ? result.cards.items.length : 0;
    toast.success(
      [
        `✓ ${stats.legal} Rechtsgrundlagen`,
        `✓ ${stats.keywords} Schlagwörter`,
        `✓ ${stats.templates} Dokumentvorlagen`,
        `✓ ${cards} Wissenskarten über Rechtsgrundlagen verfügbar`,
        stats.fail > 0 ? `⚠ ${stats.fail} Fehler` : "",
      ].filter(Boolean).join(" · "),
      { duration: 6000 },
    );
    if (errors.length && import.meta.env.DEV) {
      console.warn("[CaseNetworking] Fehler beim Batch-Übernehmen:", errors);
    }
  };

  const oneShot = async (fn: () => Promise<void>, label: string) => {
    try {
      await fn();
      toast.success(`${label} erfolgreich zugeordnet.`);
      invalidateAll();
    } catch (e) {
      const err = e as any;
      console.error(`[CaseNetworking] ${label} fehlgeschlagen`, {
        caseId, message: err?.message, code: err?.code, details: err?.details, hint: err?.hint,
      });
      toast.error(`${label}: ` + (err?.message ?? String(err)) + (err?.hint ? ` (${err.hint})` : ""));
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur px-6 py-4">
          <DialogHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-violet-600" />
                  Fall automatisch vernetzen
                </DialogTitle>
                <DialogDescription>
                  KI schlägt passende Rechtsgrundlagen, Wissenskarten, Schlagwörter,
                  Dokumentvorlagen und ähnliche Praxisfälle vor. Redaktion prüft und
                  übernimmt.
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={run}
                  disabled={running || catalogsQ.isLoading}
                >
                  {running ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {result ? "Analyse erneut starten" : "🤖 Analyse starten"}
                </Button>
                <Button
                  size="sm"
                  disabled={!result || applying}
                  onClick={applyAllRecommended}
                >
                  {applying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Alle empfohlenen übernehmen
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-violet-600 hover:bg-violet-700"
                  disabled={pipelineRunning}
                  onClick={runCompletePipeline}
                  title="Zentrale Pipeline: Rechtsgrundlagen, § 53-Guard, Schlagwörter, Vorlagen, Quality"
                >
                  {pipelineRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Fall vollständig prüfen
                </Button>
              </div>
            </div>
            {pipelineReport && (
              <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={pipelineReport.status === "completed" ? "default" : "destructive"}>
                    Pipeline: {pipelineReport.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {pipelineReport.durationMs} ms · Quelle: {pipelineReport.source}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
                  {Object.entries(pipelineReport.steps).map(([k, s]) => (
                    <div key={k} className="flex items-center gap-1">
                      <span
                        className={cn(
                          "inline-block h-2 w-2 rounded-full",
                          s.status === "success" && "bg-emerald-500",
                          s.status === "warning" && "bg-amber-500",
                          s.status === "error" && "bg-rose-500",
                          s.status === "skipped" && "bg-slate-400",
                          (s.status === "pending" || s.status === "running") && "bg-slate-300",
                        )}
                      />
                      <span className="truncate">{k}: {s.message}</span>
                    </div>
                  ))}
                </div>
                {pipelineReport.legal.removed.length > 0 && (
                  <p className="mt-2 text-amber-700">
                    § 53-Guard: {pipelineReport.legal.removed.length} unpassende Verknüpfung(en) entfernt
                  </p>
                )}
                {pipelineReport.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-rose-700">
                      {pipelineReport.errors.length} Fehler
                    </summary>
                    <ul className="mt-1 list-disc pl-4">
                      {pipelineReport.errors.slice(0, 6).map((e, i) => (
                        <li key={i}>
                          <span className="font-medium">{e.step}:</span> {e.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {running && (
              <div className="mt-3">
                <Progress value={35} className="h-1.5" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Analysiere Kataloge · {catalogsQ.data?.sections.length ?? 0} Rechtsabschnitte ·{" "}
                  {catalogsQ.data?.templates.length ?? 0} Vorlagen ·{" "}
                  {catalogsQ.data?.cases.length ?? 0} Fälle …
                </p>
              </div>
            )}
            {summary && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <SumBadge ok={result?.legal.status === "ok"} label={`${summary.legal} Rechtsgrundlagen`} />
                <SumBadge ok={result?.cards.status === "ok"} label={`${summary.cards} Wissenskarten`} />
                <SumBadge ok={result?.keywords.status === "ok"} label={`${summary.keywords} Schlagwörter`} />
                <SumBadge ok={result?.templates.status === "ok"} label={`${summary.templates} Vorlagen`} />
                <SumBadge ok={result?.similar.status === "ok"} label={`${summary.similar} ähnliche Fälle`} />
                {summary.duplicates > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {summary.duplicates} mögliche Dublette{summary.duplicates > 1 ? "n" : ""}
                  </Badge>
                )}
                {summary.missing.map((m, i) => (
                  <Badge key={i} variant="outline" className="gap-1 border-amber-500 text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    {m}
                  </Badge>
                ))}
              </div>
            )}
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-4">
            <TabsList className="w-full flex-wrap h-auto">
              <TabsTrigger value="legal">⚖️ Rechtsgrundlagen</TabsTrigger>
              <TabsTrigger value="cards">📚 Wissenskarten</TabsTrigger>
              <TabsTrigger value="keywords">🏷️ Schlagwörter</TabsTrigger>
              <TabsTrigger value="templates">📄 Dokumentvorlagen</TabsTrigger>
              <TabsTrigger value="similar">🔗 Ähnliche Fälle</TabsTrigger>
            </TabsList>

            <ScrollArea className="mt-4 h-[55vh] pr-3">
              <TabsContent value="legal" className="mt-0 space-y-2">
                {renderBucketLegal(result, "legal", sectionById, (m) => {
                  const s = sectionById.get(m.id);
                  const label = s
                    ? `§ ${s.section_number ?? ""} ${s.source_short ?? ""}`.trim()
                    : `Rechtsgrundlage`;
                  return oneShot(() => applyLegalItem(m), label);
                })(alreadyLinkedSections, dismissed, setDismissed)}
              </TabsContent>

              <TabsContent value="cards" className="mt-0 space-y-2">
                {renderBucketLegal(result, "cards", sectionById, (m) => {
                  const s = sectionById.get(m.id);
                  const label = s
                    ? `Wissenskarte § ${s.section_number ?? ""} ${s.source_short ?? ""}`.trim()
                    : `Wissenskarte`;
                  return oneShot(() => applyLegalItem(m), label);
                })(alreadyLinkedSections, dismissed, setDismissed)}
              </TabsContent>

              <TabsContent value="keywords" className="mt-0 space-y-2">
                {renderKeywordBucket(result, (m) => oneShot(() => applyKeywordItem(m), `Schlagwort „${m.keyword}"`))(
                  alreadyLinkedKeywords,
                  dismissed,
                  setDismissed,
                )}
              </TabsContent>

              <TabsContent value="templates" className="mt-0 space-y-2">
                {renderTemplateBucket(
                  result,
                  catalogsQ.data?.templates ?? [],
                  (m) => {
                    const t = templateById.get(m.id);
                    return oneShot(() => applyTemplateItem(m), `Vorlage „${t?.title ?? m.id.slice(0, 8)}"`);
                  },
                )(alreadyLinkedTemplates, dismissed, setDismissed)}
              </TabsContent>

              <TabsContent value="similar" className="mt-0 space-y-2">
                {renderSimilarBucket(result)}
              </TabsContent>
            </ScrollArea>

          </Tabs>

          {result && import.meta.env.DEV && (
            <details className="mt-3 rounded border bg-muted/30 p-2 text-xs">
              <summary className="cursor-pointer font-medium">Debug</summary>
              <pre className="mt-2 overflow-x-auto text-[10px]">
                {JSON.stringify(result.debug, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SumBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "secondary" : "destructive"}>
      {ok ? "✓" : "✕"} {label}
    </Badge>
  );
}

function AmpelDot({ c }: { c: number }) {
  return <span className="text-base leading-none">{ampelDot(confidenceAmpel(c))}</span>;
}

function EmptyOr({
  result,
  bucket,
  items,
  render,
}: {
  result: CaseMatchResult | null;
  bucket: "legal" | "cards" | "keywords" | "templates" | "similar";
  items: any[];
  render: () => React.ReactNode;
}) {
  if (!result) {
    return (
      <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
        Klick auf „🤖 Analyse starten" oben, um Vorschläge zu erzeugen.
      </p>
    );
  }
  const b = (result as any)[bucket];
  if (b?.status === "error") {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Fehler: {b.error}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
        Keine passenden Vorschläge gefunden.
      </p>
    );
  }
  return <>{render()}</>;
}

function Row({
  ampel,
  confidence,
  title,
  subtitle,
  reason,
  signals,
  badges,
  actions,
  linked,
  dimmed,
}: {
  ampel: number;
  confidence: number;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  reason?: string;
  signals?: string[];
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  linked?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        linked ? "border-emerald-300 bg-emerald-50/50" : "border-border bg-card",
        dimmed && "opacity-50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AmpelDot c={ampel} />
            <span className="tabular-nums text-xs text-muted-foreground">
              {Math.round(confidence)} %
            </span>
            <span className="truncate">{title}</span>
            {linked && (
              <Badge variant="secondary" className="text-[10px]">
                bereits zugeordnet
              </Badge>
            )}
            {badges}
          </div>
          {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
          {reason && <p className="mt-1 text-xs text-foreground/80">{reason}</p>}
          {signals && signals.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {signals.map((s, i) => (
                <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
    </div>
  );
}

function renderBucketLegal(
  result: CaseMatchResult | null,
  bucket: "legal" | "cards",
  sectionById: Map<string, { source_short?: string; section_number?: string; title?: string }>,
  onApply: (m: SectionMatchEnriched) => void | Promise<void>,
) {
  return (
    linkedIds: Set<string>,
    dismissed: Set<string>,
    setDismissed: (s: Set<string>) => void,
  ) => {
    const items = result && (result[bucket].status === "ok" ? result[bucket].items : []);
    return (
      <EmptyOr
        result={result}
        bucket={bucket}
        items={items ?? []}
        render={() => (
          <>
            {(items ?? []).map((m) => {
              const key = "l:" + m.id;
              const linked = linkedIds.has(m.id);
              const dimmed = dismissed.has(key);
              const s = sectionById.get(m.id);
              const heading = s
                ? `§ ${s.section_number ?? ""} ${s.source_short ?? ""}${s.title ? " – " + s.title : ""}`.trim()
                : `§ ${m.id.slice(0, 8)}`;
              return (
                <Row
                  key={m.id + bucket}
                  ampel={m.confidence}
                  confidence={m.confidence}
                  title={`${heading} · ${"★".repeat(m.relevance_stars)}`}
                  reason={m.reason}
                  signals={m.signals}

                  badges={
                    bucket === "legal" && !m.has_knowledge_card ? (
                      <Badge variant="outline" className="border-amber-500 text-amber-700 text-[10px]">
                        🟡 Wissenskarte fehlt
                      </Badge>
                    ) : null
                  }
                  linked={linked}
                  dimmed={dimmed}
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={linked}
                        onClick={() => onApply(m)}
                        title="Übernehmen"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDismissed(new Set(dismissed).add(key))}
                        title="Verwerfen"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
              );
            })}
          </>
        )}
      />
    );
  };
}

function renderKeywordBucket(
  result: CaseMatchResult | null,
  onApply: (m: KeywordMatch) => void | Promise<void>,
) {
  return (
    linkedLower: Set<string>,
    dismissed: Set<string>,
    setDismissed: (s: Set<string>) => void,
  ) => {
    const items = result && (result.keywords.status === "ok" ? result.keywords.items : []);
    return (
      <EmptyOr
        result={result}
        bucket="keywords"
        items={items ?? []}
        render={() => (
          <>
            {(items ?? []).map((m) => {
              const key = "k:" + m.keyword;
              const linked = m.already_linked || linkedLower.has(m.keyword.toLowerCase());
              const dimmed = dismissed.has(key);
              return (
                <Row
                  key={m.keyword}
                  ampel={m.confidence}
                  confidence={m.confidence}
                  title={m.keyword}
                  reason={m.reason}
                  linked={linked}
                  dimmed={dimmed}
                  badges={
                    m.is_new ? (
                      <Badge variant="outline" className="text-[10px]">
                        neu vorgeschlagen
                      </Badge>
                    ) : null
                  }
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={linked}
                        onClick={() => onApply(m)}
                        title="Übernehmen"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDismissed(new Set(dismissed).add(key))}
                        title="Verwerfen"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
              );
            })}
          </>
        )}
      />
    );
  };
}

function renderTemplateBucket(
  result: CaseMatchResult | null,
  templates: Array<{ id: string; title: string; type?: string }>,
  onApply: (m: TemplateMatch) => void | Promise<void>,
) {
  return (
    linked: Set<string>,
    dismissed: Set<string>,
    setDismissed: (s: Set<string>) => void,
  ) => {
    const items = result && (result.templates.status === "ok" ? result.templates.items : []);
    const idx = new Map(templates.map((t) => [t.id, t]));
    return (
      <EmptyOr
        result={result}
        bucket="templates"
        items={items ?? []}
        render={() => (
          <>
            {(items ?? []).map((m) => {
              const t = idx.get(m.id);
              const key = "t:" + m.id;
              const isLinked = linked.has(m.id) || m.already_linked;
              const dimmed = dismissed.has(key);
              return (
                <Row
                  key={m.id}
                  ampel={m.confidence}
                  confidence={m.confidence}
                  title={t?.title ?? m.id.slice(0, 8)}
                  subtitle={t?.type ? `Typ: ${t.type}` : undefined}
                  reason={m.reason}
                  signals={m.signals}
                  linked={isLinked}
                  dimmed={dimmed}
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isLinked}
                        onClick={() => onApply(m)}
                        title="Übernehmen"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDismissed(new Set(dismissed).add(key))}
                        title="Verwerfen"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
              );
            })}
          </>
        )}
      />
    );
  };
}

function renderSimilarBucket(result: CaseMatchResult | null) {
  const items = result && (result.similar.status === "ok" ? result.similar.items : []);
  return (
    <EmptyOr
      result={result}
      bucket="similar"
      items={items ?? []}
      render={() => (
        <>
          {(items ?? []).map((m: SimilarCaseMatch) => (
            <Row
              key={m.id}
              ampel={m.similarity}
              confidence={m.similarity}
              title={m.title || m.id.slice(0, 8)}
              subtitle={m.short_description}
              reason={m.reason}
              signals={m.common_signals}
              badges={
                m.is_possible_duplicate ? (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <AlertTriangle className="h-3 w-3" /> mögliche Dublette
                  </Badge>
                ) : null
              }
              actions={
                <Link
                  to="/admin/faelle/$id"
                  params={{ id: m.id }}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:underline"
                >
                  öffnen <ExternalLink className="h-3 w-3" />
                </Link>
              }
            />
          ))}
        </>
      )}
    />
  );
}
