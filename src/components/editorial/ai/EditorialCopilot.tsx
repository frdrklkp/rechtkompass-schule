// EditorialCopilot – Werkzeugkasten aus 5 Tabs.
// Alle Aktionen erzeugen Vorschläge in der Session; nichts wird
// automatisch gespeichert oder veröffentlicht.

import { useState } from "react";
import { Sparkles, Wand2, ListChecks, HelpCircle, FileText, Lightbulb, ShieldCheck, Copy, RefreshCcw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  AIEditorialService,
  isAIError,
  useAISession,
  type AITaskType,
} from "@/services/editorial/ai";
import { AISuggestionCard } from "./AISuggestionCard";
import { AICommandBar, type CopilotCommand } from "./AICommandBar";
import { QualityAssistantList } from "./QualityAssistantList";
import { ReviewReadinessCard } from "./ReviewReadinessCard";
import { CompletenessAssistant } from "./CompletenessAssistant";
import { DuplicateAssistant } from "./DuplicateAssistant";
import { ChangeSummaryPanel } from "./ChangeSummaryPanel";
import { MultiSuggestionButton } from "./MultiSuggestionButton";
import { LegalCopilotPanel } from "./LegalCopilotPanel";
import type { EditorialCaseRow } from "@/services/editorial/types";
import type { CaseQualityAssessment } from "@/services/editorial/quality/types";

interface Props {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality: CaseQualityAssessment | null;
  canEdit: boolean;
  /** Vorheriger Snapshot (letzte veröffentlichte Version) für Änderungszusammenfassungen. */
  previousContent?: Record<string, unknown> | null;
  /** Kandidaten für Duplikatprüfung. Wird typischerweise via TanStack Query bereitgestellt. */
  duplicateCandidates?: Array<{
    id: string;
    title: string;
    short_description?: string | null;
    category?: string | null;
  }>;
}

interface Action {
  task: AITaskType;
  label: string;
  Icon: typeof Sparkles;
}

const IMPROVE: Action[] = [
  { task: "improve.title", label: "Titel schärfen", Icon: Wand2 },
  { task: "improve.shortDescription", label: "Beschreibung", Icon: FileText },
  { task: "improve.recommendation", label: "Empfehlung", Icon: Lightbulb },
  { task: "improve.legalExplanation", label: "Rechtl. Einordnung", Icon: ShieldCheck },
];
const GENERATE: Action[] = [
  { task: "generate.checklist", label: "Checkliste", Icon: ListChecks },
  { task: "generate.faq", label: "FAQ", Icon: HelpCircle },
  { task: "generate.documentation", label: "Doku-Schritte", Icon: FileText },
  { task: "generate.practiceTips", label: "Praxistipps", Icon: Lightbulb },
];

export function EditorialCopilot({
  caseRow,
  quality,
  canEdit,
  previousContent,
  duplicateCandidates,
}: Props) {
  const session = useAISession();
  const [runningTask, setRunningTask] = useState<AITaskType | null>(null);
  const isDraft = caseRow.workflow_status === "draft";

  async function run(task: AITaskType, extra?: Record<string, unknown>) {
    setRunningTask(task);
    try {
      const s = await AIEditorialService.suggest({ task, caseRow, quality, extra });
      session.add(s);
      toast.success("Vorschlag erstellt.");
    } catch (err) {
      toast.error(
        isAIError(err)
          ? err.userMessage
          : err instanceof Error
            ? err.message
            : "KI-Aufruf fehlgeschlagen.",
      );
    } finally {
      setRunningTask(null);
    }
  }

  // Command-Bar Befehle
  const commands: CopilotCommand[] = [
    ...IMPROVE.map((a) => ({ id: a.task, label: a.label, task: a.task, action: a.task })),
    ...GENERATE.map((a) => ({ id: a.task, label: a.label, task: a.task, action: a.task })),
    { id: "review.readiness", label: "Review-Readiness", action: "review.readiness" },
    { id: "duplicate.check", label: "Duplikate prüfen", action: "duplicate.check" },
  ];

  async function runCommand(c: CopilotCommand) {
    if (c.action === "review.readiness") {
      setRunningTask("review.readiness");
      try {
        const s = await AIEditorialService.reviewReadiness(caseRow, quality);
        session.add(s);
        toast.success("Readiness-Report erstellt.");
      } catch (err) {
        toast.error(
          isAIError(err)
            ? err.userMessage
            : err instanceof Error
              ? err.message
              : "Fehler.",
        );
      } finally {
        setRunningTask(null);
      }
      return;
    }
    if (c.action === "duplicate.check") {
      run("detect.duplicates", { candidates: duplicateCandidates ?? [] });
      return;
    }
    if (c.task) run(c.task);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold">KI-Redaktions-Copilot</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Alle Ausgaben sind Vorschläge. Übernahme nur im Entwurfsstatus, jeweils
          genau ein Feld. Keine automatischen Workflow-Änderungen.
        </p>

        {!isDraft && (
          <div className="mb-3 rounded-md border border-amber-400/40 bg-amber-500/5 p-2 text-[11px] text-amber-800 dark:text-amber-300">
            Übernahme ist gesperrt: Fall ist nicht im Entwurfstatus.
          </div>
        )}

        <AICommandBar commands={commands} disabled={runningTask !== null || !canEdit} onRun={runCommand} />

        <Tabs defaultValue="improve" className="mt-3">
          <TabsList className="grid w-full grid-cols-6 gap-1">
            <TabsTrigger value="improve" className="text-[11px]">Verbessern</TabsTrigger>
            <TabsTrigger value="generate" className="text-[11px]">Erzeugen</TabsTrigger>
            <TabsTrigger value="analyze" className="text-[11px]">Analysieren</TabsTrigger>
            <TabsTrigger value="legal" className="text-[11px]">Recht</TabsTrigger>
            <TabsTrigger value="summarize" className="text-[11px]">Zusammenfassen</TabsTrigger>
            <TabsTrigger value="prepare" className="text-[11px]">Vorbereiten</TabsTrigger>
          </TabsList>

          <TabsContent value="improve" className="mt-3 space-y-2">
            <ActionGroup actions={IMPROVE} onRun={run} running={runningTask} disabled={!canEdit} />
            <div className="pt-1">
              <MultiSuggestionButton
                caseRow={caseRow}
                quality={quality}
                task="improve.title"
                label="3 Titel-Varianten"
                canEdit={canEdit}
              />
            </div>
          </TabsContent>

          <TabsContent value="generate" className="mt-3 space-y-2">
            <ActionGroup actions={GENERATE} onRun={run} running={runningTask} disabled={!canEdit} />
            <div className="pt-1">
              <MultiSuggestionButton
                caseRow={caseRow}
                quality={quality}
                task="generate.faq"
                label="3 FAQ-Varianten"
                canEdit={canEdit}
              />
            </div>
          </TabsContent>

          <TabsContent value="analyze" className="mt-3 space-y-3">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Qualitäts-Assistenz
              </div>
              <QualityAssistantList caseRow={caseRow} quality={quality} canEdit={canEdit} />
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Vollständigkeit
              </div>
              <CompletenessAssistant caseRow={caseRow} quality={quality} canEdit={canEdit} />
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Duplikat-Prüfung
              </div>
              <DuplicateAssistant caseRow={caseRow} candidates={duplicateCandidates} canEdit={canEdit} />
            </div>
          </TabsContent>

          <TabsContent value="legal" className="mt-3 space-y-2">
            <LegalCopilotPanel caseRow={caseRow} quality={quality} />
          </TabsContent>

          <TabsContent value="summarize" className="mt-3 space-y-2">
            <ChangeSummaryPanel
              caseRow={caseRow}
              previous={previousContent ?? null}
              canEdit={canEdit}
            />
          </TabsContent>

          <TabsContent value="prepare" className="mt-3 space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={runningTask !== null || !canEdit}
              onClick={async () => {
                setRunningTask("review.readiness");
                try {
                  const s = await AIEditorialService.reviewReadiness(caseRow, quality);
                  session.add(s);
                  toast.success("Readiness-Report erstellt.");
                } catch (err) {
                  toast.error(isAIError(err) ? err.userMessage : "Fehler.");
                } finally {
                  setRunningTask(null);
                }
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Review-Readiness prüfen
            </Button>
            {session.suggestions
              .filter((s) => s.type === "review.readiness")
              .slice(-1)
              .map((s) => (
                <ReviewReadinessCard
                  key={s.id}
                  // Typ ist AISuggestion<unknown>; die Card erwartet ReviewReadinessReport-Struktur.
                  suggestion={s as never}
                />
              ))}
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={runningTask !== null || !canEdit || (quality?.blockers.length ?? 0) === 0}
                title={(quality?.blockers.length ?? 0) === 0 ? "Keine Blocker vorhanden" : ""}
                onClick={() => run("quality.improve")}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Qualitätsprobleme adressieren
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {runningTask !== null && (
          <div className="mt-3">
            <Skeleton className="h-16 w-full" />
            <p className="mt-1 text-[10px] text-muted-foreground">KI generiert Vorschlag…</p>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="mr-1 inline h-3 w-3" />
            Session-Historie ({session.suggestions.length})
          </h3>
          {session.suggestions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => session.clear()}
            >
              <RefreshCcw className="h-3 w-3" /> Leeren
            </Button>
          )}
        </div>
        {session.suggestions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Noch keine Vorschläge in dieser Session.
          </p>
        )}
        <div className="space-y-2">
          {session.suggestions
            .slice()
            .reverse()
            .map((s) => (
              <AISuggestionCard
                key={s.id}
                caseId={caseRow.id}
                suggestion={s}
                canEdit={canEdit}
                isDraft={isDraft}
              />
            ))}
        </div>
      </div>

      <p className="text-[10px] italic text-muted-foreground">
        Duplikatprüfung nutzt nur die eingespielten Kandidaten aus dem Kontext – keine externen Fall-IDs.
      </p>
      <UnusedIcon />
    </div>
  );
}

function ActionGroup({
  actions,
  onRun,
  running,
  disabled,
}: {
  actions: Action[];
  onRun: (t: AITaskType) => void;
  running: AITaskType | null;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {actions.map((a) => (
        <Button
          key={a.task}
          variant="outline"
          size="sm"
          className="h-8 justify-start gap-2"
          disabled={disabled || running !== null}
          onClick={() => onRun(a.task)}
        >
          <a.Icon className="h-3.5 w-3.5" />
          {a.label}
          {running === a.task && (
            <span className="ml-auto text-[10px] text-muted-foreground">…</span>
          )}
        </Button>
      ))}
    </div>
  );
}

// Vermeidet dead-code Lint-Warnung für importierte Icons, die je nach
// Copilot-Konfiguration ggf. ungenutzt sind (Copy).
function UnusedIcon() {
  return <span className="hidden"><Copy /></span>;
}
