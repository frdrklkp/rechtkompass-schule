import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, Check, X, AlertTriangle, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createLegalLink, listSections, listSources, listCaseLegalLinks } from "@/lib/coreBuilder";
import {
  matchLegalSections,
  buildExplanation,
  starsToRelevance,
  confidenceAmpel,
  ampelDot,
  type LegalMatch,
  type MatchResponse,
} from "@/lib/legalMatching";
import { formatSectionHeading } from "@/lib/legalSectionLabel";

type Props = {
  caseId: string;
  caseInput: {
    title: string;
    short_description?: string;
    category?: string;
    subcategory?: string;
    bildungsgang?: string;
    keywords?: string[];
  };
  onLinked?: () => void;
};

export function LegalMatchSuggestions({ caseId, caseInput, onLinked }: Props) {
  const sectionsQ = useQuery({ queryKey: ["public", "sections"], queryFn: listSections });
  const sourcesQ = useQuery({ queryKey: ["public", "sources"], queryFn: listSources });
  const linksQ = useQuery({
    queryKey: ["case-links", caseId],
    queryFn: () => listCaseLegalLinks(caseId),
    enabled: !!caseId,
  });

  const [result, setResult] = useState<MatchResponse | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const sourceById = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of (sourcesQ.data ?? []) as any[]) map.set(s.id, s);
    return map;
  }, [sourcesQ.data]);

  const sectionById = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of (sectionsQ.data ?? []) as any[]) map.set(s.id, s);
    return map;
  }, [sectionsQ.data]);

  const alreadyLinked = useMemo(() => {
    const set = new Set<string>();
    for (const l of (linksQ.data ?? []) as any[]) {
      if (l?.legal_section_id) set.add(l.legal_section_id);
    }
    return set;
  }, [linksQ.data]);

  const runMut = useMutation({
    mutationFn: async () => {
      const sections = ((sectionsQ.data ?? []) as any[]).map((s) => {
        const src = sourceById.get(s.source_id);
        return {
          id: s.id as string,
          source_short: (src?.short_name ?? src?.name ?? "") as string,
          section_number: (s.section_number ?? s.reference ?? "") as string,
          title: (s.title ?? "") as string,
          summary: (s.summary ?? s.practice_relevance ?? "") as string,
        };
      });
      if (sections.length === 0) throw new Error("Keine Rechtsabschnitte in der Wissensbasis.");
      return matchLegalSections({ ...caseInput, sections });
    },
    onSuccess: (r) => {
      setResult(r);
      setDismissed(new Set());
      if (r.matches.length === 0) {
        toast.info("Kein passender Rechtsabschnitt gefunden.");
      } else {
        toast.success(`${r.matches.length} Vorschläge erhalten.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function acceptOne(m: LegalMatch) {
    if (alreadyLinked.has(m.id)) {
      toast.message("Bereits verknüpft.");
      return;
    }
    setSavingId(m.id);
    try {
      await createLegalLink(caseId, m.id, buildExplanation(m), starsToRelevance(m.relevance_stars));
      toast.success("Rechtsgrundlage übernommen.");
      onLinked?.();
      linksQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  const [pipelineBusy, setPipelineBusy] = useState(false);
  async function runCentralPipeline() {
    setPipelineBusy(true);
    try {
      const { completePracticeCase } = await import("@/lib/casePipeline.completion");
      const rep = await completePracticeCase(caseId, { source: "manual" });
      const lr = rep.legalReport;
      if (lr) {
        toast.success(
          `Pipeline: ${lr.accepted.length} zugeordnet · ${lr.removed.length} entfernt · Status ${lr.quality.legalQualityStatus}`,
        );
      } else {
        toast.success("Pipeline abgeschlossen.");
      }
      onLinked?.();
      linksQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPipelineBusy(false);
    }
  }


  const canRun = !!caseInput.title?.trim() && (sectionsQ.data ?? []).length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-accent" />
            KI-Vorschläge: passende Rechtsgrundlagen
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Die KI analysiert Titel, Sachverhalt, Kategorie und Schlagwörter und schlägt passende
            Abschnitte aus der Wissensbasis vor. Keine Auto-Übernahme — die Redaktion entscheidet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => runMut.mutate()}
            disabled={!canRun || runMut.isPending}
          >
            {runMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analysiere …
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Rechtsgrundlagen automatisch vorschlagen
              </>
            )}
          </Button>
          {result && result.matches.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => runCentralPipeline()}
              disabled={runMut.isPending || pipelineBusy}
              title="Führt die zentrale Legal-Matching-Engine aus (§ 53-Guard, Re-Evaluierung bestehender Links, keine künstliche Auffüllung)."
            >
              {pipelineBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Fall vollständig prüfen (Pipeline)
            </Button>
          )}
        </div>
      </div>

      {!canRun && (
        <p className="mt-3 text-xs italic text-muted-foreground">
          Bitte zuerst mindestens einen Titel eingeben.
        </p>
      )}

      {result && result.detected_signals.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-2 text-[11px]">
          <span className="font-semibold text-foreground">Zuordnung basiert auf: </span>
          {result.detected_signals.map((s, i) => (
            <span key={i} className="mr-1 inline-block">
              ✓ {s}
            </span>
          ))}
        </div>
      )}

      {result?.missing_area && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            🟡 Offizielle Rechtsgrundlage fehlt: <strong>{result.missing_area}</strong>. Bitte
            ggf. importieren.
          </span>
        </div>
      )}

      {result && result.matches.length > 0 && (
        <ul className="mt-3 space-y-2">
          {result.matches
            .filter((m) => !dismissed.has(m.id))
            .map((m) => {
              const sec = sectionById.get(m.id);
              const src = sec ? sourceById.get(sec.source_id) : null;
              const heading = sec
                ? formatSectionHeading(sec, src)
                : { source: "", line: "Unbekannter Abschnitt" };
              const ampel = confidenceAmpel(m.confidence);
              const linked = alreadyLinked.has(m.id);
              const missingCard = sec && !(sec.summary?.trim());
              return (
                <li
                  key={m.id}
                  className="rounded-xl border border-border bg-background p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {heading.source && (
                        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {heading.source}
                        </div>
                      )}
                      <div className="font-semibold text-foreground">{heading.line}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-0.5" title={`${m.relevance_stars}★ Relevanz`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3 w-3 ${
                                i < m.relevance_stars ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40"
                              }`}
                            />
                          ))}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                          {ampelDot(ampel)} Konfidenz {Math.round(m.confidence)} %
                        </span>
                        {linked && (
                          <span className="rounded-full bg-success/15 px-2 py-0.5 font-medium text-success">
                            bereits verknüpft
                          </span>
                        )}
                        {missingCard && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                            🟡 Wissenskarte fehlt
                          </span>
                        )}
                      </div>
                      {m.signals.length > 0 && (
                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                          Signale: {m.signals.join(", ")}
                        </div>
                      )}
                      {m.reason && (
                        <p className="mt-1 text-xs text-foreground/85">Begründung: {m.reason}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acceptOne(m)}
                        disabled={linked || savingId === m.id}
                      >
                        {savingId === m.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Übernehmen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDismissed((s) => new Set(s).add(m.id))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      {result && result.matches.length > 0 && result.matches.every((m) => m.relevance_stars < 4) && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            ⚠ Keine primäre Rechtsgrundlage (≥ 4★) gefunden — Redaktion sollte prüfen.
          </span>
        </div>
      )}
    </section>
  );
}
