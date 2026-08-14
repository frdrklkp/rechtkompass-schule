import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Play,
  StopCircle,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  SkipForward,
  ExternalLink,
  Eye,
  Trash2,
  Flag,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { listCases, updateCase } from "@/lib/coreBuilder";
import {
  parseCuratedTree,
  validateCuratedTree,
  deriveTreeStatus,
  type CuratedDecisionTree,
} from "@/lib/decisionTree";
import { invalidatePracticeCaseQueries } from "@/lib/casePipeline.invalidate";
import { cn } from "@/lib/utils";
import { DecisionAssistant } from "@/components/DecisionAssistant";

export const Route = createFileRoute("/admin/entscheidungsassistenten-batch")({
  component: BatchPage,
});

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type CaseRow = {
  id: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  status: string | null;
  short_description: string | null;
  short_answer: string | null;
  immediate_actions: string | null;
  recommendation: string | null;
  responsibilities: string | null;
  practice_tip: string | null;
  legal_explanation: string | null;
  common_mistakes: string[];
  checklist: string[];
  documentation: string[];
  faq: unknown;
  decision_tree: unknown;
};

type TreeStatus = ReturnType<typeof deriveTreeStatus>;

type SuitabilityReason =
  | "ok"
  | "no_title"
  | "no_short_description"
  | "no_short_answer"
  | "no_recommendation"
  | "too_few_dos"
  | "no_dont"
  | "no_legal_basis"
  | "no_documentation"
  | "approved_locked"
  | "existing_blocked";

type Suitability = { ok: boolean; reason: SuitabilityReason; label: string };

type OverwriteMode = "none" | "drafts" | "all_non_approved";

type Quality = "green" | "yellow" | "red";

type RunStatus =
  | "queued"
  | "generating"
  | "generated"
  | "generated_with_warnings"
  | "rejected_invalid"
  | "skipped"
  | "error";

type RunItem = {
  caseId: string;
  status: RunStatus;
  quality?: Quality;
  message?: string;
  hints: string[];
  steps: number;
  results: number;
  depth: number;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function countLegalLinks(map: Map<string, number>, id: string): number {
  return map.get(id) ?? 0;
}

function assessSuitability(
  c: CaseRow,
  legalLinks: number,
  overwrite: OverwriteMode,
): Suitability {
  if (!c.title?.trim()) return { ok: false, reason: "no_title", label: "Kein Titel" };
  const sd = (c.short_description ?? "").trim();
  if (sd.length < 40)
    return { ok: false, reason: "no_short_description", label: "Sachverhalt zu knapp" };
  if (!(c.short_answer ?? "").trim() && !(c.immediate_actions ?? "").trim())
    return { ok: false, reason: "no_short_answer", label: "Keine Kurzantwort" };
  if (!(c.recommendation ?? "").trim())
    return { ok: false, reason: "no_recommendation", label: "Keine Empfehlung" };
  const dos = (c.checklist ?? []).filter((x) => x?.trim()).length;
  if (dos < 4) return { ok: false, reason: "too_few_dos", label: "Weniger als 4 Do's" };
  const donts = (c.common_mistakes ?? []).filter((x) => x?.trim()).length;
  if (donts < 1) return { ok: false, reason: "no_dont", label: "Keine Don'ts/Risiken" };
  if (legalLinks < 1)
    return { ok: false, reason: "no_legal_basis", label: "Keine Rechtsgrundlage" };
  const docs = (c.documentation ?? []).filter((x) => x?.trim()).length;
  if (docs < 1) return { ok: false, reason: "no_documentation", label: "Kein Doku-Hinweis" };

  const treeStatus = deriveTreeStatus(c.decision_tree);
  if (treeStatus === "approved")
    return { ok: false, reason: "approved_locked", label: "Freigegeben – geschützt" };
  if (overwrite === "none" && treeStatus !== "none")
    return { ok: false, reason: "existing_blocked", label: "Bereits vorhandener Baum" };
  if (overwrite === "drafts" && (treeStatus === "review" || treeStatus === "invalid"))
    return { ok: false, reason: "existing_blocked", label: "Status geschützt (nur Entwürfe)" };
  return { ok: true, reason: "ok", label: "geeignet" };
}

function maxDepth(tree: CuratedDecisionTree): number {
  const visit = (id: string, seen: Set<string>, d: number): number => {
    if (seen.has(id)) return d;
    const step = tree.steps[id];
    if (!step) return d;
    const next = new Set(seen).add(id);
    let best = d + 1;
    for (const opt of step.options) {
      if (opt.next) best = Math.max(best, visit(opt.next, next, d + 1));
    }
    return best;
  };
  return tree.steps[tree.start] ? visit(tree.start, new Set(), 0) : 0;
}

function assessQuality(
  tree: CuratedDecisionTree,
  validErrors: number,
  hints: string[],
): Quality {
  if (validErrors > 0) return "red";
  const stepsCount = Object.keys(tree.steps).length;
  const resultsCount = Object.keys(tree.results).length;
  if (stepsCount < 2 || resultsCount < 2) return "red";
  if (hints.length > 0) return "yellow";
  return "green";
}

function collectQualityHints(tree: CuratedDecisionTree, warnings: string[]): string[] {
  const hints: string[] = [...warnings];
  const seenQ = new Set<string>();
  const genericRe =
    /wurde dokumentiert|handlungsbedarf|ist die situation wichtig|benötigen sie hilfe|möchten sie fortfahren/i;
  for (const s of Object.values(tree.steps)) {
    const q = s.question.trim().toLowerCase();
    if (q.length > 0 && q.length < 25) hints.push(`Frage sehr allgemein: „${s.question}"`);
    if (q && seenQ.has(q)) hints.push(`Frage doppelt: „${s.question}"`);
    seenQ.add(q);
    if (genericRe.test(s.question)) hints.push(`Generische Frage: „${s.question}"`);
  }
  const warnSet = new Set<string>();
  for (const r of Object.values(tree.results)) {
    const w = r.warning.trim();
    if (!w) hints.push(`Ergebnis „${r.title || "(ohne Titel)"}" ohne Warnhinweis.`);
    else if (warnSet.has(w)) hints.push(`Warnhinweis doppelt: „${w.slice(0, 60)}…"`);
    warnSet.add(w);
    if (!r.documentation.trim())
      hints.push(`Ergebnis „${r.title || "(ohne Titel)"}" ohne Dokumentationshinweis.`);
  }
  return hints;
}

const REASON_LABEL: Record<SuitabilityReason, string> = {
  ok: "geeignet",
  no_title: "Titel fehlt",
  no_short_description: "Sachverhalt zu kurz",
  no_short_answer: "Kurzantwort fehlt",
  no_recommendation: "Empfehlung fehlt",
  too_few_dos: "< 4 Do's",
  no_dont: "keine Don'ts",
  no_legal_basis: "keine Rechtsgrundlage",
  no_documentation: "kein Doku-Hinweis",
  approved_locked: "freigegeben – geschützt",
  existing_blocked: "vorhandener Baum – geschützt",
};

/* -------------------------------------------------------------------------- */
/* Publish assessment                                                         */
/* -------------------------------------------------------------------------- */

type PublishReason =
  | "no_tree"
  | "invalid"
  | "already_published"
  | "not_reviewed"
  | "ok";

type PublishAssessment = {
  hasTree: boolean;
  publishable: boolean;
  alreadyPublished: boolean;
  isInvalid: boolean;
  isDraft: boolean;
  isReview: boolean;
  reason: PublishReason;
  reasonLabel: string;
};

function assessPublish(treeStatus: TreeStatus): PublishAssessment {
  const hasTree = treeStatus !== "none";
  const alreadyPublished = treeStatus === "approved";
  const isInvalid = treeStatus === "invalid";
  const isDraft = treeStatus === "draft";
  const isReview = treeStatus === "review";
  let reason: PublishReason = "ok";
  let reasonLabel = "veröffentlichungsfähig";
  let publishable = false;
  if (!hasTree) {
    reason = "no_tree";
    reasonLabel = "kein Baum";
  } else if (isInvalid) {
    reason = "invalid";
    reasonLabel = "technisch fehlerhaft";
  } else if (alreadyPublished) {
    reason = "already_published";
    reasonLabel = "bereits veröffentlicht";
  } else if (isDraft) {
    reason = "not_reviewed";
    reasonLabel = "Prüfung erforderlich";
  } else if (isReview) {
    publishable = true;
  }
  return {
    hasTree,
    publishable,
    alreadyPublished,
    isInvalid,
    isDraft,
    isReview,
    reason,
    reasonLabel,
  };
}

type PublishRunStatus = "published" | "skipped" | "failed" | "unpublished";
type PublishRunItem = {
  caseId: string;
  title: string;
  status: PublishRunStatus;
  message?: string;
};



/* -------------------------------------------------------------------------- */
/* Data hooks                                                                 */
/* -------------------------------------------------------------------------- */

function useAllCases() {
  return useQuery({
    queryKey: ["batch-dt-cases"],
    queryFn: async (): Promise<CaseRow[]> => {
      const rows = await listCases();
      return (rows as unknown as CaseRow[]).map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category ?? null,
        subcategory: r.subcategory ?? null,
        status: r.status ?? null,
        short_description: r.short_description ?? null,
        short_answer: r.short_answer ?? null,
        immediate_actions: r.immediate_actions ?? null,
        recommendation: r.recommendation ?? null,
        responsibilities: r.responsibilities ?? null,
        practice_tip: r.practice_tip ?? null,
        legal_explanation: r.legal_explanation ?? null,
        common_mistakes: r.common_mistakes ?? [],
        checklist: r.checklist ?? [],
        documentation: r.documentation ?? [],
        faq: r.faq ?? null,
        decision_tree: r.decision_tree ?? null,
      }));
    },
    staleTime: 30_000,
  });
}

function useLegalLinkCounts() {
  return useQuery({
    queryKey: ["batch-dt-legal-link-counts"],
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from("case_legal_links")
        .select("case_id");
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ case_id: string }>) {
        map.set(row.case_id, (map.get(row.case_id) ?? 0) + 1);
      }
      return map;
    },
    staleTime: 30_000,
  });
}

async function loadLegalBasisFor(caseId: string): Promise<string[]> {
  // Zweistufig statt verschachteltem Embed (Fund 2026-08-14): case_legal_links.
  // legal_section_id hat keinen Datenbank-Fremdschlüssel, wodurch der
  // "legal_sections(...)"-Embed hier bisher still leer blieb.
  const { data: linkRows } = await (supabase.from("case_legal_links") as any)
    .select("legal_section_id")
    .eq("case_id", caseId);
  const sectionIds = [...new Set(((linkRows ?? []) as Array<{ legal_section_id: string }>).map((l) => l.legal_section_id).filter(Boolean))];
  if (sectionIds.length === 0) return [];
  const { data: sectionRows } = await (supabase.from("legal_sections") as any)
    .select("section_number, legal_sources(name)")
    .in("id", sectionIds);
  return ((sectionRows ?? []) as Array<any>)
    .map((s) => {
      if (!s?.section_number) return null;
      const name = s.legal_sources?.name;
      return name ? `${s.section_number} ${name}` : s.section_number;
    })
    .filter(Boolean) as string[];
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

function BatchPage() {
  const qc = useQueryClient();
  const casesQ = useAllCases();
  const legalQ = useLegalLinkCounts();

  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterTree, setFilterTree] = useState<"" | TreeStatus>("");
  const [onlyPublished, setOnlyPublished] = useState<boolean>(true);
  const [overwrite, setOverwrite] = useState<OverwriteMode>("none");
  const [count, setCount] = useState<number>(5);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const [running, setRunning] = useState(false);
  const [cancelFlag, setCancelFlag] = useState(false);
  const [items, setItems] = useState<Record<string, RunItem>>({});
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [previewCaseId, setPreviewCaseId] = useState<string | null>(null);

  // Publish batch selection (independent from AI generation selection).
  const [pubSelection, setPubSelection] = useState<Set<string>>(new Set());
  const [pubConfirm, setPubConfirm] = useState<
    | null
    | {
        mode: "publish" | "unpublish" | "mark_review";
        items: Array<{ caseId: string; title: string }>;
        skipped: Array<{ caseId: string; title: string; reason: string }>;
      }
  >(null);
  const [pubRunning, setPubRunning] = useState(false);
  const [pubResults, setPubResults] = useState<PublishRunItem[]>([]);

  const cases = casesQ.data ?? [];
  const linkCounts = legalQ.data ?? new Map<string, number>();

  const categories = useMemo(
    () =>
      Array.from(new Set(cases.map((c) => c.category ?? "").filter(Boolean))).sort() as string[],
    [cases],
  );

  const enriched = useMemo(() => {
    return cases.map((c) => {
      const treeStatus = deriveTreeStatus(c.decision_tree);
      const suit = assessSuitability(c, countLegalLinks(linkCounts, c.id), overwrite);
      return { c, treeStatus, suit };
    });
  }, [cases, linkCounts, overwrite]);

  const filtered = useMemo(() => {
    return enriched.filter(({ c, treeStatus }) => {
      if (onlyPublished && c.status !== "published") return false;
      if (filterCategory && c.category !== filterCategory) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterTree && treeStatus !== filterTree) return false;
      return true;
    });
  }, [enriched, onlyPublished, filterCategory, filterStatus, filterTree]);

  const suitable = useMemo(() => filtered.filter((r) => r.suit.ok), [filtered]);

  const selectedSuitable = useMemo(
    () => suitable.filter((r) => selection.has(r.c.id)),
    [suitable, selection],
  );

  const toggleOne = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllSuitable = () => setSelection(new Set(suitable.map((r) => r.c.id)));
  const selectFirstN = () =>
    setSelection(new Set(suitable.slice(0, Math.max(0, count)).map((r) => r.c.id)));
  const clearSelection = () => setSelection(new Set());

  /* ------- publish selection ------------------------------------------- */

  const filteredWithPub = useMemo(
    () => filtered.map((r) => ({ ...r, pub: assessPublish(r.treeStatus) })),
    [filtered],
  );
  const visibleIds = useMemo(
    () => filteredWithPub.map((r) => r.c.id),
    [filteredWithPub],
  );
  const publishableRows = useMemo(
    () => filteredWithPub.filter((r) => r.pub.publishable),
    [filteredWithPub],
  );

  const togglePubOne = (id: string) => {
    setPubSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllVisiblePub = () =>
    setPubSelection((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  const clearVisiblePub = () =>
    setPubSelection((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.delete(id);
      return next;
    });
  const selectAllPublishable = () =>
    setPubSelection((prev) => {
      const next = new Set(prev);
      for (const r of publishableRows) next.add(r.c.id);
      return next;
    });
  const clearAllPub = () => setPubSelection(new Set());

  const visibleAllSelected =
    visibleIds.length > 0 && visibleIds.every((id) => pubSelection.has(id));
  const visibleSomeSelected =
    !visibleAllSelected && visibleIds.some((id) => pubSelection.has(id));

  const pubSummary = useMemo(() => {
    const rows = filteredWithPub.filter((r) => pubSelection.has(r.c.id));
    return {
      total: pubSelection.size,
      visible: rows.length,
      publishable: rows.filter((r) => r.pub.publishable).length,
      alreadyPublished: rows.filter((r) => r.pub.alreadyPublished).length,
      drafts: rows.filter((r) => r.pub.isDraft).length,
      invalid: rows.filter((r) => r.pub.isInvalid).length,
      unpublishable:
        rows.filter((r) => r.pub.alreadyPublished).length,
    };
  }, [filteredWithPub, pubSelection]);

  function preparePublish() {
    const items: Array<{ caseId: string; title: string }> = [];
    const skipped: Array<{ caseId: string; title: string; reason: string }> = [];
    for (const r of filteredWithPub) {
      if (!pubSelection.has(r.c.id)) continue;
      const title = r.c.title || "(ohne Titel)";
      if (!r.pub.hasTree) skipped.push({ caseId: r.c.id, title, reason: "Kein Baum" });
      else if (r.pub.isInvalid)
        skipped.push({ caseId: r.c.id, title, reason: "Technisch fehlerhaft" });
      else if (r.pub.alreadyPublished)
        skipped.push({ caseId: r.c.id, title, reason: "Bereits veröffentlicht" });
      else if (r.pub.isDraft)
        skipped.push({ caseId: r.c.id, title, reason: "Noch Entwurf – erst zur Prüfung markieren" });
      else if (r.pub.isReview) items.push({ caseId: r.c.id, title });
      else skipped.push({ caseId: r.c.id, title, reason: "Nicht veröffentlichungsfähig" });
    }
    // For cases outside the current filter but selected, treat as skipped-invisible.
    const filteredIds = new Set(filteredWithPub.map((r) => r.c.id));
    for (const id of pubSelection) {
      if (filteredIds.has(id)) continue;
      const c = cases.find((x) => x.id === id);
      if (!c) continue;
      skipped.push({
        caseId: id,
        title: c.title || "(ohne Titel)",
        reason: "Nicht im aktuellen Filter sichtbar",
      });
    }
    if (items.length === 0 && skipped.length === 0) {
      toast.info("Keine Auswahl.");
      return;
    }
    setPubConfirm({ mode: "publish", items, skipped });
  }

  function prepareUnpublish() {
    const items: Array<{ caseId: string; title: string }> = [];
    const skipped: Array<{ caseId: string; title: string; reason: string }> = [];
    for (const r of filteredWithPub) {
      if (!pubSelection.has(r.c.id)) continue;
      const title = r.c.title || "(ohne Titel)";
      if (r.pub.alreadyPublished) items.push({ caseId: r.c.id, title });
      else if (r.pub.hasTree)
        skipped.push({ caseId: r.c.id, title, reason: "Nicht veröffentlicht" });
      else skipped.push({ caseId: r.c.id, title, reason: "Kein Baum" });
    }
    if (items.length === 0) {
      toast.info("Keine veröffentlichten Bäume in der Auswahl.");
      return;
    }
    setPubConfirm({ mode: "unpublish", items, skipped });
  }

  function prepareMarkReview() {
    const items: Array<{ caseId: string; title: string }> = [];
    const skipped: Array<{ caseId: string; title: string; reason: string }> = [];
    for (const r of filteredWithPub) {
      if (!pubSelection.has(r.c.id)) continue;
      const title = r.c.title || "(ohne Titel)";
      if (!r.pub.hasTree) skipped.push({ caseId: r.c.id, title, reason: "Kein Baum" });
      else if (r.pub.isInvalid)
        skipped.push({ caseId: r.c.id, title, reason: "Technisch fehlerhaft" });
      else if (r.pub.alreadyPublished)
        skipped.push({ caseId: r.c.id, title, reason: "Bereits veröffentlicht" });
      else items.push({ caseId: r.c.id, title });
    }
    if (items.length === 0) {
      toast.info("Nichts zu markieren.");
      return;
    }
    setPubConfirm({ mode: "mark_review", items, skipped });
  }

  async function setTreeStatusFor(
    caseId: string,
    newStatus: "review" | "approved",
  ): Promise<PublishRunItem> {
    const c = cases.find((x) => x.id === caseId);
    const title = c?.title || "(ohne Titel)";
    try {
      if (!c) throw new Error("Fall nicht gefunden");
      const parsed = parseCuratedTree(c.decision_tree);
      if (!parsed) throw new Error("Baum konnte nicht gelesen werden");
      if (newStatus === "approved") {
        const report = validateCuratedTree(parsed);
        if (!report.valid)
          throw new Error(
            "Technisch ungültig: " + report.errors.map((e) => e.message).join("; "),
          );
      }
      const meta: Record<string, unknown> = {
        ...(parsed.meta ?? {}),
        status: newStatus,
        updatedAt: new Date().toISOString(),
        version: (parsed.meta?.version ?? 1) + 1,
      };
      if (newStatus === "approved") {
        meta.approvedAt = new Date().toISOString();
      }
      const next = { ...parsed, meta } as CuratedDecisionTree;
      await updateCase(caseId, { decision_tree: next as any } as any);
      return {
        caseId,
        title,
        status: newStatus === "approved" ? "published" : "unpublished",
      };
    } catch (e) {
      return {
        caseId,
        title,
        status: "failed",
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async function executePubConfirm() {
    if (!pubConfirm) return;
    setPubRunning(true);
    const results: PublishRunItem[] = [];
    for (const s of pubConfirm.skipped) {
      results.push({ caseId: s.caseId, title: s.title, status: "skipped", message: s.reason });
    }
    for (const it of pubConfirm.items) {
      if (pubConfirm.mode === "publish") {
        results.push(await setTreeStatusFor(it.caseId, "approved"));
      } else if (pubConfirm.mode === "unpublish") {
        results.push(await setTreeStatusFor(it.caseId, "review"));
      } else if (pubConfirm.mode === "mark_review") {
        results.push(await setTreeStatusFor(it.caseId, "review"));
      }
    }
    setPubResults(results);
    setPubConfirm(null);
    setPubRunning(false);
    invalidatePracticeCaseQueries(qc);
    await casesQ.refetch();
    const ok = results.filter(
      (r) => r.status === "published" || r.status === "unpublished",
    ).length;
    const failed = results.filter((r) => r.status === "failed").length;
    if (failed > 0) toast.error(`${ok} erfolgreich · ${failed} fehlgeschlagen`);
    else toast.success(`${ok} erfolgreich`);
  }



  /* ------- run --------------------------------------------------------- */

  async function generateOne(row: CaseRow): Promise<RunItem> {
    const base: RunItem = {
      caseId: row.id,
      status: "generating",
      hints: [],
      steps: 0,
      results: 0,
      depth: 0,
    };
    setItems((prev) => ({ ...prev, [row.id]: base }));

    try {
      const legalBasis = await loadLegalBasisFor(row.id);
      const caseRow = {
        title: row.title,
        category: row.category,
        subcategory: row.subcategory,
        short_description: row.short_description,
        short_answer: row.short_answer ?? row.immediate_actions,
        immediate_actions: row.immediate_actions,
        recommendation: row.recommendation,
        responsibilities: row.responsibilities,
        practice_tip: row.practice_tip ?? "",
        common_mistakes: row.common_mistakes,
        checklist: row.checklist,
        documentation: row.documentation,
        legal_explanation: row.legal_explanation ?? "",
        faq: row.faq,
      };
      const res = await fetch("/api/ai-draft-decision-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseRow,
          extraContext: { legalBasis, knowledge: [] },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`AI-Gateway ${res.status}: ${t.slice(0, 200)}`);
      }
      const { tree: raw } = (await res.json()) as { tree: unknown };
      const parsed = parseCuratedTree(raw);
      if (!parsed) {
        const item: RunItem = {
          ...base,
          status: "rejected_invalid",
          quality: "red",
          message: "Antwort konnte nicht als Entscheidungsbaum gelesen werden.",
        };
        setItems((prev) => ({ ...prev, [row.id]: item }));
        return item;
      }
      const report = validateCuratedTree(parsed);
      const stepsCount = Object.keys(parsed.steps).length;
      const resultsCount = Object.keys(parsed.results).length;
      const depth = maxDepth(parsed);

      if (!report.valid) {
        const item: RunItem = {
          ...base,
          status: "rejected_invalid",
          quality: "red",
          message: report.errors.map((e) => e.message).join("; "),
          steps: stepsCount,
          results: resultsCount,
          depth,
        };
        setItems((prev) => ({ ...prev, [row.id]: item }));
        return item;
      }

      const hints = collectQualityHints(
        parsed,
        report.warnings.map((w) => w.message),
      );
      const quality = assessQuality(parsed, 0, hints);

      // Save as draft with source tag.
      const payload: CuratedDecisionTree = {
        ...parsed,
        meta: {
          status: "draft",
          version: 1,
          updatedAt: new Date().toISOString(),
          ...(parsed.meta ?? {}),
          // force draft/source regardless of what model returned
        },
      };
      (payload.meta as any).status = "draft";
      (payload.meta as any).source = "ai_batch";
      (payload.meta as any).generatedAt = new Date().toISOString();
      (payload.meta as any).model = "anthropic/claude-haiku-4-5";

      await updateCase(row.id, { decision_tree: payload as any } as any);

      const item: RunItem = {
        caseId: row.id,
        status: hints.length > 0 ? "generated_with_warnings" : "generated",
        quality,
        hints,
        steps: stepsCount,
        results: resultsCount,
        depth,
      };
      setItems((prev) => ({ ...prev, [row.id]: item }));
      return item;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const item: RunItem = {
        ...base,
        status: "error",
        quality: "red",
        message: msg,
      };
      setItems((prev) => ({ ...prev, [row.id]: item }));
      return item;
    }
  }

  async function startRun() {
    if (running) return;
    const selected = selectedSuitable;
    if (selected.length === 0) {
      toast.error("Keine geeigneten Fälle in der Auswahl.");
      return;
    }
    setRunning(true);
    setCancelFlag(false);
    setProgress({ done: 0, total: selected.length });
    const initial: Record<string, RunItem> = {};
    for (const r of selected) {
      initial[r.c.id] = {
        caseId: r.c.id,
        status: "queued",
        hints: [],
        steps: 0,
        results: 0,
        depth: 0,
      };
    }
    setItems((prev) => ({ ...prev, ...initial }));

    // Sequential with small pauses to be gentle on the gateway.
    for (let i = 0; i < selected.length; i++) {
      if (cancelFlag) break;
      await generateOne(selected[i].c);
      setProgress({ done: i + 1, total: selected.length });
      await new Promise((r) => setTimeout(r, 250));
    }
    setRunning(false);
    invalidatePracticeCaseQueries(qc);
    await casesQ.refetch();
    toast.success("Batch abgeschlossen.");
  }

  /* ------- item actions ------------------------------------------------ */

  async function markReview(caseId: string) {
    const c = cases.find((x) => x.id === caseId);
    if (!c) return;
    const parsed = parseCuratedTree(c.decision_tree);
    if (!parsed) return;
    const next: CuratedDecisionTree = {
      ...parsed,
      meta: {
        ...(parsed.meta ?? {}),
        status: "review",
        updatedAt: new Date().toISOString(),
        version: (parsed.meta?.version ?? 1) + 1,
      },
    };
    await updateCase(caseId, { decision_tree: next as any } as any);
    invalidatePracticeCaseQueries(qc);
    await casesQ.refetch();
    toast.success("Zur Prüfung markiert");
  }

  async function discard(caseId: string) {
    if (!confirm("Diesen KI-Entwurf verwerfen und Baum entfernen?")) return;
    await updateCase(caseId, { decision_tree: null as any } as any);
    setItems((prev) => {
      const next = { ...prev };
      delete next[caseId];
      return next;
    });
    invalidatePracticeCaseQueries(qc);
    await casesQ.refetch();
    toast.success("Entwurf verworfen");
  }

  async function regenerate(caseId: string) {
    const c = cases.find((x) => x.id === caseId);
    if (!c) return;
    await generateOne(c);
    invalidatePracticeCaseQueries(qc);
    await casesQ.refetch();
  }

  async function markAllGreenReview() {
    const greens = Object.values(items).filter(
      (i) =>
        (i.status === "generated" || i.status === "generated_with_warnings") &&
        i.quality === "green",
    );
    if (greens.length === 0) return toast.info("Keine grünen Ergebnisse.");
    if (!confirm(`${greens.length} Bäume auf „Prüfung erforderlich" setzen?`)) return;
    for (const g of greens) await markReview(g.caseId);
  }

  /* ------- rendering --------------------------------------------------- */

  const statusChip = (row: { c: CaseRow; treeStatus: TreeStatus }) => {
    const map: Record<TreeStatus, string> = {
      none: "bg-muted text-muted-foreground",
      draft: "bg-sky-500/10 text-sky-700",
      review: "bg-amber-500/10 text-amber-700",
      approved: "bg-emerald-500/10 text-emerald-700",
      invalid: "bg-rose-500/15 text-rose-700",
    };
    const label: Record<TreeStatus, string> = {
      none: "kein Baum",
      draft: "Entwurf",
      review: "Prüfung",
      approved: "Freigegeben",
      invalid: "fehlerhaft",
    };
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
          map[row.treeStatus],
        )}
      >
        {label[row.treeStatus]}
      </span>
    );
  };

  const runItemsList = Object.values(items);

  const summary = {
    selected: selectedSuitable.length,
    done: runItemsList.filter(
      (i) => i.status === "generated" || i.status === "generated_with_warnings",
    ).length,
    green: runItemsList.filter((i) => i.quality === "green").length,
    yellow: runItemsList.filter((i) => i.quality === "yellow").length,
    red: runItemsList.filter((i) => i.quality === "red").length,
    errors: runItemsList.filter((i) => i.status === "error").length,
    invalid: runItemsList.filter((i) => i.status === "rejected_invalid").length,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            KI-Entwurfsmaschine
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Entscheidungsassistenten – KI-Batch
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Erzeugt fallspezifische Entscheidungsbaum-Entwürfe für mehrere Praxisfälle. Alle
            Ergebnisse werden als <strong>Entwurf</strong> gespeichert und müssen redaktionell
            geprüft werden. Freigegebene Bäume werden nicht überschrieben.
          </p>
        </div>
      </header>

      {/* Filter */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Fallauswahl</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Kategorie</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">Alle</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Fall-Status</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Alle</option>
              <option value="draft">Entwurf</option>
              <option value="published">Veröffentlicht</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Baum-Status</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={filterTree}
              onChange={(e) => setFilterTree(e.target.value as any)}
            >
              <option value="">Alle</option>
              <option value="none">kein Baum</option>
              <option value="draft">Entwurf</option>
              <option value="review">Prüfung</option>
              <option value="approved">Freigegeben</option>
              <option value="invalid">Fehlerhaft</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Überschreib-Modus</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={overwrite}
              onChange={(e) => setOverwrite(e.target.value as OverwriteMode)}
            >
              <option value="none">nur Fälle ohne Baum</option>
              <option value="drafts">bestehende Entwürfe ersetzen</option>
              <option value="all_non_approved">alle außer freigegeben ersetzen</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={onlyPublished}
              onChange={(e) => setOnlyPublished(e.target.checked)}
            />
            Nur veröffentlichte Fälle
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="count" className="text-xs">
              Anzahl
            </Label>
            <Input
              id="count"
              type="number"
              className="w-20"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(Math.max(1, parseInt(e.target.value || "1", 10)))}
            />
            <Button size="sm" variant="outline" onClick={selectFirstN}>
              erste {count} geeignete wählen
            </Button>
            <Button size="sm" variant="outline" onClick={selectAllSuitable}>
              alle geeigneten ({suitable.length})
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              zurücksetzen
            </Button>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          {filtered.length} Fälle im Filter · {suitable.length} geeignet · {selection.size} ausgewählt (
          {selectedSuitable.length} davon geeignet)
        </div>
      </section>

      {/* Start */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={startRun} disabled={running || selectedSuitable.length === 0}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running
              ? `Läuft… ${progress.done}/${progress.total}`
              : `KI-Entwürfe erzeugen (${selectedSuitable.length})`}
          </Button>
          {running && (
            <Button variant="outline" onClick={() => setCancelFlag(true)}>
              <StopCircle className="h-4 w-4" />
              Nach aktuellem Fall stoppen
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
              grün {summary.green}
            </span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700">
              gelb {summary.yellow}
            </span>
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-700">
              rot {summary.red + summary.errors + summary.invalid}
            </span>
          </div>
        </div>
        {runItemsList.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={markAllGreenReview}>
              <Flag className="h-4 w-4" />
              Alle grünen zur Prüfung markieren
            </Button>
          </div>
        )}
      </section>

      {/* Publish batch */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold">Sammelaktionen für Entscheidungsbäume</h2>
            <p className="text-xs text-muted-foreground">
              Auswahl unabhängig von der KI-Generierung. Nur technisch valide Bäume mit Status
              <span className="mx-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-700">
                Prüfung
              </span>
              können gesammelt veröffentlicht werden.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={selectAllVisiblePub}>
              Alle sichtbaren auswählen ({visibleIds.length})
            </Button>
            <Button size="sm" variant="outline" onClick={selectAllPublishable}>
              Alle veröffentlichungsfähigen ({publishableRows.length})
            </Button>
            <Button size="sm" variant="ghost" onClick={clearVisiblePub}>
              nur sichtbare Auswahl aufheben
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAllPub}>
              gesamte Auswahl aufheben
            </Button>
          </div>
        </div>
        {pubSelection.size > 0 && (
          <>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-muted px-2 py-0.5">
                {pubSummary.total} ausgewählt · {pubSummary.visible} sichtbar
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
                {pubSummary.publishable} veröffentlichungsfähig
              </span>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700">
                {pubSummary.drafts} Entwürfe
              </span>
              <span className="rounded-full bg-slate-500/10 px-2 py-0.5">
                {pubSummary.alreadyPublished} bereits veröffentlicht
              </span>
              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-700">
                {pubSummary.invalid} fehlerhaft
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={prepareMarkReview}>
                <Flag className="h-4 w-4" />
                Zur Prüfung markieren
              </Button>
              <Button
                size="sm"
                onClick={preparePublish}
                disabled={pubSummary.publishable === 0}
              >
                <CheckCircle2 className="h-4 w-4" />
                Ausgewählte veröffentlichen ({pubSummary.publishable})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={prepareUnpublish}
                disabled={pubSummary.alreadyPublished === 0}
              >
                <StopCircle className="h-4 w-4" />
                Veröffentlichung aufheben ({pubSummary.alreadyPublished})
              </Button>
            </div>
          </>
        )}
        {pubResults.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div className="mb-1 font-semibold">Letzter Sammellauf</div>
            <div className="flex flex-wrap gap-3">
              <span className="text-emerald-700">
                erfolgreich {pubResults.filter((r) => r.status === "published" || r.status === "unpublished").length}
              </span>
              <span className="text-muted-foreground">
                übersprungen {pubResults.filter((r) => r.status === "skipped").length}
              </span>
              <span className="text-rose-700">
                fehlgeschlagen {pubResults.filter((r) => r.status === "failed").length}
              </span>
              <button
                className="ml-auto text-muted-foreground underline"
                onClick={() => setPubResults([])}
              >
                schließen
              </button>
            </div>
            {pubResults.some((r) => r.status === "failed" || r.status === "skipped") && (
              <ul className="mt-2 space-y-0.5">
                {pubResults
                  .filter((r) => r.status === "failed" || r.status === "skipped")
                  .map((r) => (
                    <li key={r.caseId + r.status} className="truncate">
                      <span
                        className={cn(
                          "mr-2 rounded px-1.5 py-0.5",
                          r.status === "failed"
                            ? "bg-rose-500/15 text-rose-700"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.status === "failed" ? "Fehler" : "übersprungen"}
                      </span>
                      <span className="font-medium">{r.title}</span>
                      {r.message ? (
                        <span className="text-muted-foreground"> — {r.message}</span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Cases list */}

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-3 text-sm font-semibold">
          Fälle im Filter ({filtered.length})
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-8 p-2" title="Auswahl für KI-Generierung"></th>
                <th className="w-8 p-2">
                  <input
                    type="checkbox"
                    aria-label="Alle sichtbaren Bäume auswählen"
                    title="Alle sichtbaren Bäume auswählen"
                    checked={visibleAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = visibleSomeSelected;
                    }}
                    onChange={() =>
                      visibleAllSelected ? clearVisiblePub() : selectAllVisiblePub()
                    }
                  />
                </th>
                <th className="p-2 text-left">Titel</th>
                <th className="p-2 text-left">Kategorie</th>
                <th className="p-2 text-left">Baum</th>
                <th className="p-2 text-left">Eignung</th>
                <th className="p-2 text-left">Ergebnis</th>
                <th className="p-2 text-left">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const item = items[row.c.id];
                const disabled = !row.suit.ok;
                const pub = assessPublish(row.treeStatus);
                return (
                  <tr key={row.c.id} className="border-t border-border">
                    <td className="p-2 text-center align-top">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={selection.has(row.c.id)}
                        onChange={() => toggleOne(row.c.id)}
                        title="Für KI-Generierung auswählen"
                      />
                    </td>
                    <td className="p-2 text-center align-top">
                      <input
                        type="checkbox"
                        checked={pubSelection.has(row.c.id)}
                        onChange={() => togglePubOne(row.c.id)}
                        disabled={!pub.hasTree}
                        title={
                          pub.hasTree
                            ? `Baum auswählen (${pub.reasonLabel})`
                            : "Kein Baum vorhanden"
                        }
                      />
                    </td>
                    <td className="p-2 align-top">
                      <div className="font-medium">{row.c.title || "(ohne Titel)"}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.c.subcategory ?? ""}
                      </div>
                    </td>
                    <td className="p-2 align-top text-xs">{row.c.category ?? "—"}</td>
                    <td className="p-2 align-top">
                      <div className="flex flex-col gap-1">
                        {statusChip(row)}
                        {pub.hasTree && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]",
                              pub.publishable
                                ? "bg-emerald-500/10 text-emerald-700"
                                : "bg-muted text-muted-foreground",
                            )}
                            title={pub.reasonLabel}
                          >
                            {pub.publishable ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <SkipForward className="h-3 w-3" />
                            )}
                            {pub.publishable ? "veröffentlichbar" : pub.reasonLabel}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 align-top text-xs">
                      {row.suit.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          geeignet
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <SkipForward className="h-3.5 w-3.5" />
                          {REASON_LABEL[row.suit.reason]}
                        </span>
                      )}
                    </td>
                    <td className="p-2 align-top text-xs">
                      {item ? <RunStatusBadge item={item} /> : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="p-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        <Link
                          to="/admin/faelle/$id"
                          params={{ id: row.c.id }}
                          className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Editor
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const parsed = parseCuratedTree(row.c.decision_tree);
                            if (!parsed) {
                              toast.error(
                                "Dieser Entscheidungsbaum kann derzeit nicht in der Vorschau angezeigt werden.",
                              );
                              return;
                            }
                            setPreviewCaseId(row.c.id);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50"
                          disabled={!row.c.decision_tree}
                          title={
                            row.c.decision_tree
                              ? "Entscheidungsbaum-Vorschau öffnen"
                              : "Kein Entscheidungsbaum vorhanden"
                          }
                        >
                          <Eye className="h-3 w-3" />
                          Vorschau
                        </button>
                        {item &&
                          (item.status === "generated" ||
                            item.status === "generated_with_warnings") && (
                            <>
                              <button
                                className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-500/20"
                                onClick={() => markReview(row.c.id)}
                              >
                                <Flag className="h-3 w-3" />
                                Prüfung
                              </button>
                              <button
                                className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted"
                                onClick={() => regenerate(row.c.id)}
                                disabled={running}
                              >
                                <RefreshCw className="h-3 w-3" />
                                neu
                              </button>
                              <button
                                className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-500/20"
                                onClick={() => discard(row.c.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                                verwerfen
                              </button>
                            </>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">
                    Keine Fälle im aktuellen Filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Hinweis: Die KI arbeitet ausschließlich mit den kuratierten Fallinformationen. Es wird
        keine Internetrecherche durchgeführt, keine automatische Freigabe vorgenommen und
        freigegebene Bäume werden nicht überschrieben.
      </p>

      <PreviewDialog
        caseId={previewCaseId}
        rows={filtered.map((r) => r.c)}
        onClose={() => setPreviewCaseId(null)}
      />

      {pubConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <div className="border-b border-border p-4">
              <h3 className="text-base font-semibold">
                {pubConfirm.mode === "publish"
                  ? `${pubConfirm.items.length} Entscheidungsbäume veröffentlichen?`
                  : pubConfirm.mode === "unpublish"
                    ? `Veröffentlichung von ${pubConfirm.items.length} Bäumen aufheben?`
                    : `${pubConfirm.items.length} Bäume zur Prüfung markieren?`}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {pubConfirm.mode === "publish"
                  ? "Freigegebene Bäume werden im Lehrer-Frontend sichtbar."
                  : pubConfirm.mode === "unpublish"
                    ? "Danach sind die ausgewählten Bäume im Lehrer-Frontend nicht mehr sichtbar. Die Baumdaten bleiben erhalten (Status zurück auf „Prüfung“)."
                    : "Status wechselt auf „Prüfung erforderlich“ – Voraussetzung für Sammelveröffentlichung."}
              </p>
            </div>
            <div className="max-h-72 space-y-3 overflow-auto p-4 text-xs">
              {pubConfirm.items.length > 0 && (
                <div>
                  <div className="mb-1 font-semibold text-emerald-700">
                    {pubConfirm.mode === "publish"
                      ? `${pubConfirm.items.length} werden veröffentlicht`
                      : pubConfirm.mode === "unpublish"
                        ? `${pubConfirm.items.length} werden zurückgestuft`
                        : `${pubConfirm.items.length} werden markiert`}
                  </div>
                  <ul className="space-y-0.5">
                    {pubConfirm.items.slice(0, 20).map((it) => (
                      <li key={it.caseId} className="truncate">
                        · {it.title}
                      </li>
                    ))}
                    {pubConfirm.items.length > 20 && (
                      <li className="text-muted-foreground">
                        … und {pubConfirm.items.length - 20} weitere
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {pubConfirm.skipped.length > 0 && (
                <div>
                  <div className="mb-1 font-semibold text-muted-foreground">
                    {pubConfirm.skipped.length} werden übersprungen
                  </div>
                  <ul className="space-y-0.5">
                    {pubConfirm.skipped.slice(0, 20).map((it) => (
                      <li key={it.caseId} className="truncate">
                        · {it.title}
                        <span className="text-muted-foreground"> — {it.reason}</span>
                      </li>
                    ))}
                    {pubConfirm.skipped.length > 20 && (
                      <li className="text-muted-foreground">
                        … und {pubConfirm.skipped.length - 20} weitere
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border p-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={pubRunning}
                onClick={() => setPubConfirm(null)}
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                disabled={pubRunning || pubConfirm.items.length === 0}
                onClick={executePubConfirm}
              >
                {pubRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : pubConfirm.mode === "publish" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : pubConfirm.mode === "unpublish" ? (
                  <StopCircle className="h-4 w-4" />
                ) : (
                  <Flag className="h-4 w-4" />
                )}
                Bestätigen ({pubConfirm.items.length})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewDialog({
  caseId,
  rows,
  onClose,
}: {
  caseId: string | null;
  rows: CaseRow[];
  onClose: () => void;
}) {
  const row = caseId ? rows.find((r) => r.id === caseId) ?? null : null;
  const tree = useMemo(
    () => (row ? parseCuratedTree(row.decision_tree) : null),
    [row],
  );
  if (!row || !tree) return null;
  const caseData = {
    id: row.id,
    title: row.title || "",
    category: row.category ?? "",
    subcategory: row.subcategory ?? "",
    shortDescription: row.short_description ?? "",
    shortAnswer: row.short_answer ?? "",
    ampel: "gelb" as const,
    ampelLabel: "",
    legalExplanation: row.legal_explanation ?? "",
    recommendation: row.recommendation ?? "",
    checklist: row.checklist ?? [],
    documentation: row.documentation ?? [],
    responsibleParty: row.responsibilities ?? "",
    legalBasis: [],
    risks: [],
    applicableTemplates: [],
    searchTerms: [],
    tags: [],
    relatedCases: [],
    decisionTreeRaw: row.decision_tree,
  };
  return (
    <DecisionAssistant
      c={caseData}
      open={!!caseId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      overrideTree={tree}
    />
  );
}

function RunStatusBadge({ item }: { item: RunItem }) {
  const map: Record<RunStatus, { cls: string; label: string; icon: React.ReactNode }> = {
    queued: {
      cls: "bg-muted text-muted-foreground",
      label: "wartet",
      icon: <Loader2 className="h-3 w-3" />,
    },
    generating: {
      cls: "bg-sky-500/10 text-sky-700",
      label: "erzeuge…",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    generated: {
      cls: "bg-emerald-500/10 text-emerald-700",
      label: `OK · ${item.steps}F/${item.results}E · Tiefe ${item.depth}`,
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    generated_with_warnings: {
      cls: "bg-amber-500/10 text-amber-700",
      label: `${item.hints.length} Hinweise · ${item.steps}F/${item.results}E`,
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    rejected_invalid: {
      cls: "bg-rose-500/15 text-rose-700",
      label: "ungültig",
      icon: <XCircle className="h-3 w-3" />,
    },
    skipped: {
      cls: "bg-muted text-muted-foreground",
      label: "übersprungen",
      icon: <SkipForward className="h-3 w-3" />,
    },
    error: {
      cls: "bg-rose-500/15 text-rose-700",
      label: "Fehler",
      icon: <XCircle className="h-3 w-3" />,
    },
  };
  const cfg = map[item.status];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]", cfg.cls)}
      title={item.message || item.hints.join("\n")}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
