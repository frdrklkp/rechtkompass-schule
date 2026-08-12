import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, Play, StopCircle, AlertTriangle, CheckCircle2, SkipForward, XCircle, Wand2, ExternalLink, Trash2, ShieldCheck, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  createCase,
  createKeyword,
  createLegalLink,
  deleteCase,
  linkCaseKeyword,
  listCases,
  listCategories,
  listKeywords,
  listSections,
  listTemplates,
} from "@/lib/coreBuilder";
import { applyKeywordMatches, matchKeywords } from "@/lib/keywordMatching";
import { applyTemplateMatches, matchTemplates } from "@/lib/templateMatching";
import { evaluateCases, publishCasesBatch, type PublishReport } from "@/lib/casePipeline";
import { completePracticeCase } from "@/lib/casePipeline.completion";
import { invalidatePracticeCaseQueries } from "@/lib/casePipeline.invalidate";
import { statusLabel, type EvalResult } from "@/lib/qualityEngine";

import { computeCompleteness } from "@/lib/caseCompleteness";
import { findSimilar, type SimilarCandidate } from "@/lib/caseSimilarity";

export const Route = createFileRoute("/admin/ki-entwurfsmaschine/")({
  component: DraftMachine,
});

const TOPICS = [
  "Datenschutz",
  "Ordnungsmaßnahmen",
  "Prüfungen",
  "Fehlzeiten",
  "Elternkommunikation",
  "Gewalt",
  "Mobbing",
  "KI im Unterricht",
  "Klassenfahrten",
  "Aufsicht",
  "Leistungsbewertung",
  "Berufskolleg allgemein",
];

type Idea = { title: string; sketch: string; topic?: string };
type BatchDraft = {
  title?: string;
  category?: string;
  subcategory?: string;
  ampel?: "gruen" | "gelb" | "rot";
  short_description?: string;
  short_answer?: string;
  immediate_actions?: string;
  recommendation?: string;
  legal_explanation?: string;
  responsibilities?: string;
  escalation?: string;
  risks?: string;
  practice_tip?: string;
  checklist?: string[];
  documentation?: string[];
  common_mistakes?: string[];
  faq?: Array<{ q: string; a: string }>;
  keyword_ids?: string[];
  keyword_hints?: string[];
  template_ids?: string[];
  legal_links?: Array<{
    legal_section_id: string;
    relevance?: "low" | "medium" | "high";
    explanation?: string;
  }>;
  related_hints?: string[];
  bildungsgang?: string;
  zielgruppe?: string;
  schwierigkeit?: "leicht" | "mittel" | "komplex";
  bearbeitungsdauer?: string;
};

type ItemStatus =
  | { kind: "pending"; idea: Idea }
  | { kind: "running"; idea: Idea; step: string }
  | {
      kind: "created";
      idea: Idea;
      caseId: string;
      score: number;
      ampel: "gruen" | "gelb" | "rot";
      missing: string[];
      linked: { keywords: number; sections: number };
    }
  | { kind: "duplicate"; idea: Idea; similarTo: string }
  | { kind: "error"; idea: Idea; error: string };

type QualityRow = EvalResult & {
  title: string;
  category: string | null;
  status: string | null;
};

type QualityEvalError = { caseId: string; error: string };

function DraftMachine() {
  const qc = useQueryClient();
  const [count, setCount] = useState<number>(10);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState("");

  const [running, setRunning] = useState(false);
  const [cancelFlag, setCancelFlag] = useState(false);
  const [step, setStep] = useState<string>("");
  const [items, setItems] = useState<ItemStatus[]>([]);
  const [newKeywordSuggestions, setNewKeywordSuggestions] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [qualityRows, setQualityRows] = useState<QualityRow[]>([]);
  const [qualityEvalErrors, setQualityEvalErrors] = useState<QualityEvalError[]>([]);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishReport, setPublishReport] = useState<PublishReport | null>(null);
  const [completionNoticeKey, setCompletionNoticeKey] = useState<string | null>(null);

  // Einzelfall-Modus
  const navigate = useNavigate();
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [singleTopic, setSingleTopic] = useState("");
  const [singleCategory, setSingleCategory] = useState("");
  const [singleSubcategory, setSingleSubcategory] = useState("");
  const [singleBildungsgang, setSingleBildungsgang] = useState("");
  const [singleZielgruppe, setSingleZielgruppe] = useState("");
  const [singleRunning, setSingleRunning] = useState(false);
  const [singleStep, setSingleStep] = useState<string>("");
  const [singleResult, setSingleResult] = useState<null | {
    caseId: string;
    title: string;
    score: number;
    ampel: "gruen" | "gelb" | "rot";
    missing: string[];
    counts: { legal: number; keywords: number; templates: number };
    similar: Array<{ id: string; title: string; similarity: number; reason: string; possibleDuplicate: boolean }>;
    warnings: string[];
  }>(null);

  const done = useMemo(
    () => items.filter((i) => i.kind !== "pending" && i.kind !== "running").length,
    [items],
  );
  const total = items.length;
  const summary = useMemo(() => {
    let created = 0, dup = 0, err = 0;
    for (const i of items) {
      if (i.kind === "created") created++;
      else if (i.kind === "duplicate") dup++;
      else if (i.kind === "error") err++;
    }
    return { created, dup, err };
  }, [items]);

  const generatedCaseIds = useMemo(
    () => items.filter((i): i is Extract<ItemStatus, { kind: "created" }> => i.kind === "created").map((i) => i.caseId),
    [items],
  );

  const generatedCaseIdKey = generatedCaseIds.join("|");

  // Persistiere generierte Fall-IDs für den Qualitätsmanager (überlebt Reload).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (generatedCaseIds.length > 0) {
        window.sessionStorage.setItem("rk:lastGeneratedCaseIds", JSON.stringify(generatedCaseIds));
      }
    } catch { /* ignore */ }
  }, [generatedCaseIdKey, generatedCaseIds]);

  const batchComplete = mode === "batch" && total > 0 && done === total && !running;
  const readyRows = useMemo(
    () => qualityRows.filter((r) => r.publicationReady && r.status !== "published"),
    [qualityRows],
  );
  const publishDisabledReason = publishing
    ? "Veröffentlichung läuft."
    : qualityLoading
      ? "Qualitätsprüfung läuft."
      : readyRows.length === 0
        ? "Keine veröffentlichungsreifen Fälle vorhanden."
        : "";

  const scrollToSection = (id: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const loadGeneratedQuality = useCallback(
    async (ids: string[] = generatedCaseIds) => {
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      setQualityError(null);
      setPublishReport(null);
      if (uniqueIds.length === 0) {
        setQualityRows([]);
        setQualityEvalErrors([]);
        return [] as QualityRow[];
      }
      setQualityLoading(true);
      try {
        const [evals, caseRes] = await Promise.all([
          evaluateCases(uniqueIds),
          supabase.from("practice_cases").select("id,title,category,status").in("id", uniqueIds),
        ]);
        if (caseRes.error) throw caseRes.error;
        const caseById = new Map((caseRes.data ?? []).map((c) => [c.id as string, c]));
        const rowsOut: QualityRow[] = [];
        const errorsOut: QualityEvalError[] = [];
        for (const result of evals) {
          if ("error" in result) {
            errorsOut.push({ caseId: result.caseId, error: result.error });
            continue;
          }
          const rec = caseById.get(result.caseId);
          rowsOut.push({
            ...result,
            title: (rec?.title as string) ?? "(ohne Titel)",
            category: (rec?.category as string) ?? null,
            status: (rec?.status as string) ?? null,
          });
        }
        rowsOut.sort((a, b) => Number(b.publicationReady) - Number(a.publicationReady) || b.score - a.score);
        setQualityRows(rowsOut);
        setQualityEvalErrors(errorsOut);
        return rowsOut;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setQualityError(msg);
        toast.error("Qualitätsübersicht konnte nicht geladen werden: " + msg);
        return [] as QualityRow[];
      } finally {
        setQualityLoading(false);
      }
    },
    [generatedCaseIds],
  );

  const openQualityOverview = async () => {
    if (generatedCaseIds.length === 0) {
      toast.warning("Noch keine generierten Fälle in diesem Lauf vorhanden.");
      return;
    }
    setReviewOpen(true);
    await loadGeneratedQuality(generatedCaseIds);
    scrollToSection("ki-quality-overview");
  };

  const openChecklist = async () => {
    if (generatedCaseIds.length === 0) {
      toast.warning("Noch keine generierten Fälle in diesem Lauf vorhanden.");
      return;
    }
    setReviewOpen(true);
    setChecklistOpen(true);
    await loadGeneratedQuality(generatedCaseIds);
    scrollToSection("ki-review-checklist");
  };

  const publishReadyCases = async () => {
    if (generatedCaseIds.length === 0) {
      toast.warning("Keine generierten Fälle vorhanden.");
      return;
    }
    setPublishing(true);
    setQualityError(null);
    try {
      const currentRows = await loadGeneratedQuality(generatedCaseIds);
      const idsToPublish = currentRows
        .filter((r) => r.publicationReady && r.status !== "published")
        .map((r) => r.caseId);
      if (idsToPublish.length === 0) {
        toast.warning("Keine veröffentlichungsreifen Fälle vorhanden.");
        return;
      }
      const report = await publishCasesBatch(idsToPublish);
      setPublishReport(report);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["published-cases"] }),
        qc.invalidateQueries({ queryKey: ["admin", "cases"] }),
        qc.invalidateQueries({ queryKey: ["knowledge-index"] }),
      ]);
      toast.success(`${report.published.length} veröffentlicht · ${report.rejected.length} abgelehnt · ${report.errors.length} Fehler`);
      await loadGeneratedQuality(generatedCaseIds);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQualityError(msg);
      toast.error("Veröffentlichung fehlgeschlagen: " + msg);
    } finally {
      setPublishing(false);
    }
  };

  const toggleTopic = (t: string) => {
    setSelectedTopics((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const start = async () => {
    if (running) return;
    const topics = [
      ...selectedTopics,
      ...customTopic.split(",").map((s) => s.trim()).filter(Boolean),
    ];
    setItems([]);
    setNewKeywordSuggestions(new Set());
    setReviewOpen(false);
    setChecklistOpen(false);
    setQualityRows([]);
    setQualityEvalErrors([]);
    setQualityError(null);
    setPublishReport(null);
    setCompletionNoticeKey(null);
    setCancelFlag(false);
    setRunning(true);

    try {
      setStep("Lade Wissensbasis (Kategorien, Schlagwörter, Vorlagen, Rechtsgrundlagen, bestehende Fälle)…");
      const [cats, kws, tmpls, secs, cases] = await Promise.all([
        listCategories(),
        listKeywords(),
        listTemplates(),
        listSections(),
        listCases(),
      ]);
      const publishedSecs = (secs as Array<Record<string, unknown>>).filter(
        (s) => (s.status ?? "published") === "published" || s.status === undefined,
      );
      const kwByName = new Map(kws.map((k) => [k.keyword.toLowerCase(), k.id]));

      const existingCases: SimilarCandidate[] = (cases as Array<Record<string, unknown>>).map((c) => ({
        id: c.id as string,
        title: (c.title as string) ?? "",
        category: (c.category as string) ?? null,
      }));

      setStep("Frage KI nach Ideen…");
      const ideasRes = await fetch("/api/ai-draft-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          topics,
          existingTitles: existingCases.map((e) => e.title).slice(0, 200),
        }),
      });
      if (!ideasRes.ok) throw new Error(await ideasRes.text());
      const { ideas } = (await ideasRes.json()) as { ideas: Idea[] };
      if (!ideas?.length) throw new Error("KI hat keine Ideen geliefert.");

      setItems(ideas.map((idea) => ({ kind: "pending", idea })));

      const sectionRefs = publishedSecs.map((s) => ({
        id: s.id as string,
        label: `${(s as { legal_sources?: { name?: string } }).legal_sources?.name ?? ""} ${(s.section_number as string) ?? ""} ${(s.title as string) ?? ""}`.trim(),
      }));
      const templateRefs = (tmpls as Array<Record<string, unknown>>).map((t) => ({
        id: t.id as string,
        label: (t.title as string) ?? "",
      }));
      const caseRefs = existingCases.slice(0, 100).map((c) => ({
        id: c.id,
        label: c.title,
        category: c.category ?? undefined,
      }));

      for (let i = 0; i < ideas.length; i++) {
        if (cancelFlag) break;
        const idea = ideas[i];
        setStep(`Entwurf ${i + 1} von ${ideas.length}: ${idea.title.slice(0, 60)}…`);
        setItems((prev) => {
          const copy = [...prev];
          copy[i] = { kind: "running", idea, step: "KI erstellt Entwurf…" };
          return copy;
        });

        try {
          // Duplikat-Check nur nach Titel/Sketch (billig, ohne KI-Aufruf).
          const preSim = findSimilar(
            { title: idea.title },
            existingCases,
            0.6,
          );
          if (preSim.length > 0) {
            setItems((prev) => {
              const copy = [...prev];
              copy[i] = { kind: "duplicate", idea, similarTo: preSim[0].title };
              return copy;
            });
            continue;
          }

          const draftRes = await fetch("/api/ai-draft-batch-item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: idea.title,
              sketch: idea.sketch,
              topic: idea.topic ?? "",
              categories: cats.map((c) => c.name),
              keywords: kws.map((k) => k.keyword),
              templates: templateRefs,
              sections: sectionRefs,
              cases: caseRefs,
            }),
          });
          if (!draftRes.ok) throw new Error(await draftRes.text());
          const { draft } = (await draftRes.json()) as { draft: BatchDraft };

          // Doppelt prüfen nach dem generierten Titel (KI könnte umformulieren).
          const postSim = findSimilar(
            { title: draft.title ?? idea.title, category: draft.category },
            existingCases,
            0.65,
          );
          if (postSim.length > 0) {
            setItems((prev) => {
              const copy = [...prev];
              copy[i] = { kind: "duplicate", idea, similarTo: postSim[0].title };
              return copy;
            });
            continue;
          }

          setItems((prev) => {
            const copy = [...prev];
            copy[i] = { kind: "running", idea, step: "Speichere Praxisfall…" };
            return copy;
          });

          // Nur bekannte IDs behalten; Hints automatisch anlegen + verlinken.
          const keywordIds = new Set<string>();
          const newlyCreatedKw: string[] = [];
          for (const id of draft.keyword_ids ?? []) {
            if (kws.some((k) => k.id === id)) keywordIds.add(id);
          }
          for (const hintRaw of draft.keyword_hints ?? []) {
            const hint = (hintRaw ?? "").trim();
            if (!hint) continue;
            const existing = kwByName.get(hint.toLowerCase());
            if (existing) {
              keywordIds.add(existing);
              continue;
            }
            try {
              const created = await createKeyword(hint);
              kws.push(created);
              kwByName.set(created.keyword.toLowerCase(), created.id);
              keywordIds.add(created.id);
              newlyCreatedKw.push(created.keyword);
            } catch {
              setNewKeywordSuggestions((prev) => {
                const next = new Set(prev);
                next.add(hint);
                return next;
              });
            }
          }


          const validLinks = (draft.legal_links ?? []).filter((l) =>
            publishedSecs.some((s) => s.id === l.legal_section_id),
          );
          const validTemplateIds = (draft.template_ids ?? []).filter((id) =>
            (tmpls as Array<{ id: string }>).some((t) => t.id === id),
          );

          const completeness = computeCompleteness({
            short_description: draft.short_description,
            legal_explanation: draft.legal_explanation,
            responsibilities: draft.responsibilities,
            practice_tip: draft.practice_tip,
            common_mistakes: draft.common_mistakes,
            checklist: draft.checklist,
            documentation: draft.documentation,
            faq: draft.faq,
            keyword_count: keywordIds.size,
            legal_link_count: validLinks.length,
            template_count: validTemplateIds.length,
          });

          const meta = {
            source: "ki-entwurfsmaschine",
            topic: idea.topic ?? "",
            batch_started_at: new Date().toISOString().slice(0, 10),
            bildungsgang: draft.bildungsgang ?? "",
            zielgruppe: draft.zielgruppe ?? "",
            schwierigkeit: draft.schwierigkeit ?? "",
            bearbeitungsdauer: draft.bearbeitungsdauer ?? "",
            template_ids: validTemplateIds,
            risks: draft.risks ? [draft.risks] : [],
            escalation: draft.escalation ?? "",
            faq_items: draft.faq ?? [],
            keyword_hints: draft.keyword_hints ?? [],
            template_hints: [],
            legal_hints: [],
            related_hints: draft.related_hints ?? [],
            completeness_score: completeness.score,
            completeness_ampel: completeness.ampel,
            completeness_missing: completeness.missing,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = await createCase({
            title: draft.title ?? idea.title,
            short_description: draft.short_description ?? idea.sketch,
            category: draft.category ?? "",
            subcategory: draft.subcategory ?? "",
            ampel: draft.ampel ?? "gelb",
            status: "draft",
            short_answer: draft.short_answer ?? "",
            immediate_actions: draft.immediate_actions ?? "",
            recommendation: draft.recommendation ?? "",
            legal_explanation: draft.legal_explanation ?? "",
            responsibilities: draft.responsibilities ?? "",
            practice_tip: draft.practice_tip ?? "",
            checklist: (draft.checklist ?? []).filter(Boolean),
            documentation: (draft.documentation ?? []).filter(Boolean),
            common_mistakes: (draft.common_mistakes ?? []).filter(Boolean),
            faq: { meta } as any,
          } as any);

          const caseId = row.id;

          setItems((prev) => {
            const copy = [...prev];
            copy[i] = { kind: "running", idea, step: "Zentrale Pipeline: Rechtsgrundlagen, Schlagwörter, Vorlagen, Ähnlichkeit, Qualität…" };
            return copy;
          });

          // ZENTRALE PIPELINE – einziger Weg für Matching, Persistenz, § 53-Guard, Quality.
          const pipelineReport = await completePracticeCase(caseId, {
            source: "ai_case_machine",
            runLegalMatching: true,
            runKeywordMatching: true,
            runTemplateMatching: true,
            runSimilarityCheck: true,
            runQualityEvaluation: true,
            preserveManualContent: true,
            removeClearlyIrrelevantLegalLinks: true,
          });

          if (pipelineReport.status === "aborted") {
            throw new Error(
              pipelineReport.errors[0]?.message ?? "Pipeline abgebrochen",
            );
          }

          existingCases.push({
            id: caseId,
            title: draft.title ?? idea.title,
            category: draft.category ?? null,
          });

          const linkedKeywords =
            (pipelineReport.quality?.counts.keywordCount ?? 0) ||
            pipelineReport.keywords.assigned;
          const linkedSections =
            (pipelineReport.quality?.counts.legalCount ?? 0) ||
            (pipelineReport.legal.assigned.length + pipelineReport.legal.kept.length);

          if (pipelineReport.keywords.created > 0) {
            toast.success(
              `${pipelineReport.keywords.assigned} Schlagwörter zugeordnet (neu: ${pipelineReport.keywords.created}).`,
            );
          }
          if (pipelineReport.templates.assigned > 0) {
            toast.success(`${pipelineReport.templates.assigned} Dokumentvorlage${pipelineReport.templates.assigned > 1 ? "n" : ""} zugeordnet.`);
          }
          for (const w of pipelineReport.warnings.slice(0, 2)) toast.warning(w);

          const finalScore =
            pipelineReport.quality?.score ?? completeness.score;
          const finalAmpel: "gruen" | "gelb" | "rot" = pipelineReport.quality
            ? pipelineReport.quality.publicationReady
              ? "gruen"
              : pipelineReport.quality.score >= 60
                ? "gelb"
                : "rot"
            : completeness.ampel;

          setItems((prev) => {
            const copy = [...prev];
            copy[i] = {
              kind: "created",
              idea,
              caseId,
              score: finalScore,
              ampel: finalAmpel,
              missing: completeness.missing,
              linked: { keywords: linkedKeywords, sections: linkedSections },
            };
            return copy;
          });
          // touch — Draft-Hints (Keywords/Templates/Links) sind bewusst NICHT mehr separat
          // persistiert. Alles läuft über die zentrale Pipeline.
          void keywordIds;
          void validLinks;
          void validTemplateIds;
          void newlyCreatedKw;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setItems((prev) => {
            const copy = [...prev];
            copy[i] = { kind: "error", idea, error: msg };
            return copy;
          });
        }
      }

      // Zentrale Invalidierung nach Batch-Ende.
      try {
        invalidatePracticeCaseQueries(qc);
        await qc.invalidateQueries({ queryKey: ["published-cases"] });
      } catch { /* ignore */ }

      setStep("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("KI-Entwurfsmaschine fehlgeschlagen: " + msg);
    } finally {
      setRunning(false);
      setCancelFlag(false);
    }
  };


  // ────────────────────────────────────────────────────────────────────
  // Einzelfall-Modus: aus Kurzbeschreibung vollständigen vernetzten Entwurf erzeugen.
  // Verwendet dieselben KI-Endpunkte und zentralen Matching-Helper wie Batch und
  // „Fall automatisch vernetzen" im Core Builder.
  // ────────────────────────────────────────────────────────────────────
  const runSingle = async () => {
    const topic = singleTopic.trim();
    if (!topic) {
      toast.error("Bitte Thema oder Kurzbeschreibung angeben.");
      return;
    }
    if (singleRunning) return;
    setSingleRunning(true);
    setSingleResult(null);
    const warnings: string[] = [];
    try {
      setSingleStep("Lade Wissensbasis…");
      const [cats, kws, tmpls, secs, cases] = await Promise.all([
        listCategories(),
        listKeywords(),
        listTemplates(),
        listSections(),
        listCases(),
      ]);
      const publishedSecs = (secs as Array<Record<string, unknown>>).filter(
        (s) => (s.status ?? "published") === "published" || s.status === undefined,
      );
      const existingCases: SimilarCandidate[] = (cases as Array<Record<string, unknown>>).map((c) => ({
        id: c.id as string,
        title: (c.title as string) ?? "",
        category: (c.category as string) ?? null,
      }));

      // Frühe Dublettenwarnung nur zur Info – Erstellung nicht blockieren.
      const preSim = findSimilar({ title: topic, category: singleCategory }, existingCases, 0.7);
      if (preSim.length > 0) {
        warnings.push(`Ähnlicher Fall existiert bereits: „${preSim[0].title}"`);
      }

      setSingleStep("KI erzeugt Praxisfall-Entwurf…");
      const sectionRefs = publishedSecs.map((s) => ({
        id: s.id as string,
        label: `${(s as { legal_sources?: { name?: string } }).legal_sources?.name ?? ""} ${
          (s.section_number as string) ?? ""
        } ${(s.title as string) ?? ""}`.trim(),
      }));
      const templateRefs = (tmpls as Array<Record<string, unknown>>).map((t) => ({
        id: t.id as string,
        label: (t.title as string) ?? "",
      }));
      const caseRefs = existingCases.slice(0, 100).map((c) => ({
        id: c.id,
        label: c.title,
        category: c.category ?? undefined,
      }));

      const draftRes = await fetch("/api/ai-draft-batch-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: topic,
          sketch: topic,
          topic: singleCategory || "",
          categories: cats.map((c) => c.name),
          keywords: kws.map((k) => k.keyword),
          templates: templateRefs,
          sections: sectionRefs,
          cases: caseRefs,
          bildungsgang: singleBildungsgang,
          zielgruppe: singleZielgruppe,
        }),
      });
      if (!draftRes.ok) throw new Error(await draftRes.text());
      const { draft } = (await draftRes.json()) as { draft: BatchDraft };

      const validLinks = (draft.legal_links ?? []).filter((l) =>
        publishedSecs.some((s) => s.id === l.legal_section_id),
      );
      if (validLinks.length === 0) warnings.push("Offizielle Rechtsgrundlage prüfen – keine passende Wissensbasis-Grundlage gefunden.");

      setSingleStep("Speichere Praxisfall…");
      const completenessPre = computeCompleteness({
        short_description: draft.short_description,
        legal_explanation: draft.legal_explanation,
        responsibilities: draft.responsibilities,
        practice_tip: draft.practice_tip,
        common_mistakes: draft.common_mistakes,
        checklist: draft.checklist,
        documentation: draft.documentation,
        faq: draft.faq,
        keyword_count: 0,
        legal_link_count: validLinks.length,
        template_count: 0,
      });

      const meta = {
        source: "ki-entwurfsmaschine",
        mode: "single",
        topic: singleCategory || "",
        batch_started_at: new Date().toISOString().slice(0, 10),
        bildungsgang: singleBildungsgang || draft.bildungsgang || "",
        zielgruppe: singleZielgruppe || draft.zielgruppe || "",
        schwierigkeit: draft.schwierigkeit ?? "",
        bearbeitungsdauer: draft.bearbeitungsdauer ?? "",
        template_ids: [],
        risks: draft.risks ? [draft.risks] : [],
        escalation: draft.escalation ?? "",
        faq_items: draft.faq ?? [],
        keyword_hints: draft.keyword_hints ?? [],
        template_hints: [],
        legal_hints: [],
        related_hints: draft.related_hints ?? [],
        completeness_score: completenessPre.score,
        completeness_ampel: completenessPre.ampel,
        completeness_missing: completenessPre.missing,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await createCase({
        title: draft.title ?? topic,
        short_description: draft.short_description ?? topic,
        category: draft.category ?? singleCategory ?? "",
        subcategory: draft.subcategory ?? singleSubcategory ?? "",
        ampel: draft.ampel ?? "gelb",
        status: "draft",
        short_answer: draft.short_answer ?? "",
        immediate_actions: draft.immediate_actions ?? "",
        recommendation: draft.recommendation ?? "",
        legal_explanation: draft.legal_explanation ?? "",
        responsibilities: draft.responsibilities ?? "",
        practice_tip: draft.practice_tip ?? "",
        checklist: (draft.checklist ?? []).filter(Boolean),
        documentation: (draft.documentation ?? []).filter(Boolean),
        common_mistakes: (draft.common_mistakes ?? []).filter(Boolean),
        faq: { meta } as any,
      } as any);
      const caseId = row.id;

      // ZENTRALE PIPELINE – einziger Weg für Matching, Persistenz, § 53-Guard, Quality.
      setSingleStep("Zentrale Pipeline: Rechtsgrundlagen, Schlagwörter, Vorlagen, Ähnlichkeit, Qualität…");
      const pipelineReport = await completePracticeCase(caseId, {
        source: "ai_case_machine",
        runLegalMatching: true,
        runKeywordMatching: true,
        runTemplateMatching: true,
        runSimilarityCheck: true,
        runQualityEvaluation: true,
        preserveManualContent: true,
        removeClearlyIrrelevantLegalLinks: true,
      });
      if (pipelineReport.status === "aborted") {
        throw new Error(pipelineReport.errors[0]?.message ?? "Pipeline abgebrochen");
      }
      for (const w of pipelineReport.warnings) warnings.push(w);
      for (const e of pipelineReport.errors) warnings.push(`${e.step}: ${e.message}`);

      const legalLinked =
        (pipelineReport.quality?.counts.legalCount ?? 0) ||
        pipelineReport.legal.assigned.length + pipelineReport.legal.kept.length;
      const keywordsLinked =
        (pipelineReport.quality?.counts.keywordCount ?? 0) ||
        pipelineReport.keywords.assigned;
      const templatesLinked =
        (pipelineReport.quality?.counts.templateCount ?? 0) ||
        pipelineReport.templates.assigned;

      if (legalLinked === 0) warnings.push("Keine belastbare Rechtsgrundlage – Redaktion prüfen.");
      if (templatesLinked === 0) warnings.push("Dokumentvorlage empfohlen – kein Vorschlag mit ausreichender Konfidenz.");

      const similarOut = pipelineReport.similarCases.slice(0, 10).map((s) => ({
        id: s.id,
        title: s.title,
        similarity: s.score,
        reason: "Deterministische Ähnlichkeit",
        possibleDuplicate: s.score >= 0.75,
      }));
      if (similarOut.some((s) => s.possibleDuplicate)) {
        warnings.push("Mögliche Dublette erkannt – Redaktion prüfen.");
      }

      // Vollständigkeit aus frischen Pipeline-Zahlen berechnen.
      const completeness = computeCompleteness({
        short_description: draft.short_description,
        legal_explanation: draft.legal_explanation,
        responsibilities: draft.responsibilities,
        practice_tip: draft.practice_tip,
        common_mistakes: draft.common_mistakes,
        checklist: draft.checklist,
        documentation: draft.documentation,
        faq: draft.faq,
        keyword_count: keywordsLinked,
        legal_link_count: legalLinked,
        template_count: templatesLinked,
      });
      const finalScore = pipelineReport.quality?.score ?? completeness.score;
      const finalAmpel: "gruen" | "gelb" | "rot" = pipelineReport.quality
        ? pipelineReport.quality.publicationReady
          ? "gruen"
          : pipelineReport.quality.score >= 60
            ? "gelb"
            : "rot"
        : completeness.ampel;

      invalidatePracticeCaseQueries(qc, caseId);

      setSingleResult({
        caseId,
        title: draft.title ?? topic,
        score: finalScore,
        ampel: finalAmpel,
        missing: completeness.missing,
        counts: { legal: legalLinked, keywords: keywordsLinked, templates: templatesLinked },
        similar: similarOut,
        warnings,
      });
      setSingleStep("");
      toast.success(
        `Entwurf erzeugt: ${legalLinked} Rechtsgrundlagen · ${keywordsLinked} Schlagwörter · ${templatesLinked} Vorlagen · Score ${finalScore}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Einzelfall-Erzeugung fehlgeschlagen: " + msg);
      setSingleStep("");
    } finally {
      setSingleRunning(false);
    }
  };

  const discardSingle = async () => {
    if (!singleResult) return;
    if (!confirm("Entwurf endgültig verwerfen und aus der Datenbank löschen?")) return;
    try {
      await deleteCase(singleResult.caseId);
      toast.success("Entwurf verworfen.");
      setSingleResult(null);
    } catch (e) {
      toast.error("Löschen fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  useEffect(() => {
    if (!running && total > 0 && done === total && completionNoticeKey !== generatedCaseIdKey) {
      const c = items.filter((i) => i.kind === "created").length;
      const d = items.filter((i) => i.kind === "duplicate").length;
      const e = items.filter((i) => i.kind === "error").length;
      toast(`Zusammenfassung: ${c} erstellt, ${d} übersprungen, ${e} Fehler`);
      if (c > 0) {
        setReviewOpen(true);
        void loadGeneratedQuality(generatedCaseIds);
        toast.success("Generierung abgeschlossen. Qualitätsübersicht und Veröffentlichung sind direkt unten verfügbar.");
      }
      setCompletionNoticeKey(generatedCaseIdKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, done, total, generatedCaseIdKey, completionNoticeKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Sparkles className="h-6 w-6 text-primary" />
            KI-Entwurfsmaschine
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Erzeugt vollständige Praxisfall-Entwürfe (Status: Entwurf) mit automatischer
            Verknüpfung zu vorhandenen Rechtsgrundlagen, Vorlagen und Schlagwörtern.
            Keine automatische Veröffentlichung – Redaktion prüft.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/qualitaetsmanager"
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
          >
            Qualitätsmanager öffnen →
          </Link>
          <Link
            to="/admin/ki-entwurfsmaschine/review"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Qualitätsübersicht →
          </Link>
          <Link
            to="/admin/ki-entwurfsmaschine/pruefung"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Prüfliste →
          </Link>
          <Link
            to="/admin/ki-entwurfsmaschine/excel-import"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Excel-Import →
          </Link>
        </div>



      </div>

      {/* Modus-Umschaltung */}
      <div className="inline-flex rounded-lg border border-border bg-card p-1 text-xs">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`rounded-md px-3 py-1.5 font-medium ${mode === "single" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          Einzelfall
        </button>
        <button
          type="button"
          onClick={() => setMode("batch")}
          className={`ml-1 rounded-md px-3 py-1.5 font-medium ${mode === "batch" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          Batch
        </button>
      </div>

      {mode === "single" && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Vollständigen Praxisfall aus Kurzbeschreibung erzeugen</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Thema oder Kurzbeschreibung *</Label>
              <Textarea
                rows={2}
                placeholder={'z. B. „Schüler filmt Lehrkraft im Unterricht"…'}
                value={singleTopic}
                onChange={(e) => setSingleTopic(e.target.value)}
                disabled={singleRunning}
              />
            </div>
            <div>
              <Label className="text-xs">Kategorie (optional)</Label>
              <Input value={singleCategory} onChange={(e) => setSingleCategory(e.target.value)} disabled={singleRunning} />
            </div>
            <div>
              <Label className="text-xs">Unterkategorie (optional)</Label>
              <Input value={singleSubcategory} onChange={(e) => setSingleSubcategory(e.target.value)} disabled={singleRunning} />
            </div>
            <div>
              <Label className="text-xs">Schulform / Bildungsbereich (optional)</Label>
              <Input value={singleBildungsgang} onChange={(e) => setSingleBildungsgang(e.target.value)} disabled={singleRunning} />
            </div>
            <div>
              <Label className="text-xs">Zielgruppe (optional)</Label>
              <Input value={singleZielgruppe} onChange={(e) => setSingleZielgruppe(e.target.value)} disabled={singleRunning} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button type="button" onClick={runSingle} disabled={singleRunning || !singleTopic.trim()}>
              {singleRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {singleRunning ? "Erzeuge…" : "Vollständigen Praxisfall erzeugen"}
            </Button>
            {singleStep && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {singleStep}
              </span>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Die KI erzeugt einen vollständigen Entwurf (Status: draft) und ordnet automatisch passende
            Rechtsgrundlagen, Schlagwörter und Dokumentvorlagen aus der Wissensbasis zu.
            Es werden keine Rechtsgrundlagen erfunden.
          </p>
        </section>
      )}

      {mode === "single" && singleResult && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">KI-Fallentwurf prüfen</div>
              <h3 className="mt-0.5 truncate text-lg font-semibold">{singleResult.title}</h3>
            </div>
            <span
              className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
                singleResult.ampel === "gruen"
                  ? "bg-emerald-500/15 text-emerald-700"
                  : singleResult.ampel === "gelb"
                    ? "bg-amber-500/15 text-amber-700"
                    : "bg-rose-500/15 text-rose-700"
              }`}
            >
              {singleResult.ampel === "gruen" ? "🟢 nahezu vollständig" : singleResult.ampel === "gelb" ? "🟡 redaktionell prüfen" : "🔴 unvollständig"} · {singleResult.score}%
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-border bg-muted/30 p-2">
              <div className="text-lg font-semibold">{singleResult.counts.legal}</div>
              <div className="text-muted-foreground">Rechtsgrundlagen</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-2">
              <div className="text-lg font-semibold">{singleResult.counts.keywords}</div>
              <div className="text-muted-foreground">Schlagwörter</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-2">
              <div className="text-lg font-semibold">{singleResult.counts.templates}</div>
              <div className="text-muted-foreground">Dokumentvorlagen</div>
            </div>
          </div>

          {singleResult.warnings.length > 0 && (
            <div className="mt-4 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800">
              {singleResult.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5" /> {w}
                </div>
              ))}
            </div>
          )}

          {singleResult.missing.length > 0 && (
            <div className="mt-3 text-xs">
              <span className="font-medium">Noch fehlt: </span>
              <span className="text-muted-foreground">{singleResult.missing.join(", ")}</span>
            </div>
          )}

          {singleResult.similar.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-medium">Ähnliche Praxisfälle</div>
              <ul className="space-y-1 text-xs">
                {singleResult.similar.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 rounded border border-border bg-muted/20 p-2">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${
                        s.possibleDuplicate ? "bg-rose-500/15 text-rose-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {s.similarity}%
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.title}</div>
                      <div className="text-muted-foreground">{s.reason}</div>
                    </div>
                    <Link
                      to="/admin/faelle/$id"
                      params={{ id: s.id }}
                      className="shrink-0 text-primary hover:underline"
                    >
                      öffnen
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() =>
                navigate({ to: "/admin/faelle/$id", params: { id: singleResult.caseId } })
              }
            >
              <ExternalLink className="h-4 w-4" /> Prüfen und bearbeiten
            </Button>
            <Button type="button" variant="outline" onClick={() => setSingleResult(null)}>
              Neuen Entwurf erzeugen
            </Button>
            <Button type="button" variant="ghost" onClick={discardSingle} className="text-rose-600 hover:text-rose-700">
              <Trash2 className="h-4 w-4" /> Verwerfen
            </Button>
          </div>
        </section>
      )}

      {mode === "batch" && (
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div>
            <Label className="text-xs">Anzahl</Label>
            <div className="mt-1 flex items-center gap-2">
              {[5, 10, 25, 50, 100].map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={count === n ? "default" : "outline"}
                  onClick={() => setCount(n)}
                  disabled={running}
                >
                  {n}
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                className="w-24"
                disabled={running}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Themenbereiche (optional)</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {TOPICS.map((t) => {
                const active = selectedTopics.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTopic(t)}
                    disabled={running}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <Input
              className="mt-2"
              placeholder="Weitere Themen, kommagetrennt…"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              disabled={running}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button type="button" onClick={start} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Läuft…" : `${count} Entwürfe erzeugen`}
          </Button>
          {running && (
            <Button type="button" variant="outline" onClick={() => setCancelFlag(true)}>
              <StopCircle className="h-4 w-4" />
              Nach aktuellem Schritt stoppen
            </Button>
          )}
          {step && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {step}
            </span>
          )}
        </div>
      </section>
      )}

      {mode === "batch" && total > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm">
            <div className="font-medium">
              Fortschritt: {done} von {total}
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="text-emerald-600">✓ {summary.created} erstellt</span>
              <span className="text-amber-600">⤳ {summary.dup} übersprungen</span>
              <span className="text-rose-600">✗ {summary.err} Fehler</span>
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
            />
          </div>

          <ul className="mt-5 space-y-2">
            {items.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm"
              >
                <div className="mt-0.5">
                  {item.kind === "pending" && <span className="text-xs text-muted-foreground">·</span>}
                  {item.kind === "running" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {item.kind === "created" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                  {item.kind === "duplicate" && (
                    <SkipForward className="h-4 w-4 text-amber-500" />
                  )}
                  {item.kind === "error" && <XCircle className="h-4 w-4 text-rose-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.idea.title}</div>
                  {item.kind === "running" && (
                    <div className="text-xs text-muted-foreground">{item.step}</div>
                  )}
                  {item.kind === "created" && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          item.ampel === "gruen"
                            ? "bg-emerald-500/15 text-emerald-700"
                            : item.ampel === "gelb"
                              ? "bg-amber-500/15 text-amber-700"
                              : "bg-rose-500/15 text-rose-700"
                        }`}
                      >
                        {item.score}%
                      </span>
                      <span>· {item.linked.sections} Rechtsgrundlagen</span>
                      <span>· {item.linked.keywords} Schlagwörter</span>
                      {item.missing.length > 0 && (
                        <span className="text-amber-600">
                          fehlt: {item.missing.slice(0, 3).join(", ")}
                          {item.missing.length > 3 ? " …" : ""}
                        </span>
                      )}
                      <Link
                        to="/admin/faelle/$id"
                        params={{ id: item.caseId }}
                        className="ml-auto text-primary hover:underline"
                      >
                        öffnen →
                      </Link>
                    </div>
                  )}
                  {item.kind === "duplicate" && (
                    <div className="text-xs text-amber-700">
                      Ähnlich zu bestehendem Fall: „{item.similarTo}"
                    </div>
                  )}
                  {item.kind === "error" && (
                    <div className="text-xs text-rose-700">{item.error.slice(0, 240)}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {batchComplete && (
            <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4" id="ki-generation-complete">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    KI-Fallproduktion abgeschlossen
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {summary.created} generierte Fälle · {summary.dup} übersprungen · {summary.err} Fehler
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={openQualityOverview}>
                    <ShieldCheck className="h-4 w-4" /> Qualitätsübersicht öffnen
                  </Button>
                  <Button type="button" variant="outline" onClick={openChecklist}>
                    <ClipboardList className="h-4 w-4" /> Prüfliste öffnen
                  </Button>
                  <Button
                    type="button"
                    onClick={publishReadyCases}
                    disabled={!!publishDisabledReason}
                    title={publishDisabledReason || "Veröffentlichungsreife Fälle veröffentlichen"}
                  >
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {readyRows.length > 0
                      ? `${readyRows.length} veröffentlichungsreife Fälle veröffentlichen`
                      : "Alle veröffentlichungsreifen Fälle veröffentlichen"}
                  </Button>
                </div>
              </div>

              {publishDisabledReason && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-800">
                  {publishDisabledReason}
                </div>
              )}

              <div className="mt-4 grid gap-2 rounded-lg border border-border bg-background/60 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="text-muted-foreground">generatedCaseIds:</span> {generatedCaseIds.length ? generatedCaseIds.join(", ") : "—"}</div>
                <div><span className="text-muted-foreground">Anzahl generierter Fälle:</span> {generatedCaseIds.length}</div>
                <div><span className="text-muted-foreground">Anzahl veröffentlichungsreifer Fälle:</span> {readyRows.length}</div>
                <div><span className="text-muted-foreground">reviewSectionMounted:</span> {reviewOpen ? "ja" : "nein"}</div>
                <div><span className="text-muted-foreground">publishButtonVisible:</span> ja</div>
                <div><span className="text-muted-foreground">publishButtonDisabledReason:</span> {publishDisabledReason || "—"}</div>
                <div><span className="text-muted-foreground">onClick Qualitätsübersicht vorhanden:</span> ja</div>
                <div><span className="text-muted-foreground">onClick Prüfliste vorhanden:</span> ja</div>
                <div><span className="text-muted-foreground">onClick Publish vorhanden:</span> ja</div>
              </div>

              {qualityError && (
                <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700">
                  {qualityError}
                </div>
              )}

              {publishReport && (
                <div className="mt-3 rounded-lg border border-border bg-background/70 p-3 text-xs">
                  <div className="font-medium">Veröffentlichungsergebnis</div>
                  <div className="mt-1 text-muted-foreground">
                    {publishReport.published.length} veröffentlicht · {publishReport.rejected.length} abgelehnt · {publishReport.errors.length} Fehler
                  </div>
                  {publishReport.rejected.length > 0 && (
                    <ul className="mt-2 space-y-1 text-amber-700">
                      {publishReport.rejected.slice(0, 5).map((r) => (
                        <li key={r.caseId}>· {r.caseId}: {r.hardBlockers.join(", ") || r.reasons.slice(0, 2).join("; ")}</li>
                      ))}
                    </ul>
                  )}
                  {publishReport.errors.length > 0 && (
                    <ul className="mt-2 space-y-1 text-rose-700">
                      {publishReport.errors.slice(0, 5).map((r) => (
                        <li key={r.caseId}>· {r.caseId}: {r.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {batchComplete && reviewOpen && (
            <section id="ki-quality-overview" className="mt-5 rounded-xl border border-border bg-background/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <ShieldCheck className="h-5 w-5 text-primary" /> Qualitätsübersicht
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Direkt aus den generierten Fällen dieses Laufs berechnet.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => loadGeneratedQuality(generatedCaseIds)} disabled={qualityLoading}>
                    {qualityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Neu prüfen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={publishReadyCases}
                    disabled={!!publishDisabledReason}
                    title={publishDisabledReason || "Veröffentlichungsreife Fälle veröffentlichen"}
                  >
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {readyRows.length > 0
                      ? `${readyRows.length} veröffentlichungsreife Fälle veröffentlichen`
                      : "Alle veröffentlichungsreifen Fälle veröffentlichen"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-2"><div className="text-lg font-semibold">{qualityRows.length}</div><div className="text-muted-foreground">geprüft</div></div>
                <div className="rounded-lg border border-border bg-card p-2"><div className="text-lg font-semibold text-emerald-600">{readyRows.length}</div><div className="text-muted-foreground">veröffentlichungsreif</div></div>
                <div className="rounded-lg border border-border bg-card p-2"><div className="text-lg font-semibold text-amber-600">{qualityRows.filter((r) => r.score < 90).length}</div><div className="text-muted-foreground">unter 90</div></div>
                <div className="rounded-lg border border-border bg-card p-2"><div className="text-lg font-semibold text-rose-600">{qualityRows.filter((r) => r.hardBlockers.length > 0).length}</div><div className="text-muted-foreground">Hard Blocker</div></div>
              </div>

              {qualityLoading && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Qualitätsprüfung läuft…
                </div>
              )}

              {!qualityLoading && qualityRows.length === 0 && (
                <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Keine generierten Fälle dieses Laufs für die Qualitätsübersicht gefunden.
                </div>
              )}

              {qualityEvalErrors.length > 0 && (
                <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700">
                  {qualityEvalErrors.length} Fall/Fälle konnten nicht geprüft werden.
                </div>
              )}

              <ul className="mt-4 space-y-2">
                {qualityRows.map((r) => {
                  const sl = statusLabel(r);
                  return (
                    <li key={r.caseId} className="rounded-lg border border-border bg-card p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">{r.title}</span>
                            {r.category && <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{r.category}</span>}
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{r.status ?? "draft"}</span>
                          </div>
                          <div className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs font-semibold ${sl.tone === "gruen" ? "bg-emerald-500/15 text-emerald-700" : sl.tone === "gelb" ? "bg-amber-500/15 text-amber-700" : "bg-rose-500/15 text-rose-700"}`}>
                            {r.score} / 100 · {sl.label}
                          </div>
                        </div>
                        <Link to="/admin/faelle/$id" params={{ id: r.caseId }} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                          öffnen →
                        </Link>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                        <span>Inhalt {r.sub.inhalt}/30</span>
                        <span>Recht {r.sub.recht}/30</span>
                        <span>Vernetzung {r.sub.vernetzung}/20</span>
                        <span>Redaktion {r.sub.redaktion}/20</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{r.counts.doCount} Do's</span>
                        <span>{r.counts.dontCount} Don'ts</span>
                        <span>{r.counts.legalCount} Rechtsgrundlagen</span>
                        <span>{r.counts.keywordCount} Schlagwörter</span>
                        <span>{r.counts.templateCount} Vorlagen</span>
                        <span>{r.counts.checklistCount} Checkliste</span>
                        <span>{r.counts.faqCount} FAQ</span>
                      </div>
                      {r.hardBlockers.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1 text-xs">
                          {r.hardBlockers.map((h, i) => (
                            <span key={i} className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700">{h}</span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {batchComplete && reviewOpen && checklistOpen && (
            <section id="ki-review-checklist" className="mt-5 rounded-xl border border-border bg-background/60 p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ClipboardList className="h-5 w-5 text-primary" /> Prüfliste
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {qualityRows.map((r) => (
                  <li key={r.caseId} className="rounded-lg border border-border bg-card p-3">
                    <div className="font-medium">{r.title}</div>
                    {r.publicationReady ? (
                      <div className="mt-1 text-xs text-emerald-700">Veröffentlichungsreif – keine Hard Blocker.</div>
                    ) : (
                      <div className="mt-1 space-y-1 text-xs">
                        {r.hardBlockers.length > 0 && <div className="text-rose-700">Hard Blocker: {r.hardBlockers.join(", ")}</div>}
                        {r.reasons.length > 0 && <div className="text-amber-700">Zu prüfen: {r.reasons.slice(0, 6).map((x) => x.message).join("; ")}</div>}
                        {r.hardBlockers.length === 0 && r.reasons.length === 0 && <div className="text-muted-foreground">Score unter Veröffentlichungsgrenze.</div>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {newKeywordSuggestions.size > 0 && (
            <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Neue Schlagwort-Vorschläge (nicht automatisch angelegt):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(newKeywordSuggestions).map((k) => (
                  <span
                    key={k}
                    className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5"
                  >
                    {k}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-muted-foreground">
                Redaktion kann diese unter Admin → Schlagwörter anlegen und dann den Fällen zuordnen.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
