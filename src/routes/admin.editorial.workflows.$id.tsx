/**
 * Sprint 4.3D – Editorial Workflow Designer.
 *
 * Tab-basierter Editor für ein WorkflowTemplate. Der Editor arbeitet gegen
 * das Domänenmodell (WorkflowTemplate) und ruft ausschließlich die
 * Designer-Serverfunktionen auf. Er kennt keinerlei Datenbankstruktur.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, ArrowDown, ArrowUp, Copy, ExternalLink, FileJson,
  Play, Plus, Save, Trash2, TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { useEditorialRole } from "@/hooks/editorial/useEditorialRole";
import {
  archiveTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplateForDesigner,
  listTemplateVersions,
  publishTemplate,
  reactivateTemplate,
  saveTemplateDraft,
  validateTemplate,
} from "@/lib/workflowDesigner.functions";
import { WorkflowValidator } from "@/services/legal-workflows";
import { WorkflowExportService } from "@/services/legal-workflows/WorkflowExportService";
import type {
  WorkflowPhase,
  WorkflowRule,
  WorkflowStep,
  WorkflowStepType,
  WorkflowTemplate,
  WorkflowValidationReport,
} from "@/services/legal-workflows/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/editorial/workflows/$id")({
  component: WorkflowDesignerPage,
});

const STEP_TYPES: WorkflowStepType[] = [
  "information", "decision", "action", "document", "review", "communication", "wait",
];

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function WorkflowDesignerPage() {
  const { id } = useParams({ from: "/admin/editorial/workflows/$id" });
  const role = useEditorialRole();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const getFn = useServerFn(getTemplateForDesigner);
  const saveFn = useServerFn(saveTemplateDraft);
  const validateFn = useServerFn(validateTemplate);
  const publishFn = useServerFn(publishTemplate);
  const archiveFn = useServerFn(archiveTemplate);
  const reactivateFn = useServerFn(reactivateTemplate);
  const duplicateFn = useServerFn(duplicateTemplate);
  const deleteFn = useServerFn(deleteTemplate);
  const versionsFn = useServerFn(listTemplateVersions);

  const query = useQuery({
    queryKey: ["designer", "template", id],
    queryFn: () => getFn({ data: { id } }),
    enabled: role.ready && role.canEdit,
  });

  const [draft, setDraft] = useState<WorkflowTemplate | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (query.data?.template && !draft) {
      setDraft(query.data.template);
    }
  }, [query.data, draft]);

  const validation = useMemo<WorkflowValidationReport | null>(
    () => (draft ? WorkflowValidator.validate(draft) : null),
    [draft],
  );

  const saveMut = useMutation({
    mutationFn: (t: WorkflowTemplate) => saveFn({ data: { template: t } }),
    onSuccess: () => {
      toast.success("Gespeichert.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["designer", "template", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: () => publishFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Version veröffentlicht.");
      qc.invalidateQueries({ queryKey: ["designer", "template", id] });
      qc.invalidateQueries({ queryKey: ["designer", "versions", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveFn({ data: { id } }),
    onSuccess: () => { toast.success("Archiviert."); qc.invalidateQueries({ queryKey: ["designer", "template", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reactivateMut = useMutation({
    mutationFn: () => reactivateFn({ data: { id } }),
    onSuccess: () => { toast.success("Reaktiviert."); qc.invalidateQueries({ queryKey: ["designer", "template", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const dupMut = useMutation({
    mutationFn: (v: { newSlug: string; newTitle: string }) =>
      duplicateFn({ data: { id, ...v } }),
    onSuccess: ({ id: newId }) => {
      toast.success("Dupliziert.");
      navigate({ to: "/admin/editorial/workflows/$id", params: { id: newId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Gelöscht."); navigate({ to: "/admin/editorial/workflows" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!role.ready) return null;
  if (!role.canEdit) {
    return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Kein Zugriff.</div>;
  }
  if (query.isLoading || !draft) {
    return <div className="space-y-2"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (query.isError) {
    return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{(query.error as Error).message}</div>;
  }

  const patch = (u: Partial<WorkflowTemplate>) => { setDraft({ ...draft, ...u }); setDirty(true); };
  const patchPhases = (phases: WorkflowPhase[]) => { setDraft({ ...draft, phases }); setDirty(true); };
  const patchRules = (rules: WorkflowRule[]) => { setDraft({ ...draft, rules }); setDirty(true); };

  const editable = draft.workflowStatus === "draft" || draft.workflowStatus === "in_review" || draft.workflowStatus === "approved";
  const validIssues = validation?.issues ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/editorial/workflows" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Workflow Designer</p>
            <h1 className="text-xl font-semibold">{draft.title || "Ohne Titel"}</h1>
            <p className="text-xs text-muted-foreground">
              Status: {draft.workflowStatus}{dirty ? " · Ungespeicherte Änderungen" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm"
            disabled={!editable || saveMut.isPending}
            onClick={() => saveMut.mutate(draft)}>
            <Save className="mr-2 h-4 w-4" />Speichern
          </Button>
          <Button size="sm"
            disabled={dirty || !validation?.valid || publishMut.isPending || draft.workflowStatus === "published"}
            onClick={() => publishMut.mutate()}>
            Version veröffentlichen
          </Button>
          {draft.currentVersionId && (
            <Link
              to="/workflows/$templateId"
              params={{ templateId: draft.id }}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              <Play className="mr-2 h-4 w-4" />Runtime öffnen
            </Link>
          )}
          <DuplicateButton onSubmit={(v) => dupMut.mutate(v)} loading={dupMut.isPending} sourceSlug={draft.slug} />
          {draft.workflowStatus !== "archived" ? (
            <Button variant="outline" size="sm" onClick={() => archiveMut.mutate()} disabled={archiveMut.isPending}>Archivieren</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => reactivateMut.mutate()} disabled={reactivateMut.isPending}>Reaktivieren</Button>
          )}
          {draft.workflowStatus !== "published" && (
            <Button variant="ghost" size="sm" onClick={() => { if (confirm("Template unwiderruflich löschen?")) delMut.mutate(); }}>
              <Trash2 className="mr-2 h-4 w-4" />Löschen
            </Button>
          )}
        </div>
      </div>

      {validIssues.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
            <TriangleAlert className="h-4 w-4" />
            {validIssues.length} Validierungshinweis{validIssues.length === 1 ? "" : "e"}
          </div>
          <ul className="ml-6 list-disc space-y-0.5 text-xs">
            {validIssues.slice(0, 8).map((i) => (<li key={i.code + i.ref}>{i.message}</li>))}
            {validIssues.length > 8 && <li>… und {validIssues.length - 8} weitere.</li>}
          </ul>
        </div>
      )}

      <Tabs defaultValue="meta" className="w-full">
        <TabsList>
          <TabsTrigger value="meta">Metadaten</TabsTrigger>
          <TabsTrigger value="structure">Struktur</TabsTrigger>
          <TabsTrigger value="rules">Regeln ({draft.rules.length})</TabsTrigger>
          <TabsTrigger value="versions">Versionen</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="meta" className="mt-4">
          <MetaTab draft={draft} onChange={patch} disabled={!editable} />
        </TabsContent>

        <TabsContent value="structure" className="mt-4">
          <StructureTab draft={draft} onChange={patchPhases} disabled={!editable} />
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <RulesTab draft={draft} onChange={patchRules} disabled={!editable} />
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          <VersionsTab templateId={id} fetchFn={versionsFn} />
        </TabsContent>

        <TabsContent value="json" className="mt-4">
          <JsonTab draft={draft} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

function MetaTab({
  draft, onChange, disabled,
}: { draft: WorkflowTemplate; onChange: (u: Partial<WorkflowTemplate>) => void; disabled: boolean }) {
  return (
    <div className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-2">
      <div>
        <Label>Titel</Label>
        <Input disabled={disabled} value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div>
        <Label>Slug</Label>
        <Input disabled={disabled} value={draft.slug} onChange={(e) => onChange({ slug: e.target.value })} />
      </div>
      <div className="lg:col-span-2">
        <Label>Untertitel</Label>
        <Input disabled={disabled} value={draft.subtitle ?? ""} onChange={(e) => onChange({ subtitle: e.target.value })} />
      </div>
      <div className="lg:col-span-2">
        <Label>Beschreibung</Label>
        <Textarea disabled={disabled} rows={4} value={draft.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
      <div>
        <Label>Sichtbarkeit</Label>
        <select
          disabled={disabled}
          value={draft.publicationTier}
          onChange={(e) => onChange({ publicationTier: e.target.value as WorkflowTemplate["publicationTier"] })}
          className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="internal">Intern (nur angemeldete Redaktion/Nutzer)</option>
          <option value="public">Öffentlich</option>
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Struktur (Phasen + Schritte)
// ---------------------------------------------------------------------------

function StructureTab({
  draft, onChange, disabled,
}: { draft: WorkflowTemplate; onChange: (phases: WorkflowPhase[]) => void; disabled: boolean }) {
  const [editingStep, setEditingStep] = useState<{ phaseIndex: number; stepIndex: number } | null>(null);
  const allStepsForDeps = draft.phases.flatMap((p) => p.steps.map((s) => ({ id: s.id, title: s.title })));

  const addPhase = () => {
    onChange([
      ...draft.phases,
      {
        id: newId(), templateId: draft.id, sortOrder: draft.phases.length,
        title: `Phase ${draft.phases.length + 1}`, description: null,
        isRequired: true, completionCondition: null, steps: [],
      },
    ]);
  };
  const patchPhase = (idx: number, u: Partial<WorkflowPhase>) => {
    const next = draft.phases.slice();
    next[idx] = { ...next[idx], ...u };
    onChange(next);
  };
  const movePhase = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= draft.phases.length) return;
    const next = draft.phases.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const removePhase = (idx: number) => {
    if (!confirm("Phase samt Schritten löschen?")) return;
    onChange(draft.phases.filter((_, i) => i !== idx));
  };

  const addStep = (phaseIdx: number) => {
    const phase = draft.phases[phaseIdx];
    const step: WorkflowStep = {
      id: newId(), templateId: draft.id, phaseId: phase.id,
      sortOrder: phase.steps.length, title: `Schritt ${phase.steps.length + 1}`,
      description: null, goal: null, stepType: "action", priority: "normal",
      isRequired: true, estimatedMinutes: null, primaryRole: null, riskLevel: "low",
      dependsOn: [], checklists: [], documents: [], roles: [], sources: [],
    };
    const next = draft.phases.slice();
    next[phaseIdx] = { ...phase, steps: [...phase.steps, step] };
    onChange(next);
    setEditingStep({ phaseIndex: phaseIdx, stepIndex: phase.steps.length });
  };
  const patchStep = (phaseIdx: number, stepIdx: number, u: Partial<WorkflowStep>) => {
    const next = draft.phases.slice();
    const phase = { ...next[phaseIdx], steps: next[phaseIdx].steps.slice() };
    phase.steps[stepIdx] = { ...phase.steps[stepIdx], ...u };
    next[phaseIdx] = phase;
    onChange(next);
  };
  const moveStep = (phaseIdx: number, stepIdx: number, dir: -1 | 1) => {
    const target = stepIdx + dir;
    const steps = draft.phases[phaseIdx].steps;
    if (target < 0 || target >= steps.length) return;
    const next = draft.phases.slice();
    const s = steps.slice();
    [s[stepIdx], s[target]] = [s[target], s[stepIdx]];
    next[phaseIdx] = { ...next[phaseIdx], steps: s };
    onChange(next);
  };
  const removeStep = (phaseIdx: number, stepIdx: number) => {
    if (!confirm("Schritt löschen?")) return;
    const next = draft.phases.slice();
    next[phaseIdx] = { ...next[phaseIdx], steps: next[phaseIdx].steps.filter((_, i) => i !== stepIdx) };
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {draft.phases.map((phase, pi) => (
        <div key={phase.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <Input disabled={disabled} value={phase.title} onChange={(e) => patchPhase(pi, { title: e.target.value })} className="text-base font-medium" />
              <Textarea disabled={disabled} rows={2} placeholder="Beschreibung der Phase (optional)"
                value={phase.description ?? ""} onChange={(e) => patchPhase(pi, { description: e.target.value })} />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox disabled={disabled} checked={phase.isRequired} onCheckedChange={(v) => patchPhase(pi, { isRequired: !!v })} />
                Pflichtphase
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <Button variant="ghost" size="icon" disabled={disabled} onClick={() => movePhase(pi, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" disabled={disabled} onClick={() => movePhase(pi, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" disabled={disabled} onClick={() => removePhase(pi)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {phase.steps.map((step, si) => (
              <li key={step.id} className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
                <span className="w-6 text-center text-xs text-muted-foreground">{si + 1}</span>
                <button
                  onClick={() => setEditingStep({ phaseIndex: pi, stepIndex: si })}
                  className="flex-1 text-left"
                >
                  <div className="text-sm font-medium">{step.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {step.stepType} · {step.priority}{step.primaryRole ? ` · ${step.primaryRole}` : ""}
                    {step.isRequired ? " · Pflicht" : ""}
                    {step.dependsOn.length ? ` · ${step.dependsOn.length} Abhängigkeit(en)` : ""}
                  </div>
                </button>
                <Button variant="ghost" size="icon" disabled={disabled} onClick={() => moveStep(pi, si, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" disabled={disabled} onClick={() => moveStep(pi, si, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" disabled={disabled} onClick={() => removeStep(pi, si)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="mt-3" disabled={disabled} onClick={() => addStep(pi)}>
            <Plus className="mr-2 h-4 w-4" />Schritt hinzufügen
          </Button>
        </div>
      ))}
      <Button variant="outline" disabled={disabled} onClick={addPhase}>
        <Plus className="mr-2 h-4 w-4" />Phase hinzufügen
      </Button>

      {editingStep && (
        <StepEditorDialog
          step={draft.phases[editingStep.phaseIndex].steps[editingStep.stepIndex]}
          allSteps={allStepsForDeps}
          onClose={() => setEditingStep(null)}
          onChange={(u) => patchStep(editingStep.phaseIndex, editingStep.stepIndex, u)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step Editor (Dialog)
// ---------------------------------------------------------------------------

function StepEditorDialog({
  step, allSteps, onClose, onChange, disabled,
}: {
  step: WorkflowStep;
  allSteps: { id: string; title: string }[];
  onClose: () => void;
  onChange: (u: Partial<WorkflowStep>) => void;
  disabled: boolean;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Schritt bearbeiten</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Titel</Label>
              <Input disabled={disabled} value={step.title} onChange={(e) => onChange({ title: e.target.value })} />
            </div>
            <div>
              <Label>Typ</Label>
              <select disabled={disabled} value={step.stepType}
                onChange={(e) => onChange({ stepType: e.target.value as WorkflowStepType })}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                {STEP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Priorität</Label>
              <select disabled={disabled} value={step.priority}
                onChange={(e) => onChange({ priority: e.target.value as WorkflowStep["priority"] })}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                {["low", "normal", "high", "critical"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Risiko</Label>
              <select disabled={disabled} value={step.riskLevel}
                onChange={(e) => onChange({ riskLevel: e.target.value as WorkflowStep["riskLevel"] })}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                {["low", "medium", "high"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Primäre Rolle</Label>
              <select disabled={disabled} value={step.primaryRole ?? ""}
                onChange={(e) => onChange({ primaryRole: (e.target.value || null) as WorkflowStep["primaryRole"] })}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="">–</option>
                {["teacher", "class_lead", "principal", "deputy", "office", "social_worker", "admin"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Aufwand (Minuten)</Label>
              <Input disabled={disabled} type="number" value={step.estimatedMinutes ?? ""}
                onChange={(e) => onChange({ estimatedMinutes: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox disabled={disabled} checked={step.isRequired} onCheckedChange={(v) => onChange({ isRequired: !!v })} />
              Pflichtschritt
            </label>
            <div className="md:col-span-2">
              <Label>Beschreibung</Label>
              <Textarea disabled={disabled} rows={3} value={step.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Ziel / Ergebnis</Label>
              <Textarea disabled={disabled} rows={2} value={step.goal ?? ""} onChange={(e) => onChange({ goal: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Abhängigkeiten (Schritt muss abgeschlossen sein)</Label>
            <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {allSteps.filter((s) => s.id !== step.id).map((s) => {
                const checked = step.dependsOn.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 text-xs">
                    <Checkbox disabled={disabled} checked={checked} onCheckedChange={(v) => {
                      const next = v ? [...step.dependsOn, s.id] : step.dependsOn.filter((d) => d !== s.id);
                      onChange({ dependsOn: next });
                    }} />
                    {s.title}
                  </label>
                );
              })}
              {allSteps.length <= 1 && <div className="text-xs text-muted-foreground">Keine anderen Schritte vorhanden.</div>}
            </div>
          </div>

          <ChecklistEditor step={step} onChange={onChange} disabled={disabled} />
          <DocumentsEditor step={step} onChange={onChange} disabled={disabled} />
          <SourcesEditor step={step} onChange={onChange} disabled={disabled} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Fertig</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistEditor({ step, onChange, disabled }: { step: WorkflowStep; onChange: (u: Partial<WorkflowStep>) => void; disabled: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>Checkliste</Label>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({
          checklists: [...step.checklists, { id: newId(), sortOrder: step.checklists.length, title: "Neue Aufgabe", isRequired: false }],
        })}><Plus className="mr-1 h-3 w-3" />Eintrag</Button>
      </div>
      <ul className="mt-1 space-y-1">
        {step.checklists.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2">
            <Checkbox disabled={disabled} checked={c.isRequired} onCheckedChange={(v) => {
              const next = step.checklists.slice(); next[i] = { ...c, isRequired: !!v };
              onChange({ checklists: next });
            }} />
            <Input disabled={disabled} value={c.title} onChange={(e) => {
              const next = step.checklists.slice(); next[i] = { ...c, title: e.target.value };
              onChange({ checklists: next });
            }} />
            <Button variant="ghost" size="icon" disabled={disabled} onClick={() => onChange({ checklists: step.checklists.filter((_, k) => k !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentsEditor({ step, onChange, disabled }: { step: WorkflowStep; onChange: (u: Partial<WorkflowStep>) => void; disabled: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>Dokumentvorlagen</Label>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({
          documents: [...step.documents, { id: newId(), templateSlug: "", title: "", note: null }],
        })}><Plus className="mr-1 h-3 w-3" />Vorlage</Button>
      </div>
      <ul className="mt-1 space-y-1">
        {step.documents.map((d, i) => (
          <li key={d.id} className="flex items-center gap-2">
            <Input disabled={disabled} placeholder="Slug" value={d.templateSlug} className="w-40"
              onChange={(e) => { const next = step.documents.slice(); next[i] = { ...d, templateSlug: e.target.value }; onChange({ documents: next }); }} />
            <Input disabled={disabled} placeholder="Titel" value={d.title}
              onChange={(e) => { const next = step.documents.slice(); next[i] = { ...d, title: e.target.value }; onChange({ documents: next }); }} />
            <Button variant="ghost" size="icon" disabled={disabled} onClick={() => onChange({ documents: step.documents.filter((_, k) => k !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourcesEditor({ step, onChange, disabled }: { step: WorkflowStep; onChange: (u: Partial<WorkflowStep>) => void; disabled: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>Rechtsgrundlagen</Label>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({
          sources: [...step.sources, { id: newId(), legalSectionId: null, citationHint: "", note: null }],
        })}><Plus className="mr-1 h-3 w-3" />Quelle</Button>
      </div>
      <ul className="mt-1 space-y-1">
        {step.sources.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <Input disabled={disabled} placeholder="Zitierhinweis (z. B. § 53 SchulG NRW)" value={s.citationHint ?? ""}
              onChange={(e) => { const next = step.sources.slice(); next[i] = { ...s, citationHint: e.target.value }; onChange({ sources: next }); }} />
            <Button variant="ghost" size="icon" disabled={disabled} onClick={() => onChange({ sources: step.sources.filter((_, k) => k !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function RulesTab({ draft, onChange, disabled }: { draft: WorkflowTemplate; onChange: (r: WorkflowRule[]) => void; disabled: boolean }) {
  const add = () => onChange([...draft.rules, {
    id: newId(), templateId: draft.id, whenType: "step_completed",
    whenRef: null, thenAction: "activate_step", thenRef: null, priority: draft.rules.length,
  }]);
  const patch = (i: number, u: Partial<WorkflowRule>) => {
    const next = draft.rules.slice(); next[i] = { ...next[i], ...u }; onChange(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Deklarative Regeln steuern das Verhalten der Engine: „Wenn Bedingung, dann Aktion."
      </p>
      <ul className="space-y-2">
        {draft.rules.map((r, i) => (
          <li key={r.id} className="grid gap-2 rounded-md border border-border bg-card p-3 md:grid-cols-5">
            <select disabled={disabled} value={r.whenType} onChange={(e) => patch(i, { whenType: e.target.value })}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              {["step_completed", "step_skipped", "step_blocked", "phase_completed", "context_flag"].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <Input disabled={disabled} placeholder="whenRef (Step/Phase ID oder Flag)" value={r.whenRef ?? ""} onChange={(e) => patch(i, { whenRef: e.target.value })} />
            <select disabled={disabled} value={r.thenAction} onChange={(e) => patch(i, { thenAction: e.target.value })}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              {["activate_step", "skip_step", "block_step", "complete_phase", "recommend_step"].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <Input disabled={disabled} placeholder="thenRef (Step ID)" value={r.thenRef ?? ""} onChange={(e) => patch(i, { thenRef: e.target.value })} />
            <div className="flex items-center gap-2">
              <Input disabled={disabled} type="number" placeholder="Priorität" value={r.priority}
                onChange={(e) => patch(i, { priority: Number(e.target.value) })} className="w-20" />
              <Button variant="ghost" size="icon" disabled={disabled} onClick={() => onChange(draft.rules.filter((_, k) => k !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="outline" disabled={disabled} onClick={add}><Plus className="mr-2 h-4 w-4" />Regel</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

function VersionsTab({ templateId, fetchFn }: { templateId: string; fetchFn: ReturnType<typeof useServerFn<typeof listTemplateVersions>> }) {
  const q = useQuery({
    queryKey: ["designer", "versions", templateId],
    queryFn: () => fetchFn({ data: { id: templateId } }),
  });
  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
  if (q.isError) return <div className="text-sm text-destructive">{(q.error as Error).message}</div>;
  const versions = q.data?.versions ?? [];
  if (!versions.length) return <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Noch keine Versionen veröffentlicht.</div>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {versions.slice().reverse().map((v) => (
        <li key={v.id} className="flex items-center justify-between p-3 text-sm">
          <div>
            <div className="font-medium">v{v.version}</div>
            <div className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</div>
          </div>
          <span className="text-xs text-muted-foreground">Snapshot immutable</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// JSON Export
// ---------------------------------------------------------------------------

function JsonTab({ draft }: { draft: WorkflowTemplate }) {
  const json = WorkflowExportService.exportTemplate(draft);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileJson className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Portables Format – kopieren oder als Backup speichern.</span>
        <Button size="sm" variant="outline" className="ml-auto"
          onClick={() => { navigator.clipboard.writeText(json); toast.success("In Zwischenablage kopiert."); }}>
          Kopieren
        </Button>
      </div>
      <pre className="max-h-[600px] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">{json}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Duplicate button
// ---------------------------------------------------------------------------

function DuplicateButton({
  onSubmit, loading, sourceSlug,
}: { onSubmit: (v: { newSlug: string; newTitle: string }) => void; loading: boolean; sourceSlug: string }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(`${sourceSlug}-copy`);
  const [title, setTitle] = useState("Kopie");
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Copy className="mr-2 h-4 w-4" />Duplizieren</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Workflow duplizieren</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Titel</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><Label>Slug</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button disabled={loading || !slug.trim() || !title.trim()}
              onClick={() => { onSubmit({ newSlug: slug.trim(), newTitle: title.trim() }); setOpen(false); }}>
              {loading ? "Dupliziere…" : "Duplizieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Silence unused imports/hints in some environments
void ExternalLink;
