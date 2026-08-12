import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  Flag,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  type CuratedDecisionTree,
  type CuratedResult,
  type CuratedStep,
  type CuratedTreeColor,
  type CuratedTreeStatus,
  deriveTreeStatus,
  emptyCuratedTree,
  nextResultId,
  nextStepId,
  parseCuratedTree,
  resultReferences,
  stepReferences,
  validateCuratedTree,
} from "@/lib/decisionTree";
import { DecisionAssistant } from "@/components/DecisionAssistant";
import type { CaseData } from "@/data/cases";
import { updateCase } from "@/lib/coreBuilder";
import { cn } from "@/lib/utils";

interface Props {
  caseId: string;
  caseData: CaseData;
  decisionTreeRaw: unknown;
  onSaved?: (raw: unknown) => void;
}

const STATUS_META: Record<
  ReturnType<typeof deriveTreeStatus>,
  { label: string; cls: string }
> = {
  none: { label: "Kein Entscheidungsbaum", cls: "bg-muted text-muted-foreground border-border" },
  draft: { label: "Entwurf", cls: "bg-sky-500/10 text-sky-700 border-sky-500/40" },
  review: {
    label: "Prüfung erforderlich",
    cls: "bg-amber-500/10 text-amber-700 border-amber-500/40",
  },
  approved: {
    label: "Freigegeben",
    cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40",
  },
  invalid: { label: "Fehlerhaft", cls: "bg-rose-500/15 text-rose-700 border-rose-500/40" },
};

function cloneTree(t: CuratedDecisionTree): CuratedDecisionTree {
  return JSON.parse(JSON.stringify(t)) as CuratedDecisionTree;
}

/** Ergebnisse in Reihenfolge ihrer ersten Verwendung (BFS ab Startknoten). */
function computeResultOrder(tree: CuratedDecisionTree): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = tree.steps[tree.start] ? [tree.start] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const step = tree.steps[id];
    if (!step) continue;
    for (const opt of step.options) {
      if (opt.result && !seen.has(opt.result) && tree.results[opt.result]) {
        seen.add(opt.result);
        order.push(opt.result);
      }
      if (opt.next && !visited.has(opt.next)) queue.push(opt.next);
    }
  }
  for (const rid of Object.keys(tree.results)) if (!seen.has(rid)) order.push(rid);
  return order;
}

function resultLabel(tree: CuratedDecisionTree, id: string, order: string[]): string {
  const r = tree.results[id];
  if (!r) return "unbekannt";
  const idx = order.indexOf(id);
  const num = idx >= 0 ? idx + 1 : Object.keys(tree.results).indexOf(id) + 1;
  const title = r.title.trim() || r.recommendation.trim().slice(0, 60) || "(ohne Titel)";
  return `#${num} · ${title}`;
}

function stepLabel(tree: CuratedDecisionTree, id: string): string {
  const s = tree.steps[id];
  if (!s) return "unbekannt";
  return s.question.trim() || "(Frage ohne Text)";
}

export function DecisionTreeAdminEditor({ caseId, caseData, decisionTreeRaw, onSaved }: Props) {
  const initial = useMemo(() => parseCuratedTree(decisionTreeRaw), [decisionTreeRaw]);

  const [tree, setTree] = useState<CuratedDecisionTree | null>(initial);
  const [expanded, setExpanded] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "step" | "result"; id: string; refs: Array<{ stepId: string; optionIndex: number }> }
    | null
  >(null);

  // UX-Zustand: welcher Knoten ist aufgeklappt, welcher wurde gerade erzeugt (Autofokus).
  const [activeId, setActiveId] = useState<string | null>(initial?.start ?? null);
  const [autoFocusToken, setAutoFocusToken] = useState<string | null>(null);
  const [previewOpenAt, setPreviewOpenAt] = useState<string | null>(null); // step-id zum Testen

  // KI-Entwurf
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState<CuratedDecisionTree | null>(null);
  const [aiHints, setAiHints] = useState<string[]>([]);


  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setTree(initial);
    setActiveId(initial?.start ?? null);
  }, [initial]);

  const report = useMemo(() => (tree ? validateCuratedTree(tree) : null), [tree]);
  const status = useMemo(() => {
    if (!tree) return "none" as const;
    return deriveTreeStatus({ ...tree, meta: { ...(tree.meta ?? {}) } });
  }, [tree]);
  const statusMeta = STATUS_META[status];

  const resultOrder = useMemo(() => (tree ? computeResultOrder(tree) : []), [tree]);
  const orderedResultIds = resultOrder;

  const canApprove =
    !!tree &&
    !!report &&
    report.errors.length === 0 &&
    Object.keys(tree.results).length >= 2 &&
    Object.values(tree.results).every((r) => r.recommendation.trim().length > 0);

  const qualityWarnings: string[] = useMemo(() => {
    const w: string[] = [];
    if (!tree) return w;
    const q = new Set<string>();
    for (const s of Object.values(tree.steps)) {
      const key = s.question.trim().toLowerCase();
      if (!key) continue;
      if (q.has(key)) w.push(`Frage möglicherweise doppelt: „${s.question}"`);
      q.add(key);
      if (s.question.trim().length > 0 && s.question.trim().length < 25) {
        w.push(`Frage möglicherweise zu allgemein: „${s.question}"`);
      }
    }
    const r = new Set<string>();
    for (const res of Object.values(tree.results)) {
      const key = (res.title + "|" + res.recommendation).trim().toLowerCase();
      if (r.has(key) && key.length > 0) w.push(`Ergebnisse möglicherweise identisch: „${res.title}"`);
      r.add(key);
    }
    return w;
  }, [tree]);

  // ---- Save --------------------------------------------------------------
  const persist = async (raw: CuratedDecisionTree | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = raw
        ? {
            ...raw,
            meta: {
              ...(raw.meta ?? {}),
              updatedAt: new Date().toISOString(),
              version: (raw.meta?.version ?? 0) + 1,
            },
          }
        : null;
      await updateCase(caseId, { decision_tree: payload as any } as any);
      setSavedAt(new Date());
      onSaved?.(payload);
      if (payload) setTree(payload);
      toast.success("Entscheidungsbaum gespeichert");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(msg);
      toast.error("Speichern fehlgeschlagen: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!tree) return;
    const next = cloneTree(tree);
    next.meta = { ...(next.meta ?? {}), status: "draft" };
    await persist(next);
  };
  const saveReview = async () => {
    if (!tree) return;
    const next = cloneTree(tree);
    next.meta = { ...(next.meta ?? {}), status: "review" };
    await persist(next);
  };
  const approve = async () => {
    if (!tree || !canApprove) return;
    const next = cloneTree(tree);
    next.meta = { ...(next.meta ?? {}), status: "approved" };
    await persist(next);
  };
  const revoke = async () => {
    if (!tree) return;
    if (!confirm("Freigabe aufheben? Der Assistent verschwindet damit sofort aus dem Lehrer-Frontend.")) return;
    const next = cloneTree(tree);
    next.meta = { ...(next.meta ?? {}), status: "draft" };
    await persist(next);
  };

  const createFresh = () => {
    const t = emptyCuratedTree();
    setTree(t);
    setActiveId(t.start);
    setAutoFocusToken(t.start);
  };
  const removeTree = async () => {
    if (!confirm("Entscheidungsbaum vollständig entfernen?")) return;
    setTree(null);
    setActiveId(null);
    await persist(null);
  };

  // ---- Mutators ----------------------------------------------------------
  const update = (fn: (t: CuratedDecisionTree) => CuratedDecisionTree) => {
    setTree((prev) => (prev ? fn(cloneTree(prev)) : prev));
  };

  const setStart = (id: string) => update((t) => ({ ...t, start: id }));

  const duplicateStep = (id: string) =>
    update((t) => {
      const src = t.steps[id];
      if (!src) return t;
      const newId = nextStepId(t);
      t.steps[newId] = JSON.parse(JSON.stringify(src)) as CuratedStep;
      return t;
    });

  const deleteStep = (id: string) => {
    if (!tree) return;
    const refs = stepReferences(tree, id);
    if (refs.length > 0) {
      setConfirmDelete({ kind: "step", id, refs });
      return;
    }
    update((t) => {
      delete t.steps[id];
      if (t.start === id) t.start = Object.keys(t.steps)[0] ?? "";
      return t;
    });
    if (activeId === id) setActiveId(tree.start);
  };

  const patchStep = (id: string, patch: Partial<CuratedStep>) =>
    update((t) => {
      t.steps[id] = { ...t.steps[id], ...patch };
      return t;
    });

  const patchOption = (
    stepId: string,
    idx: number,
    patch: { label?: string; next?: string | null; result?: string | null },
  ) =>
    update((t) => {
      const opts = t.steps[stepId].options.slice();
      const cur = { ...opts[idx] };
      if (patch.label !== undefined) cur.label = patch.label;
      if (patch.next !== undefined) {
        cur.next = patch.next === null || patch.next === "" ? undefined : patch.next;
        if (cur.next) cur.result = undefined;
      }
      if (patch.result !== undefined) {
        cur.result = patch.result === null || patch.result === "" ? undefined : patch.result;
        if (cur.result) cur.next = undefined;
      }
      opts[idx] = cur;
      t.steps[stepId] = { ...t.steps[stepId], options: opts };
      return t;
    });

  const addOption = (stepId: string) =>
    update((t) => {
      const opts = t.steps[stepId].options.slice();
      opts.push({ label: `Antwort ${String.fromCharCode(65 + opts.length)}` });
      t.steps[stepId] = { ...t.steps[stepId], options: opts };
      return t;
    });

  const removeOption = (stepId: string, idx: number) =>
    update((t) => {
      const opts = t.steps[stepId].options.slice();
      opts.splice(idx, 1);
      t.steps[stepId] = { ...t.steps[stepId], options: opts };
      return t;
    });

  const duplicateResult = (id: string) =>
    update((t) => {
      const src = t.results[id];
      if (!src) return t;
      const newId = nextResultId(t);
      t.results[newId] = JSON.parse(JSON.stringify(src)) as CuratedResult;
      return t;
    });

  const deleteResult = (id: string) => {
    if (!tree) return;
    const refs = resultReferences(tree, id);
    if (refs.length > 0) {
      setConfirmDelete({ kind: "result", id, refs });
      return;
    }
    update((t) => {
      delete t.results[id];
      return t;
    });
    if (activeId === id) setActiveId(tree.start);
  };

  const patchResult = (id: string, patch: Partial<CuratedResult>) =>
    update((t) => {
      t.results[id] = { ...t.results[id], ...patch };
      return t;
    });

  // --- Kombinierte Aktionen für die Inline-Buttons ------------------------

  /** Neue Folgefrage anlegen und direkt mit sourceStep/opt verbinden. */
  const addLinkedStep = (sourceStepId: string, optIdx: number) => {
    if (!tree) return;
    const work = cloneTree(tree);
    const newId = nextStepId(work);
    work.steps[newId] = {
      question: "",
      options: [{ label: "Antwort A" }, { label: "Antwort B" }],
    };
    const opts = work.steps[sourceStepId].options.slice();
    opts[optIdx] = { ...opts[optIdx], next: newId, result: undefined };
    work.steps[sourceStepId] = { ...work.steps[sourceStepId], options: opts };
    if (Object.keys(work.steps).length === 1) work.start = newId;
    setTree(work);
    setActiveId(newId);
    setAutoFocusToken(newId);
  };

  /** Neues Ergebnis anlegen und direkt mit sourceStep/opt verbinden. */
  const addLinkedResult = (sourceStepId: string, optIdx: number) => {
    if (!tree) return;
    const work = cloneTree(tree);
    const newId = nextResultId(work);
    work.results[newId] = {
      title: "",
      color: "gelb" as CuratedTreeColor,
      urgency: "",
      recommendation: "",
      responsible: "",
      documentation: "",
      warning: "",
      steps: [],
    };
    const opts = work.steps[sourceStepId].options.slice();
    opts[optIdx] = { ...opts[optIdx], result: newId, next: undefined };
    work.steps[sourceStepId] = { ...work.steps[sourceStepId], options: opts };
    setTree(work);
    setActiveId(newId);
    setAutoFocusToken(newId);
  };

  /** Freistehende Frage anlegen (ohne Verknüpfung), z. B. wenn noch keine existiert. */
  const addStandaloneStep = () => {
    if (!tree) return;
    const work = cloneTree(tree);
    const newId = nextStepId(work);
    work.steps[newId] = {
      question: "",
      options: [{ label: "Antwort A" }, { label: "Antwort B" }],
    };
    if (Object.keys(work.steps).length === 1 || !work.steps[work.start]) work.start = newId;
    setTree(work);
    setActiveId(newId);
    setAutoFocusToken(newId);
  };

  const addStandaloneResult = () => {
    if (!tree) return;
    const work = cloneTree(tree);
    const newId = nextResultId(work);
    work.results[newId] = {
      title: "",
      color: "gelb" as CuratedTreeColor,
      urgency: "",
      recommendation: "",
      responsible: "",
      documentation: "",
      warning: "",
      steps: [],
    };
    setTree(work);
    setActiveId(newId);
    setAutoFocusToken(newId);
  };

  // ---- KI-Entwurf --------------------------------------------------------
  const generateAiDraft = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiDraft(null);
    setAiHints([]);
    try {
      const caseRow = {
        title: caseData.title,
        category: caseData.category,
        subcategory: caseData.subcategory,
        short_description: caseData.shortDescription,
        short_answer: caseData.shortAnswer,
        immediate_actions: caseData.shortAnswer,
        recommendation: caseData.recommendation,
        responsibilities: caseData.responsibleParty,
        practice_tip: caseData.practiceTip ?? "",
        common_mistakes: caseData.risks,
        checklist: caseData.checklist,
        documentation: caseData.documentation,
        legal_explanation: caseData.legalExplanation ?? "",
      };
      const res = await fetch("/api/ai-draft-decision-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseRow,
          extraContext: {
            legalBasis: caseData.legalBasis,
            knowledge: [],
          },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`KI-Entwurf fehlgeschlagen (${res.status}): ${t.slice(0, 200)}`);
      }
      const { tree: raw } = (await res.json()) as { tree: unknown };
      const parsed = parseCuratedTree(raw);
      if (!parsed) throw new Error("KI-Ausgabe konnte nicht als Entscheidungsbaum gelesen werden.");
      parsed.meta = { ...(parsed.meta ?? {}), status: "draft", version: 1 };
      const rep = validateCuratedTree(parsed);
      if (!rep.valid) {
        setAiError(
          "Der KI-Entwurf ist strukturell ungültig und kann nicht übernommen werden:\n" +
            rep.errors.map((e) => "• " + e.message).join("\n"),
        );
        return;
      }
      // Qualitätshinweise (nicht blockierend)
      const hints: string[] = rep.warnings.map((w) => w.message);
      const seenQ = new Set<string>();
      for (const s of Object.values(parsed.steps)) {
        const q = s.question.trim().toLowerCase();
        if (q.length < 25) hints.push(`Frage möglicherweise zu allgemein: „${s.question}"`);
        if (seenQ.has(q) && q) hints.push(`Frage doppelt: „${s.question}"`);
        seenQ.add(q);
        if (/wurde dokumentiert|handlungsbedarf|ist die situation wichtig|benötigen sie hilfe|möchten sie fortfahren/i.test(s.question)) {
          hints.push(`Generische Frage entdeckt: „${s.question}" – bitte fachlich schärfen.`);
        }
      }
      const warnSet = new Set<string>();
      for (const r of Object.values(parsed.results)) {
        const w = r.warning.trim();
        if (!w) hints.push(`Ergebnis „${r.title || "(ohne Titel)"}" ohne Warnhinweis.`);
        else if (warnSet.has(w)) hints.push(`Warnhinweis mehrfach identisch: „${w.slice(0, 60)}…"`);
        warnSet.add(w);
        if (!r.documentation.trim()) {
          hints.push(`Ergebnis „${r.title || "(ohne Titel)"}" ohne Dokumentationshinweis.`);
        }
      }
      setAiDraft(parsed);
      setAiHints(hints);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  };

  const acceptAiDraft = () => {
    if (!aiDraft) return;
    setTree(aiDraft);
    setActiveId(aiDraft.start);
    setAutoFocusToken(aiDraft.start);
    setAiDraft(null);
    setAiHints([]);
    setAiError(null);
    toast.success("KI-Entwurf übernommen. Bitte prüfen und speichern.");
  };


  // ---- Render ------------------------------------------------------------
  if (!tree) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Entscheidungsassistent</h2>
            <p className="text-xs text-muted-foreground">
              Für diesen Praxisfall ist noch kein Entscheidungsbaum hinterlegt.
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
              statusMeta.cls,
            )}
          >
            {statusMeta.label}
          </span>
        </header>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={createFresh}>
            <Plus className="h-4 w-4" /> Entscheidungsbaum anlegen
          </Button>
          <Button size="sm" variant="outline" disabled={aiLoading} onClick={generateAiDraft}>
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            KI-Entwurf erzeugen
          </Button>
        </div>
        {(aiDraft || aiError) && (
          <AiDraftDialog
            draft={aiDraft}
            error={aiError}
            hints={aiHints}
            currentTree={null}
            onDiscard={() => {
              setAiDraft(null);
              setAiError(null);
              setAiHints([]);
            }}
            onAccept={acceptAiDraft}
          />
        )}
      </section>
    );
  }

  const stepIds = Object.keys(tree.steps);

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <div>
            <h2 className="text-base font-semibold">Entscheidungsassistent</h2>
            <p className="text-xs text-muted-foreground">
              Redaktioneller Entscheidungsbaum. Erscheint im Lehrer-Frontend nur nach Freigabe.
            </p>
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
              statusMeta.cls,
            )}
          >
            {statusMeta.label}
          </span>
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> {savedAt.toLocaleTimeString()}
            </span>
          )}
          {saveError && (
            <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3" /> {saveError}
            </span>
          )}
        </div>
      </header>

      {expanded && (
        <div className="grid gap-4 p-4 lg:grid-cols-[240px_1fr]">
          {/* MiniMap + Redaktionshilfe */}
          <aside className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Baumübersicht
              </p>
              <MiniMap
                tree={tree}
                activeId={activeId}
                onSelect={setActiveId}
                resultOrder={orderedResultIds}
              />
            </div>
            <details
              className="rounded-lg border border-border bg-muted/20 p-3 text-xs"
              open={helpOpen}
              onToggle={(e) => setHelpOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer font-medium text-foreground">
                Redaktionshilfe
              </summary>
              <div className="mt-2 space-y-2">
                <HelpBlock title="Sachverhalt" text={caseData.shortDescription} />
                <HelpBlock title="Kurzantwort" text={caseData.shortAnswer} />
                <HelpBlock title="Empfehlung" text={caseData.recommendation} />
                <HelpBlock title="Do's" text={caseData.practiceTip ?? "—"} />
                {caseData.risks.length > 0 && (
                  <HelpList title="Don'ts / Häufige Fehler" items={caseData.risks} />
                )}
                {caseData.checklist.length > 0 && (
                  <HelpList title="Checkliste" items={caseData.checklist} />
                )}
                {caseData.documentation.length > 0 && (
                  <HelpList title="Dokumentation" items={caseData.documentation} />
                )}
                {caseData.legalBasis.length > 0 && (
                  <HelpBlock title="Rechtsgrundlagen" text={caseData.legalBasis.join(" · ")} />
                )}
              </div>
            </details>
          </aside>

          {/* Hauptspalte */}
          <div className="min-w-0 space-y-4">
            <ValidationPanel
              errors={report?.errors ?? []}
              warnings={report?.warnings ?? []}
              quality={qualityWarnings}
            />

            {/* Fragen */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Fragen · {stepIds.length}
                </h3>
                <Button size="sm" variant="outline" onClick={addStandaloneStep}>
                  <Plus className="h-4 w-4" /> Freistehende Frage
                </Button>
              </div>
              {stepIds.map((id) => (
                <StepCard
                  key={id}
                  id={id}
                  step={tree.steps[id]}
                  tree={tree}
                  isStart={tree.start === id}
                  expanded={activeId === id}
                  autoFocus={autoFocusToken === id}
                  resultOrder={orderedResultIds}
                  onExpand={() => setActiveId((cur) => (cur === id ? null : id))}
                  onSetStart={() => setStart(id)}
                  onPatch={(patch) => patchStep(id, patch)}
                  onPatchOption={(idx, patch) => patchOption(id, idx, patch)}
                  onAddOption={() => addOption(id)}
                  onRemoveOption={(idx) => removeOption(id, idx)}
                  onDuplicate={() => duplicateStep(id)}
                  onDelete={() => deleteStep(id)}
                  onAddLinkedStep={(idx) => addLinkedStep(id, idx)}
                  onAddLinkedResult={(idx) => addLinkedResult(id, idx)}
                  onFocusNode={(nid) => setActiveId(nid)}
                  onPreviewFrom={() => setPreviewOpenAt(id)}
                />
              ))}
            </div>

            {/* Ergebnisse (in Verwendungsreihenfolge) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Ergebnisse · {Object.keys(tree.results).length}
                </h3>
                <Button size="sm" variant="outline" onClick={addStandaloneResult}>
                  <Plus className="h-4 w-4" /> Freistehendes Ergebnis
                </Button>
              </div>
              {orderedResultIds.map((rid, i) => (
                <ResultCard
                  key={rid}
                  id={rid}
                  index={i + 1}
                  result={tree.results[rid]}
                  expanded={activeId === rid}
                  autoFocus={autoFocusToken === rid}
                  onExpand={() => setActiveId((cur) => (cur === rid ? null : rid))}
                  onPatch={(patch) => patchResult(rid, patch)}
                  onDuplicate={() => duplicateResult(rid)}
                  onDelete={() => deleteResult(rid)}
                />
              ))}
              {orderedResultIds.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Noch keine Ergebnisse. Legen Sie ein Ergebnis über eine Antwort an.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
              <div className="text-[11px] text-muted-foreground">
                Status: {statusMeta.label}
                {report && report.errors.length > 0 && (
                  <span className="ml-2 text-destructive">
                    · {report.errors.length} technische Fehler
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={removeTree}>
                  <Trash2 className="h-4 w-4" /> Entfernen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={aiLoading}
                  onClick={generateAiDraft}
                  title="Erzeugt einen redaktionellen Entwurf des Entscheidungsbaums aus den kuratierten Fallinformationen."
                >
                  {aiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  KI-Entwurf erzeugen
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPreviewOpenAt(tree.start)}>
                  <Eye className="h-4 w-4" /> Vorschau ab Start
                </Button>
                <Button size="sm" variant="outline" disabled={saving} onClick={saveDraft}>
                  <Save className="h-4 w-4" /> Als Entwurf speichern
                </Button>
                <Button size="sm" variant="outline" disabled={saving} onClick={saveReview}>
                  Zur Prüfung markieren
                </Button>
                {status === "approved" ? (
                  <Button size="sm" variant="destructive" disabled={saving} onClick={revoke}>
                    Freigabe aufheben
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={saving || !canApprove}
                    onClick={approve}
                    title={
                      canApprove
                        ? undefined
                        : "Freigabe nur mit ≥ 2 Ergebnissen und ohne technische Fehler möglich."
                    }
                  >
                    <Sparkles className="h-4 w-4" /> Freigeben
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview – kann ab beliebigem Startknoten gestartet werden */}
      {previewOpenAt && (
        <DecisionAssistant
          c={caseData}
          open={!!previewOpenAt}
          onOpenChange={(v) => {
            if (!v) setPreviewOpenAt(null);
          }}
          overrideTree={tree.steps[previewOpenAt] ? { ...tree, start: previewOpenAt } : tree}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog info={confirmDelete} onCancel={() => setConfirmDelete(null)} />
      )}

      {(aiDraft || aiError) && (
        <AiDraftDialog
          draft={aiDraft}
          error={aiError}
          hints={aiHints}
          currentTree={tree}
          onDiscard={() => {
            setAiDraft(null);
            setAiError(null);
            setAiHints([]);
          }}
          onAccept={acceptAiDraft}
        />
      )}
    </section>
  );
}

// ------ MiniMap -----------------------------------------------------------

function MiniMap({
  tree,
  activeId,
  onSelect,
  resultOrder,
}: {
  tree: CuratedDecisionTree;
  activeId: string | null;
  onSelect: (id: string) => void;
  resultOrder: string[];
}) {
  const rendered = new Set<string>();
  const renderStep = (id: string, depth: number): React.ReactElement | null => {
    const step = tree.steps[id];
    if (!step) return null;
    const cycled = rendered.has(id);
    rendered.add(id);
    return (
      <div key={`s-${id}-${depth}`} className="text-[11px]">
        <button
          type="button"
          onClick={() => onSelect(id)}
          className={cn(
            "block w-full truncate text-left hover:underline",
            activeId === id ? "font-semibold text-primary" : "text-foreground",
          )}
          title={step.question || "(ohne Text)"}
        >
          {tree.start === id ? "▶ " : ""}
          {step.question.trim().slice(0, 40) || "(Frage ohne Text)"}
        </button>
        {cycled ? (
          <div className="pl-3 text-[10px] text-amber-700">↻ (bereits oben)</div>
        ) : (
          <div className="ml-2 mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
            {step.options.map((opt, i) => (
              <div key={i} className="text-[11px]">
                <span className="text-muted-foreground">↳ {opt.label.slice(0, 24) || "…"}: </span>
                {opt.next && tree.steps[opt.next] ? (
                  renderStep(opt.next, depth + 1)
                ) : opt.result && tree.results[opt.result] ? (
                  <button
                    type="button"
                    onClick={() => onSelect(opt.result!)}
                    className={cn(
                      "hover:underline",
                      activeId === opt.result ? "font-semibold text-primary" : "text-emerald-700",
                    )}
                    title={tree.results[opt.result].title}
                  >
                    ● {resultLabel(tree, opt.result, resultOrder).slice(0, 30)}
                  </button>
                ) : (
                  <span className="text-destructive">⚠ offen</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
  if (!tree.steps[tree.start]) {
    return <p className="text-[11px] text-muted-foreground">Noch keine Frage angelegt.</p>;
  }
  return <div className="space-y-1">{renderStep(tree.start, 0)}</div>;
}

// ------ StepCard ----------------------------------------------------------

function StepCard({
  id,
  step,
  tree,
  isStart,
  expanded,
  autoFocus,
  resultOrder,
  onExpand,
  onSetStart,
  onPatch,
  onPatchOption,
  onAddOption,
  onRemoveOption,
  onDuplicate,
  onDelete,
  onAddLinkedStep,
  onAddLinkedResult,
  onFocusNode,
  onPreviewFrom,
}: {
  id: string;
  step: CuratedStep;
  tree: CuratedDecisionTree;
  isStart: boolean;
  expanded: boolean;
  autoFocus: boolean;
  resultOrder: string[];
  onExpand: () => void;
  onSetStart: () => void;
  onPatch: (p: Partial<CuratedStep>) => void;
  onPatchOption: (
    idx: number,
    patch: { label?: string; next?: string | null; result?: string | null },
  ) => void;
  onAddOption: () => void;
  onRemoveOption: (idx: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddLinkedStep: (idx: number) => void;
  onAddLinkedResult: (idx: number) => void;
  onFocusNode: (nid: string) => void;
  onPreviewFrom: () => void;
}) {
  const questionRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (autoFocus && expanded && questionRef.current) {
      questionRef.current.focus();
    }
  }, [autoFocus, expanded]);

  const openIssues = step.options.filter((o) => !o.next && !o.result).length;

  if (!expanded) {
    return (
      <div className="rounded-lg border border-border bg-background">
        <button
          type="button"
          onClick={onExpand}
          className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isStart && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  Start
                </span>
              )}
              <p className="truncate text-sm font-medium">
                {step.question.trim() || <span className="italic text-muted-foreground">(Frage ohne Text)</span>}
              </p>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {step.options.length} Antworten
              {openIssues > 0 && (
                <span className="ml-1 text-destructive">· {openIssues} offen</span>
              )}
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-background shadow-sm ring-1 ring-primary/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onExpand} className="text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-4 w-4" />
          </button>
          {isStart ? (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              Startknoten
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onSetStart}>
              <Flag className="mr-1 h-3 w-3" /> Als Start setzen
            </Button>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onPreviewFrom} title="Ab hier testen">
            <Eye className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate} title="Duplizieren">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} title="Löschen">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Frage
          </Label>
          <Input
            ref={questionRef}
            className="mt-1"
            placeholder="Fragetext, z. B. „Ist die Klasse an einem außerschulischen Lernort?"
            value={step.question}
            onChange={(e) => onPatch({ question: e.target.value })}
          />
          <Textarea
            className="mt-2"
            rows={2}
            placeholder="Erklärung (optional)"
            value={step.explanation ?? ""}
            onChange={(e) => onPatch({ explanation: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Antwortmöglichkeiten
          </p>
          {step.options.map((opt, idx) => (
            <OptionRow
              key={idx}
              opt={opt}
              tree={tree}
              stepId={id}
              idx={idx}
              resultOrder={resultOrder}
              onPatchOption={(patch) => onPatchOption(idx, patch)}
              onRemoveOption={() => onRemoveOption(idx)}
              onAddLinkedStep={() => onAddLinkedStep(idx)}
              onAddLinkedResult={() => onAddLinkedResult(idx)}
              onFocusNode={onFocusNode}
            />
          ))}
          <Button size="sm" variant="outline" onClick={onAddOption}>
            <Plus className="h-4 w-4" /> Antwort hinzufügen
          </Button>
        </div>
      </div>
    </div>
  );
}

// ------ OptionRow ---------------------------------------------------------

function OptionRow({
  opt,
  tree,
  stepId,
  idx,
  resultOrder,
  onPatchOption,
  onRemoveOption,
  onAddLinkedStep,
  onAddLinkedResult,
  onFocusNode,
}: {
  opt: { label: string; next?: string; result?: string };
  tree: CuratedDecisionTree;
  stepId: string;
  idx: number;
  resultOrder: string[];
  onPatchOption: (patch: { label?: string; next?: string | null; result?: string | null }) => void;
  onRemoveOption: () => void;
  onAddLinkedStep: () => void;
  onAddLinkedResult: () => void;
  onFocusNode: (nid: string) => void;
}) {
  const hasTarget = !!opt.next || !!opt.result;
  const availableSteps = Object.keys(tree.steps).filter((s) => s !== stepId);
  const availableResults = resultOrder;

  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-2.5">
      <div className="flex items-center gap-2">
        <Input
          value={opt.label}
          onChange={(e) => onPatchOption({ label: e.target.value })}
          placeholder="Antwort"
          className="flex-1"
        />
        <Button size="sm" variant="ghost" onClick={onRemoveOption} title="Antwort löschen">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {hasTarget ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/5 px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">↳ führt zu</span>
          {opt.next && tree.steps[opt.next] ? (
            <>
              <span className="rounded bg-background px-1.5 py-0.5 font-medium">Frage</span>
              <button
                type="button"
                onClick={() => onFocusNode(opt.next!)}
                className="truncate text-left font-medium text-primary hover:underline"
                title={stepLabel(tree, opt.next)}
              >
                {stepLabel(tree, opt.next).slice(0, 80)}
              </button>
            </>
          ) : opt.result && tree.results[opt.result] ? (
            <>
              <span className="rounded bg-background px-1.5 py-0.5 font-medium">Ergebnis</span>
              <button
                type="button"
                onClick={() => onFocusNode(opt.result!)}
                className="truncate text-left font-medium text-emerald-700 hover:underline"
                title={tree.results[opt.result].title}
              >
                {resultLabel(tree, opt.result, resultOrder).slice(0, 80)}
              </button>
            </>
          ) : (
            <span className="text-destructive">unbekanntes Ziel</span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-[11px]"
            onClick={() => onPatchOption({ next: null, result: null })}
          >
            Verbindung ändern
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-2 rounded border border-destructive/40 bg-destructive/5 p-2">
          <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> Noch kein nächster Schritt definiert
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onAddLinkedStep}>
              <Plus className="h-3.5 w-3.5" /> Neue Folgefrage
            </Button>
            <Button size="sm" variant="outline" onClick={onAddLinkedResult}>
              <Plus className="h-3.5 w-3.5" /> Neues Ergebnis
            </Button>
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              value=""
              onChange={(e) => {
                if (e.target.value) onPatchOption({ next: e.target.value });
              }}
            >
              <option value="">Vorhandene Frage…</option>
              {availableSteps.length === 0 ? (
                <option disabled>keine vorhanden</option>
              ) : (
                availableSteps.map((s) => (
                  <option key={s} value={s}>
                    {stepLabel(tree, s).slice(0, 60)}
                  </option>
                ))
              )}
            </select>
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              value=""
              onChange={(e) => {
                if (e.target.value) onPatchOption({ result: e.target.value });
              }}
            >
              <option value="">Vorhandenes Ergebnis…</option>
              {availableResults.length === 0 ? (
                <option disabled>keines vorhanden</option>
              ) : (
                availableResults.map((r) => (
                  <option key={r} value={r}>
                    {resultLabel(tree, r, resultOrder).slice(0, 60)}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ------ ResultCard --------------------------------------------------------

function ResultCard({
  id,
  index,
  result,
  expanded,
  autoFocus,
  onExpand,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  id: string;
  index: number;
  result: CuratedResult;
  expanded: boolean;
  autoFocus: boolean;
  onExpand: () => void;
  onPatch: (p: Partial<CuratedResult>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const titleRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (autoFocus && expanded && titleRef.current) titleRef.current.focus();
  }, [autoFocus, expanded]);

  const colorBadge =
    result.color === "rot"
      ? "bg-rose-500/15 text-rose-700"
      : result.color === "gruen"
        ? "bg-emerald-500/15 text-emerald-700"
        : "bg-amber-500/15 text-amber-700";

  if (!expanded) {
    return (
      <div className="rounded-lg border border-border bg-background">
        <button
          type="button"
          onClick={onExpand}
          className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", colorBadge)}>
                Ergebnis #{index}
              </span>
              <p className="truncate text-sm font-medium">
                {result.title.trim() || (
                  <span className="italic text-muted-foreground">(ohne Titel)</span>
                )}
              </p>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {result.recommendation.trim().slice(0, 100) || "Noch keine Empfehlung"}
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-background shadow-sm ring-1 ring-primary/10">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onExpand} className="text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-4 w-4" />
          </button>
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", colorBadge)}>
            Ergebnis #{index}
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onDuplicate} title="Duplizieren">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} title="Löschen">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-[11px]">Titel</Label>
          <Input
            ref={titleRef}
            value={result.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            placeholder="z. B. „Sofort Schulleitung informieren"
          />
        </div>
        <div>
          <Label className="text-[11px]">Ampel</Label>
          <select
            value={result.color}
            onChange={(e) => onPatch({ color: e.target.value as CuratedTreeColor })}
            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="gruen">Grün</option>
            <option value="gelb">Gelb</option>
            <option value="rot">Rot</option>
          </select>
        </div>
        <div>
          <Label className="text-[11px]">Dringlichkeit</Label>
          <Input value={result.urgency} onChange={(e) => onPatch({ urgency: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[11px]">Verantwortliche Stelle</Label>
          <Input
            value={result.responsible}
            onChange={(e) => onPatch({ responsible: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[11px]">Empfehlung (Pflicht)</Label>
          <Textarea
            rows={2}
            value={result.recommendation}
            onChange={(e) => onPatch({ recommendation: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[11px]">Dokumentationshinweis</Label>
          <Textarea
            rows={2}
            value={result.documentation}
            onChange={(e) => onPatch({ documentation: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[11px]">Warnhinweis</Label>
          <Textarea
            rows={2}
            value={result.warning}
            onChange={(e) => onPatch({ warning: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[11px]">Konkrete Schritte (eine Zeile pro Schritt)</Label>
          <Textarea
            rows={3}
            value={result.steps.join("\n")}
            onChange={(e) =>
              onPatch({ steps: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
            }
          />
        </div>
      </div>
    </div>
  );
}

// ------ Helpers -----------------------------------------------------------

function HelpBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="whitespace-pre-wrap text-[11px] text-foreground/80">{text || "—"}</p>
    </div>
  );
}

function HelpList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="list-disc pl-4 text-[11px] text-foreground/80">
        {items.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function ValidationPanel({
  errors,
  warnings,
  quality,
}: {
  errors: ReturnType<typeof validateCuratedTree>["errors"];
  warnings: ReturnType<typeof validateCuratedTree>["warnings"];
  quality: string[];
}) {
  if (errors.length === 0 && warnings.length === 0 && quality.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> Struktur ist technisch fehlerfrei.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <p className="mb-1 flex items-center gap-1 font-semibold text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> Technische Fehler ({errors.length})
          </p>
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {(warnings.length > 0 || quality.length > 0) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="mb-1 flex items-center gap-1 font-semibold text-amber-800">
            <TriangleAlert className="h-3.5 w-3.5" /> Qualitätswarnungen
          </p>
          <ul className="list-disc pl-5">
            {warnings.map((w, i) => (
              <li key={`w${i}`}>{w.message}</li>
            ))}
            {quality.map((q, i) => (
              <li key={`q${i}`}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConfirmDeleteDialog({
  info,
  onCancel,
}: {
  info: {
    kind: "step" | "result";
    id: string;
    refs: Array<{ stepId: string; optionIndex: number }>;
  };
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <h4 className="text-sm font-semibold">Dieser Knoten wird noch verwendet.</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {info.kind === "step" ? "Diese Frage" : "Dieses Ergebnis"} ist noch aus{" "}
          {info.refs.length} Antwort(en) verlinkt. Bitte ändern Sie zuerst die Verbindungen.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>
            Verstanden
          </Button>
        </div>
      </div>
    </div>
  );
}

function AiDraftDialog({
  draft,
  error,
  hints,
  currentTree,
  onDiscard,
  onAccept,
}: {
  draft: CuratedDecisionTree | null;
  error: string | null;
  hints: string[];
  currentTree: CuratedDecisionTree | null;
  onDiscard: () => void;
  onAccept: () => void;
}) {
  const existingQuestions = new Set<string>();
  const existingResultTitles = new Set<string>();
  if (currentTree) {
    for (const s of Object.values(currentTree.steps)) {
      existingQuestions.add(s.question.trim().toLowerCase());
    }
    for (const r of Object.values(currentTree.results)) {
      existingResultTitles.add(r.title.trim().toLowerCase());
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">KI-Entwurf für Entscheidungsbaum</h4>
          </div>
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            Vorschlag – nicht veröffentlicht
          </span>
        </div>
        <div className="max-h-[65vh] space-y-4 overflow-auto px-5 py-4 text-sm">
          {error && (
            <div className="whitespace-pre-line rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          {draft && (
            <>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Vorgeschlagene Fragen ({Object.keys(draft.steps).length})
                </p>
                <ul className="space-y-1">
                  {Object.entries(draft.steps).map(([id, s]) => {
                    const isNew = !existingQuestions.has(s.question.trim().toLowerCase());
                    return (
                      <li key={id} className="rounded border border-border bg-background p-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{s.question || "(ohne Text)"}</span>
                          {isNew && (
                            <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              neu
                            </span>
                          )}
                        </div>
                        <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-muted-foreground">
                          {s.options.map((o, i) => (
                            <li key={i}>
                              ↳ {o.label}
                              {o.next ? " → Folgefrage" : o.result ? " → Ergebnis" : " → (offen)"}
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Vorgeschlagene Ergebnisse ({Object.keys(draft.results).length})
                </p>
                <ul className="space-y-1">
                  {Object.entries(draft.results).map(([id, r]) => {
                    const isNew = !existingResultTitles.has(r.title.trim().toLowerCase());
                    const color =
                      r.color === "rot"
                        ? "border-rose-500/40 bg-rose-500/10"
                        : r.color === "gruen"
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-amber-500/40 bg-amber-500/10";
                    return (
                      <li key={id} className={cn("rounded border p-2 text-xs", color)}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{r.title || "(ohne Titel)"}</span>
                          {isNew && (
                            <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              neu
                            </span>
                          )}
                        </div>
                        {r.recommendation && (
                          <p className="mt-1 text-[11px] text-foreground/80">
                            <span className="font-medium">Empfehlung: </span>
                            {r.recommendation}
                          </p>
                        )}
                        {r.warning && (
                          <p className="mt-0.5 text-[11px] text-foreground/80">
                            <span className="font-medium">Warnhinweis: </span>
                            {r.warning}
                          </p>
                        )}
                        {r.documentation && (
                          <p className="mt-0.5 text-[11px] text-foreground/80">
                            <span className="font-medium">Dokumentation: </span>
                            {r.documentation}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              {hints.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <p className="mb-1 flex items-center gap-1 font-semibold text-amber-800">
                    <TriangleAlert className="h-3.5 w-3.5" /> Redaktionelle Hinweise (nicht blockierend)
                  </p>
                  <ul className="list-disc pl-5">
                    {hints.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" onClick={onDiscard}>
            Verwerfen
          </Button>
          {draft && !error && (
            <Button size="sm" onClick={onAccept}>
              <Sparkles className="h-4 w-4" /> Entwurf übernehmen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// noop export to satisfy tree-shaking helpers referenced by admin route
export type { CuratedTreeStatus };

