/**
 * Legal-Matching Testmatrix
 * ═════════════════════════
 *
 * Redaktionelle End-to-End-Validierung der zentralen Legal-Matching-Engine
 * an realen Praxisfällen. Führt für ausgewählte Fälle die zentrale
 * completePracticeCase-Pipeline aus (nur legalMatching + qualityEvaluation),
 * zeigt Vorher/Nachher-Snapshots und speichert redaktionelle Bewertungen
 * lokal (kein Schema-Change, keine Auto-Publikation).
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listCases, listSections, listSources } from "@/lib/coreBuilder";
import { supabase } from "@/integrations/supabase/client";
import { completePracticeCase, type CompletionReport } from "@/lib/casePipeline.completion";
import { isSchulG53Relevant } from "@/lib/legalGuards";
import type { CaseEvalInput } from "@/lib/qualityEngine";
import { ChevronDown, ChevronRight, Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/admin/legal-testmatrix")({
  component: LegalTestMatrixPage,
});

type Scenario = {
  key: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
  title: string;
  hint: string; // Suchbegriffe zur Fall-Auswahl
  expectation: string;
};

const SCENARIOS: Scenario[] = [
  { key: "A", title: "Nachteilsausgleich bei akuter Schreibhandverletzung", hint: "nachteilsausgleich schreibhand verletzung", expectation: "§ 53 SchulG NRW darf NICHT zugeordnet sein." },
  { key: "B", title: "Wiederholte massive Unterrichtsstörung", hint: "unterrichtsstörung wiederholt ordnungsmaßnahme", expectation: "§ 53 darf zugeordnet sein, wenn konkret begründet." },
  { key: "C", title: "Kostenübernahme für ärztliches Attest", hint: "attest kostenübernahme arzt", expectation: "§ 53 darf NICHT zugeordnet sein." },
  { key: "D", title: "Täuschungsversuch in einer Prüfung", hint: "täuschung prüfung", expectation: "Prüfungsrecht priorisiert; § 53 nur bei zusätzlichem Ordnungsmaßnahmenbezug." },
  { key: "E", title: "Fall mit nur zwei fachlich tragfähigen Rechtsgrundlagen", hint: "", expectation: "Nur zwei belastbare Rechtsgrundlagen – keine künstliche Auffüllung." },
  { key: "F", title: "Relevante Rechtsgrundlage ohne Wissenskarte", hint: "", expectation: "Rechtsgrundlage zuordnen, fehlende Wissenskarte als Quality Task." },
  { key: "G", title: "Veröffentlichter Fall mit unpassender Rechtsgrundlage", hint: "", expectation: "Klar irrelevante bestehende Rechtsgrundlage wird entfernt." },
  { key: "H", title: "Idempotenz: derselbe Fall zweimal durch die Pipeline", hint: "", expectation: "Zweiter Lauf: keine Dubletten, keine unnötigen Änderungen, gleiches Ergebnis." },
];

const PIPELINE_OPTS = {
  runLegalMatching: true,
  runKeywordMatching: false,
  runTemplateMatching: false,
  runSimilarityCheck: false,
  runQualityEvaluation: true,
  preserveManualContent: true,
  removeClearlyIrrelevantLegalLinks: true,
  source: "manual" as const,
};

type Rating = "correct" | "partial" | "wrong" | "unclear" | null;

type SlotState = {
  caseId: string | null;
  before?: CaseSnapshot;
  after?: CaseSnapshot;
  report?: CompletionReport;
  secondReport?: CompletionReport; // nur für H
  rating: Rating;
  note: string;
  running: boolean;
  error?: string;
};

type CaseSnapshot = {
  caseId: string;
  title: string;
  status: string;
  legalLinks: Array<{ sectionId: string; label: string; hasCard: boolean }>;
  schulG53Present: boolean;
  schulG53Relevant: boolean;
};

const STORAGE_KEY = "rk.legal-testmatrix.v1";

function loadRatings(): Record<string, { rating: Rating; note: string; caseId: string | null }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRatings(state: Record<string, { rating: Rating; note: string; caseId: string | null }>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function isSchulG53Section(label: string): boolean {
  return /§?\s*53\b/.test(label) && /schulg/i.test(label);
}

async function loadSnapshot(
  caseId: string,
  sectionsById: Map<string, { section_number?: string | null; source_short?: string; has_card: boolean }>,
): Promise<CaseSnapshot> {
  const caseRes = await supabase.from("practice_cases").select("*").eq("id", caseId).limit(1);
  const row = (caseRes.data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Fall ${caseId} nicht gefunden`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linksRes = await (supabase.from("case_legal_links") as any)
    .select("legal_section_id")
    .eq("case_id", caseId);
  const secIds = ((linksRes.data ?? []) as Array<{ legal_section_id: string }>).map((r) => r.legal_section_id);
  const legalLinks = secIds.map((sid) => {
    const s = sectionsById.get(sid);
    const label = s ? `${s.source_short ?? ""} § ${s.section_number ?? ""}`.trim() : sid;
    return { sectionId: sid, label, hasCard: s?.has_card ?? false };
  });
  const evalInput: CaseEvalInput = {
    id: row.id as string,
    title: (row.title as string) ?? null,
    category: (row.category as string) ?? null,
    subcategory: (row.subcategory as string) ?? null,
    short_description: (row.short_description as string) ?? null,
    short_answer: (row.short_answer as string) ?? null,
    immediate_actions: (row.immediate_actions as string) ?? null,
    recommendation: (row.recommendation as string) ?? null,
    legal_explanation: (row.legal_explanation as string) ?? null,
    responsibilities: (row.responsibilities as string) ?? null,
    practice_tip: (row.practice_tip as string) ?? null,
    checklist: null,
    documentation: null,
    common_mistakes: null,
    faq: null,
    status: (row.status as string) ?? null,
  };
  return {
    caseId,
    title: (row.title as string) ?? "(ohne Titel)",
    status: (row.status as string) ?? "draft",
    legalLinks,
    schulG53Present: legalLinks.some((l) => isSchulG53Section(l.label)),
    schulG53Relevant: isSchulG53Relevant(evalInput),
  };
}

function LegalTestMatrixPage() {
  const casesQ = useQuery({ queryKey: ["testmatrix", "cases"], queryFn: () => listCases() });
  const sectionsQ = useQuery({ queryKey: ["testmatrix", "sections"], queryFn: () => listSections() });
  const sourcesQ = useQuery({ queryKey: ["testmatrix", "sources"], queryFn: () => listSources() });

  const sectionsById = useMemo(() => {
    const map = new Map<string, { section_number?: string | null; source_short?: string; has_card: boolean }>();
    if (!sectionsQ.data || !sourcesQ.data) return map;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const srcById = new Map((sourcesQ.data as any[]).map((s) => [s.id, s]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of sectionsQ.data as any[]) {
      map.set(s.id, {
        section_number: s.section_number,
        source_short: srcById.get(s.source_id)?.short_name ?? srcById.get(s.source_id)?.name,
        has_card: Boolean(s.practice_relevance || s.common_mistakes || s.recommendations || s.action_hint),
      });
    }
    return map;
  }, [sectionsQ.data, sourcesQ.data]);

  const [slots, setSlots] = useState<Record<string, SlotState>>(() => {
    const stored = loadRatings();
    const initial: Record<string, SlotState> = {};
    for (const s of SCENARIOS) {
      initial[s.key] = {
        caseId: stored[s.key]?.caseId ?? null,
        rating: stored[s.key]?.rating ?? null,
        note: stored[s.key]?.note ?? "",
        running: false,
      };
    }
    return initial;
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const persist: Record<string, { rating: Rating; note: string; caseId: string | null }> = {};
    for (const key of Object.keys(slots)) {
      persist[key] = { rating: slots[key].rating, note: slots[key].note, caseId: slots[key].caseId };
    }
    saveRatings(persist);
  }, [slots]);

  const updateSlot = (key: string, patch: Partial<SlotState>) =>
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const runPipeline = async (key: string, caseId: string, twice: boolean) => {
    updateSlot(key, { running: true, error: undefined });
    try {
      const before = await loadSnapshot(caseId, sectionsById);
      const report = await completePracticeCase(caseId, PIPELINE_OPTS);
      let secondReport: CompletionReport | undefined;
      if (twice) {
        secondReport = await completePracticeCase(caseId, PIPELINE_OPTS);
      }
      const after = await loadSnapshot(caseId, sectionsById);
      updateSlot(key, { before, after, report, secondReport, running: false });
      setExpanded((p) => ({ ...p, [key]: true }));
    } catch (e) {
      updateSlot(key, { running: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const casesFilter = (hint: string) => {
    if (!casesQ.data) return [];
    if (!hint) return casesQ.data.slice(0, 200);
    const tokens = hint.toLowerCase().split(/\s+/).filter(Boolean);
    return casesQ.data
      .filter((c) => {
        const hay = `${c.title ?? ""} ${c.short_description ?? ""} ${c.category ?? ""} ${c.subcategory ?? ""}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 200);
  };

  // Aggregat-Report
  const summary = useMemo(() => {
    let correct = 0, partial = 0, wrong = 0, unclear = 0, tested = 0;
    let schulG53Removed = 0, schulG53Kept = 0, noArtificialFill = 0, missingCards = 0, idempotent = 0, idempotentTested = 0;
    let openErrors = 0;
    for (const key of Object.keys(slots)) {
      const s = slots[key];
      if (s.report) tested++;
      if (s.rating === "correct") correct++;
      else if (s.rating === "partial") partial++;
      else if (s.rating === "wrong") wrong++;
      else if (s.rating === "unclear") unclear++;
      if (s.report && s.before && s.after) {
        // § 53 Analyse
        if (s.before.schulG53Present && !s.after.schulG53Present) schulG53Removed++;
        if (s.after.schulG53Present) schulG53Kept++;
        if (s.after.legalLinks.length < 3 && !s.after.legalLinks.some((l) => isSchulG53Section(l.label))) noArtificialFill++;
        missingCards += s.after.legalLinks.filter((l) => !l.hasCard).length;
        if (s.report.errors.length > 0) openErrors += s.report.errors.length;
      }
      if (s.secondReport && s.report) {
        idempotentTested++;
        const secondChanges =
          (s.secondReport.legal.assigned.length ?? 0) + (s.secondReport.legal.removed.length ?? 0);
        if (secondChanges === 0) idempotent++;
      }
    }
    return { tested, correct, partial, wrong, unclear, schulG53Removed, schulG53Kept, noArtificialFill, missingCards, idempotent, idempotentTested, openErrors };
  }, [slots]);

  const ready = casesQ.data && sectionsQ.data && sourcesQ.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Legal-Matching Testmatrix</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Redaktionelle End-to-End-Validierung der zentralen Legal-Matching-Engine an realen Praxisfällen.
          Keine automatische Veröffentlichung. Bewertungen werden lokal gespeichert.
        </p>
      </div>

      {!ready && <div className="rounded-md border border-border bg-card p-4 text-sm">Lade Katalogdaten …</div>}

      {ready && (
        <>
          <div className="grid gap-4">
            {SCENARIOS.map((sc) => {
              const slot = slots[sc.key];
              const options = casesFilter(sc.hint);
              const isOpen = expanded[sc.key] ?? false;
              return (
                <div key={sc.key} className="rounded-xl border border-border bg-card">
                  <button
                    className="flex w-full items-start justify-between gap-3 p-4 text-left"
                    onClick={() => setExpanded((p) => ({ ...p, [sc.key]: !isOpen }))}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {sc.key}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{sc.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{sc.expectation}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {slot.rating && <RatingBadge rating={slot.rating} />}
                      {slot.report && (
                        <Badge variant="outline" className="text-xs">
                          {slot.after?.legalLinks.length ?? 0} Rechtsgrundlagen
                        </Badge>
                      )}
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="space-y-4 border-t border-border p-4">
                      {/* Fall-Auswahl */}
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Praxisfall auswählen</label>
                        <select
                          value={slot.caseId ?? ""}
                          onChange={(e) => updateSlot(sc.key, { caseId: e.target.value || null, before: undefined, after: undefined, report: undefined, secondReport: undefined })}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">— Fall auswählen (Vorschlag über Stichwörter{sc.hint ? `: „${sc.hint}"` : ""}) —</option>
                          {options.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title ?? "(ohne Titel)"} · {c.category ?? "?"} · {c.status ?? "draft"} · {c.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => slot.caseId && runPipeline(sc.key, slot.caseId, sc.key === "H")}
                          disabled={!slot.caseId || slot.running}
                          title={!slot.caseId ? "Bitte zuerst einen Praxisfall auswählen." : undefined}
                        >
                          {slot.running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          {sc.key === "H" ? "Pipeline 2× ausführen" : "Pipeline ausführen"}
                        </Button>
                        {slot.report && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => slot.caseId && runPipeline(sc.key, slot.caseId, sc.key === "H")}
                            disabled={!slot.caseId || slot.running}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Erneut
                          </Button>
                        )}
                        {!slot.caseId && (
                          <span className="text-xs text-muted-foreground">Bitte zuerst einen Praxisfall auswählen.</span>
                        )}
                      </div>

                      {slot.error && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                          Fehler: {slot.error}
                        </div>
                      )}

                      {slot.report && slot.before && slot.after && (
                        <ResultView before={slot.before} after={slot.after} report={slot.report} secondReport={slot.secondReport} />
                      )}

                      {/* Redaktionelle Bewertung */}
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <div className="mb-2 text-xs font-medium">Redaktionelle Bewertung</div>
                        <div className="mb-2 flex flex-wrap gap-2">
                          {(["correct", "partial", "wrong", "unclear"] as Rating[]).map((r) => (
                            <Button
                              key={r}
                              size="sm"
                              variant={slot.rating === r ? "default" : "outline"}
                              onClick={() => updateSlot(sc.key, { rating: r })}
                            >
                              {ratingLabel(r)}
                            </Button>
                          ))}
                        </div>
                        <Textarea
                          value={slot.note}
                          onChange={(e) => updateSlot(sc.key, { note: e.target.value })}
                          placeholder="Redaktionelle Anmerkung …"
                          className="min-h-[64px] text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Aggregat-Report */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-lg font-semibold">Testbericht</h2>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
              <Metric label="Getestet" value={`${summary.tested} / ${SCENARIOS.length}`} />
              <Metric label="Fachlich korrekt" value={String(summary.correct)} />
              <Metric label="Teilweise korrekt" value={String(summary.partial)} />
              <Metric label="Fachlich falsch" value={String(summary.wrong)} />
              <Metric label="Unklar" value={String(summary.unclear)} />
              <Metric label="§ 53 korrekt entfernt" value={String(summary.schulG53Removed)} />
              <Metric label="§ 53 behalten" value={String(summary.schulG53Kept)} />
              <Metric label="Ohne künstliche Auffüllung" value={String(summary.noArtificialFill)} />
              <Metric label="Fehlende Wissenskarten" value={String(summary.missingCards)} />
              <Metric label="Idempotenz bestanden" value={`${summary.idempotent} / ${summary.idempotentTested}`} />
              <Metric label="Offene Fehler" value={String(summary.openErrors)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RatingBadge({ rating }: { rating: Rating }) {
  if (!rating) return null;
  const map: Record<NonNullable<Rating>, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
    correct: { label: "korrekt", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700", Icon: CheckCircle2 },
    partial: { label: "teilweise", className: "border-amber-500/40 bg-amber-500/10 text-amber-700", Icon: AlertTriangle },
    wrong: { label: "falsch", className: "border-rose-500/40 bg-rose-500/10 text-rose-700", Icon: XCircle },
    unclear: { label: "unklar", className: "border-slate-500/40 bg-slate-500/10 text-slate-700", Icon: HelpCircle },
  };
  const cfg = map[rating];
  const Icon = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function ratingLabel(r: Rating): string {
  return r === "correct" ? "fachlich korrekt"
    : r === "partial" ? "teilweise korrekt"
    : r === "wrong" ? "fachlich falsch"
    : "unklar / weitere Prüfung";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ResultView({
  before,
  after,
  report,
  secondReport,
}: {
  before: CaseSnapshot;
  after: CaseSnapshot;
  report: CompletionReport;
  secondReport?: CompletionReport;
}) {
  const beforeIds = new Set(before.legalLinks.map((l) => l.sectionId));
  const afterIds = new Set(after.legalLinks.map((l) => l.sectionId));
  const added = after.legalLinks.filter((l) => !beforeIds.has(l.sectionId));
  const removedIds = [...beforeIds].filter((id) => !afterIds.has(id));
  const removedLabels = before.legalLinks.filter((l) => removedIds.includes(l.sectionId));
  const kept = after.legalLinks.filter((l) => beforeIds.has(l.sectionId));

  const legalReport = report.legalReport;
  const candidateById = new Map(legalReport?.candidates.map((c) => [c.id, c]) ?? []);
  const reevalById = new Map(legalReport?.reevaluated.map((r) => [r.id, r]) ?? []);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoTile label="Titel" value={after.title} />
        <InfoTile label="Fall-ID" value={after.caseId} mono />
        <InfoTile label="Status" value={after.status} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <LegalList title={`Vorher (${before.legalLinks.length})`} items={before.legalLinks} />
        <LegalList title={`Nachher (${after.legalLinks.length})`} items={after.legalLinks} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ChangeBlock title="Neu zugeordnet" tone="success" items={added.map((l) => {
          const c = candidateById.get(l.sectionId);
          return `${l.label}${c ? ` · ${c.role} · ${Math.round(c.confidence)}%` : ""}`;
        })} />
        <ChangeBlock title="Entfernt" tone="danger" items={removedLabels.map((l) => {
          const rv = reevalById.get(l.sectionId);
          return `${l.label}${rv ? ` · ${rv.role} · ${Math.round(rv.confidence)}% · ${rv.reason}` : ""}`;
        })} />
        <ChangeBlock title="Unverändert" tone="neutral" items={kept.map((l) => l.label)} />
      </div>

      {legalReport && legalReport.rejected.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Abgelehnte Kandidaten</div>
          <ul className="space-y-1 text-xs">
            {legalReport.rejected.slice(0, 20).map((r) => (
              <li key={r.id} className="rounded-md border border-border bg-background px-2 py-1">
                {r.section_number ? `§ ${r.section_number}` : ""} {r.source_short ?? ""} · {r.decision} · {Math.round(r.confidence)}% · {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <MiniStat label="§ 53 erkannt" value={after.schulG53Relevant ? "ja" : "nein"} />
        <MiniStat
          label="§ 53 Status"
          value={
            before.schulG53Present && !after.schulG53Present
              ? "entfernt"
              : after.schulG53Present
                ? "zugeordnet"
                : "nicht berücksichtigt"
          }
        />
        <MiniStat
          label="Wissenskarten"
          value={`${report.knowledgeCards.availableCards}/${report.knowledgeCards.linkedLegalSections} (${report.knowledgeCards.coveragePercent}%)`}
        />
      </div>

      {report.qualityTasks.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Quality Tasks</div>
          <ul className="space-y-1 text-xs">
            {report.qualityTasks.slice(0, 20).map((t, i) => (
              <li key={i} className="rounded-md border border-border bg-background px-2 py-1">
                <span className="font-medium">{t.severity}</span> · {t.affectedField ?? t.code} · {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {secondReport && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div className="mb-1 font-medium">Zweiter Pipeline-Lauf (Idempotenz)</div>
          <div>
            Zugeordnet: {secondReport.legal.assigned.length} · Entfernt: {secondReport.legal.removed.length} ·
            Fehler: {secondReport.errors.length} ·
            {secondReport.legal.assigned.length === 0 && secondReport.legal.removed.length === 0
              ? " ✓ idempotent"
              : " ⚠ zusätzliche Änderungen"}
          </div>
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
          <div className="font-medium">Warnungen</div>
          <ul className="mt-1 list-disc pl-4">
            {report.warnings.map((w, i) => (<li key={i}>{w}</li>))}
          </ul>
        </div>
      )}
      {report.errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <div className="font-medium">Fehler</div>
          <ul className="mt-1 list-disc pl-4">
            {report.errors.map((e, i) => (<li key={i}>{e.step}: {e.message}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InfoTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 truncate text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

function LegalList({ title, items }: { title: string; items: Array<{ sectionId: string; label: string; hasCard: boolean }> }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="mb-1 text-xs font-medium">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">– keine –</div>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((l) => (
            <li key={l.sectionId} className="flex items-center justify-between gap-2">
              <span className="truncate">{l.label}</span>
              <span className={`shrink-0 text-[10px] ${l.hasCard ? "text-emerald-700" : "text-muted-foreground"}`}>
                {l.hasCard ? "Karte ✓" : "keine Karte"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChangeBlock({ title, tone, items }: { title: string; tone: "success" | "danger" | "neutral"; items: string[] }) {
  const cls =
    tone === "success" ? "border-emerald-500/30 bg-emerald-500/5"
    : tone === "danger" ? "border-rose-500/30 bg-rose-500/5"
    : "border-border bg-background";
  return (
    <div className={`rounded-md border p-2 ${cls}`}>
      <div className="mb-1 text-xs font-medium">{title} ({items.length})</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">–</div>
      ) : (
        <ul className="space-y-0.5 text-xs">
          {items.map((it, i) => (<li key={i} className="truncate">{it}</li>))}
        </ul>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
