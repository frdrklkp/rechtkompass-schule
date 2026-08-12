import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Info,
  ListChecks,
  Loader2,
  Lock,
  Pause,
  Play,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useCancelSession,
  usePauseSession,
  useResumeSession,
  useToggleChecklist,
  useTransitionStep,
  useWorkflowEvents,
  useWorkflowSession,
} from "@/hooks/workflow/useWorkflowRuntime";
import type {
  WorkflowExecutionSession,
  WorkflowExecutionStep,
  WorkflowPhase,
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowTemplate,
} from "@/services/legal-workflows/types";
import { workflowTelemetry } from "@/services/legal-workflows/telemetry";
import { cn } from "@/lib/utils";
import { WorkflowDocumentsSection } from "@/components/workflow-documents/WorkflowDocumentsSection";

export const Route = createFileRoute("/workflows/session/$sessionId")({
  head: () => ({
    meta: [
      { title: "Workflow ausführen" },
      { name: "description", content: "Schritt-für-Schritt-Ausführung eines schulrechtlichen Handlungsleitfadens." },
    ],
  }),
  component: WorkflowRuntime,
});

function WorkflowRuntime() {
  const { sessionId } = Route.useParams();
  const { data, isLoading, isError, error } = useWorkflowSession(sessionId);
  const events = useWorkflowEvents(sessionId);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);

  useEffect(() => {
    return () => workflowTelemetry.emit({ event: "workflow_runtime_closed", sessionId });
  }, [sessionId]);

  useEffect(() => {
    if (!data || activeStepId) return;
    // Zuerst aktiven Schritt bevorzugen, sonst ersten offenen Pflichtschritt
    const stepsByPhase = data.template.phases.flatMap((p) => p.steps);
    const stateById = new Map(data.session.steps.map((s) => [s.stepId, s]));
    const active =
      stepsByPhase.find((s) => stateById.get(s.id)?.status === "active") ??
      stepsByPhase.find((s) => {
        const st = stateById.get(s.id)?.status ?? "open";
        return st !== "completed" && st !== "skipped";
      }) ??
      stepsByPhase[0];
    if (active) setActiveStepId(active.id);
  }, [data, activeStepId]);

  if (isLoading) {
    return (
      <main className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-16 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Vorgang wird geladen …
      </main>
    );
  }
  if (isError || !data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-5 w-5" /> Vorgang konnte nicht geladen werden
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {(error as Error)?.message ?? "Bitte versuchen Sie es erneut."}
          </p>
          <Button asChild variant="link" className="mt-3 -ml-2">
            <Link to="/workflows">Zurück zur Übersicht</Link>
          </Button>
        </div>
      </main>
    );
  }

  const { session, template, progress, recommendations } = data;
  const activeStep = activeStepId
    ? template.phases.flatMap((p) => p.steps).find((s) => s.id === activeStepId) ?? null
    : null;
  const stateById = new Map(session.steps.map((s) => [s.stepId, s]));

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/workflows"><ArrowLeft className="mr-2 h-4 w-4" /> Alle Leitfäden</Link>
      </Button>

      <RuntimeHeader sessionId={sessionId} session={session} template={template} progressPercent={progress.workflowPercent} openRequired={progress.requiredOpenSteps} eta={progress.estimatedRemainingMinutes} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <PhaseNav
          template={template}
          session={session}
          progress={progress}
          activeStepId={activeStepId}
          onSelect={(id) => {
            setActiveStepId(id);
            workflowTelemetry.emit({ event: "workflow_step_opened", sessionId, stepId: id });
          }}
        />

        <section className="min-w-0">
          {activeStep ? (
            <StepView
              key={activeStep.id}
              step={activeStep}
              exec={stateById.get(activeStep.id)}
              session={session}
              template={template}
              sessionId={sessionId}
            />
          ) : (
            <Card><CardContent className="p-6 text-muted-foreground">Kein Schritt ausgewählt.</CardContent></Card>
          )}

          <div className="mt-6">
            <WorkflowDocumentsSection sessionId={sessionId} />
          </div>

          <div className="mt-6">
            <Timeline events={events.data ?? []} loading={events.isLoading} />
          </div>
        </section>

        <aside className="space-y-4">
          <RecommendationsPanel
            recommendations={recommendations}
            onSelect={(id) => setActiveStepId(id)}
          />
          {activeStep && <ContextPanel step={activeStep} />}
        </aside>
      </div>
    </main>
  );
}

// ---------- Header ----------

function RuntimeHeader({
  sessionId,
  session,
  template,
  progressPercent,
  openRequired,
  eta,
}: {
  sessionId: string;
  session: WorkflowExecutionSession;
  template: WorkflowTemplate;
  progressPercent: number;
  openRequired: number;
  eta: number;
}) {
  const pause = usePauseSession(sessionId);
  const resume = useResumeSession(sessionId);
  const cancel = useCancelSession(sessionId);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const statusLabel: Record<typeof session.status, string> = {
    draft: "Entwurf",
    ready: "Bereit",
    running: "In Bearbeitung",
    paused: "Pausiert",
    completed: "Abgeschlossen",
    cancelled: "Beendet",
  };

  const isTerminal = session.status === "completed" || session.status === "cancelled";

  return (
    <header className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isTerminal ? "secondary" : "default"}>{statusLabel[session.status]}</Badge>
            {template.publicationTier === "public" && <Badge variant="outline">Öffentlich</Badge>}
          </div>
          <h1 className="mt-2 truncate text-2xl font-bold tracking-tight">{template.title}</h1>
          {template.subtitle && (
            <p className="text-sm text-muted-foreground">{template.subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {session.status === "running" && (
            <Button variant="outline" size="sm" onClick={() => pause.mutate()} disabled={pause.isPending}>
              <Pause className="mr-1 h-4 w-4" /> Pausieren
            </Button>
          )}
          {session.status === "paused" && (
            <Button variant="outline" size="sm" onClick={() => resume.mutate()} disabled={resume.isPending}>
              <Play className="mr-1 h-4 w-4" /> Fortsetzen
            </Button>
          )}
          {!isTerminal && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)}>
              <X className="mr-1 h-4 w-4" /> Beenden
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Fortschritt: {progressPercent}%</span>
          <span className="flex items-center gap-3">
            <span>{openRequired} offene Pflichtschritte</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> ca. {eta} min verbleibend
            </span>
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorgang beenden?</AlertDialogTitle>
            <AlertDialogDescription>
              Sie können den Vorgang später nicht wieder aufnehmen. Die Dokumentation bleibt erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancel.mutate(undefined)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ja, beenden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

// ---------- Phase Navigation ----------

function PhaseNav({
  template,
  session,
  progress,
  activeStepId,
  onSelect,
}: {
  template: WorkflowTemplate;
  session: WorkflowExecutionSession;
  progress: { phases: Array<{ phaseId: string; percent: number; requiredOpen: number }> };
  activeStepId: string | null;
  onSelect: (id: string) => void;
}) {
  const stateById = useMemo(
    () => new Map(session.steps.map((s) => [s.stepId, s])),
    [session.steps],
  );
  const phasePct = new Map(progress.phases.map((p) => [p.phaseId, p.percent]));

  return (
    <nav className="rounded-xl border bg-card p-3">
      <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Phasen
      </h2>
      <ol className="space-y-3">
        {template.phases.map((phase, i) => (
          <li key={phase.id}>
            <div className="flex items-center justify-between gap-2 px-2 text-sm font-medium">
              <span className="truncate">
                <span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                {phase.title}
              </span>
              <span className="text-xs text-muted-foreground">{phasePct.get(phase.id) ?? 0}%</span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {phase.steps.map((step) => {
                const status = stateById.get(step.id)?.status ?? "open";
                const isActive = step.id === activeStepId;
                const blocked = status === "blocked";
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(step.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                        blocked && "opacity-70",
                      )}
                    >
                      <StatusDot status={status} />
                      <span className="truncate">{step.title}</span>
                      {!step.isRequired && (
                        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">opt.</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StatusDot({ status }: { status: WorkflowStepStatus }) {
  if (status === "completed")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (status === "skipped") return <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" />;
  if (status === "blocked") return <Lock className="h-4 w-4 shrink-0 text-amber-600" />;
  if (status === "active") return <ChevronRight className="h-4 w-4 shrink-0 text-primary" />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

// ---------- Step View ----------

function StepView({
  step,
  exec,
  session,
  template,
  sessionId,
}: {
  step: WorkflowStep;
  exec: WorkflowExecutionStep | undefined;
  session: WorkflowExecutionSession;
  template: WorkflowTemplate;
  sessionId: string;
}) {
  const transition = useTransitionStep(sessionId);
  const toggleChk = useToggleChecklist(sessionId);
  const status = exec?.status ?? "open";
  const isTerminal = status === "completed" || status === "skipped";
  const sessionActive = session.status === "running" || session.status === "ready";

  const done = new Set(
    session.steps.filter((x) => x.status === "completed" || x.status === "skipped").map((x) => x.stepId),
  );
  const missingDeps = step.dependsOn.filter((d) => !done.has(d));
  const depTitles = missingDeps
    .map((id) => template.phases.flatMap((p) => p.steps).find((s) => s.id === id)?.title ?? id);

  const checklistState = new Map((exec?.checklistState ?? []).map((c) => [c.itemId, c]));
  const checklistDone = step.checklists.filter((i) => checklistState.get(i.id)?.done).length;
  const requiredChecklistOpen = step.checklists.filter(
    (i) => i.isRequired && !checklistState.get(i.id)?.done,
  ).length;

  const stepTypeLabel: Record<WorkflowStep["stepType"], string> = {
    information: "Information",
    decision: "Entscheidung",
    action: "Handlung",
    document: "Dokument",
    review: "Prüfung",
    communication: "Kommunikation",
    wait: "Wartezeit",
  };

  const canComplete = missingDeps.length === 0 && requiredChecklistOpen === 0 && sessionActive && !isTerminal;
  const canStart = missingDeps.length === 0 && sessionActive && status === "open";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{stepTypeLabel[step.stepType]}</Badge>
          {step.isRequired ? (
            <Badge variant="secondary">Pflicht</Badge>
          ) : (
            <Badge variant="outline">Optional</Badge>
          )}
          {step.priority === "high" && <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">Hohe Priorität</Badge>}
          {step.priority === "critical" && <Badge variant="destructive">Kritisch</Badge>}
          {step.estimatedMinutes && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> ca. {step.estimatedMinutes} min
            </span>
          )}
        </div>
        <CardTitle className="mt-2 text-xl">{step.title}</CardTitle>
        {step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
      </CardHeader>
      <CardContent className="space-y-5">
        {step.goal && (
          <div className="rounded-lg border-l-4 border-primary/60 bg-primary/5 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-primary">Ziel</div>
            <p className="mt-1 text-sm">{step.goal}</p>
          </div>
        )}

        {missingDeps.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
            <div className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
              <Lock className="h-4 w-4" /> Voraussetzung fehlt
            </div>
            <ul className="mt-1 list-disc pl-6 text-xs text-amber-900/90 dark:text-amber-200/90">
              {depTitles.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}

        {step.checklists.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Checkliste</h3>
              <span className="text-xs text-muted-foreground">
                {checklistDone}/{step.checklists.length}
              </span>
            </div>
            <ul className="space-y-2">
              {step.checklists.map((item) => {
                const cst = checklistState.get(item.id);
                const isDone = !!cst?.done;
                return (
                  <li key={item.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-accent/40">
                    <Checkbox
                      checked={isDone}
                      disabled={!sessionActive || isTerminal || toggleChk.isPending}
                      onCheckedChange={(v) =>
                        toggleChk.mutate({ stepId: step.id, itemId: item.id, done: !!v })
                      }
                      className="mt-0.5"
                      aria-label={item.title}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm", isDone && "text-muted-foreground line-through")}>
                        {item.title}
                        {item.isRequired && !isDone && (
                          <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">*</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Status: <span className="font-medium capitalize text-foreground">{status}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {canStart && (
              <Button
                variant="outline"
                onClick={() => transition.mutate({ stepId: step.id, to: "active" })}
                disabled={transition.isPending}
              >
                <Play className="mr-1 h-4 w-4" /> Bearbeitung beginnen
              </Button>
            )}
            {!step.isRequired && !isTerminal && sessionActive && (
              <Button
                variant="ghost"
                onClick={() => transition.mutate({ stepId: step.id, to: "skipped" })}
                disabled={transition.isPending}
              >
                <SkipForward className="mr-1 h-4 w-4" /> Überspringen
              </Button>
            )}
            {!isTerminal && (
              <Button
                onClick={() => transition.mutate({ stepId: step.id, to: "completed" })}
                disabled={!canComplete || transition.isPending}
              >
                {transition.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                )}
                Schritt abschließen
              </Button>
            )}
            {isTerminal && sessionActive && (
              <Button
                variant="outline"
                onClick={() => transition.mutate({ stepId: step.id, to: "active" })}
                disabled={transition.isPending}
              >
                Erneut öffnen
              </Button>
            )}
          </div>
        </div>
        {!canComplete && !isTerminal && requiredChecklistOpen > 0 && (
          <p className="text-xs text-muted-foreground">
            Noch {requiredChecklistOpen} verpflichtende Prüfpunkte offen.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Context Panel ----------

function ContextPanel({ step }: { step: WorkflowStep }) {
  const hasDocs = step.documents.length > 0;
  const hasSources = step.sources.length > 0;
  if (!hasDocs && !hasSources) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Hilfsmittel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {hasDocs && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Dokumentvorschläge
            </div>
            <ul className="space-y-1">
              {step.documents.map((d) => (
                <li key={d.id} className="rounded-md border bg-background px-2 py-1.5">
                  <div className="font-medium">{d.title}</div>
                  {d.note && <div className="text-xs text-muted-foreground">{d.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {hasSources && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" /> Rechtsgrundlagen
            </div>
            <ul className="space-y-1">
              {step.sources.map((s) => (
                <li key={s.id} className="rounded-md border bg-background px-2 py-1.5 text-xs">
                  <div className="font-medium">{s.citationHint ?? s.legalSectionId ?? "Quelle"}</div>
                  {s.note && <div className="text-muted-foreground">{s.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Recommendations ----------

function RecommendationsPanel({
  recommendations,
  onSelect,
}: {
  recommendations: Array<{ stepId: string; reason: string; priority: string; riskLevel: string }>;
  onSelect: (stepId: string) => void;
}) {
  if (recommendations.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" /> Empfehlung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recommendations.slice(0, 3).map((r, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(r.stepId)}
            className="w-full rounded-md border bg-background p-2 text-left text-sm hover:bg-accent"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {r.priority}
              </span>
              {r.riskLevel === "high" && <Badge variant="destructive" className="text-[10px]">Risiko hoch</Badge>}
            </div>
            <p className="mt-1 text-xs">{r.reason}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------- Timeline ----------

function Timeline({
  events,
  loading,
}: {
  events: Array<{ id: string; eventType: string; at: string; payload: Record<string, unknown> }>;
  loading: boolean;
}) {
  if (loading) return null;
  if (events.length === 0) return null;
  const label: Record<string, string> = {
    workflow_started: "Vorgang gestartet",
    workflow_paused: "Pausiert",
    workflow_resumed: "Fortgesetzt",
    workflow_cancelled: "Beendet",
    workflow_completed: "Abgeschlossen",
    workflow_step_started: "Schritt begonnen",
    workflow_step_completed: "Schritt abgeschlossen",
    workflow_step_skipped: "Schritt übersprungen",
    workflow_step_blocked: "Schritt blockiert",
    workflow_blocked: "Vorgang blockiert",
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListChecks className="h-4 w-4" /> Verlauf
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm">
          {events
            .slice()
            .reverse()
            .slice(0, 20)
            .map((ev) => (
              <li key={ev.id} className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {new Date(ev.at).toLocaleString("de-DE")}
                  </div>
                  <div>{label[ev.eventType] ?? ev.eventType}</div>
                </div>
              </li>
            ))}
        </ol>
      </CardContent>
    </Card>
  );
}
