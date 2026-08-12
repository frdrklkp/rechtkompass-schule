// EditorialAIPanel – Sidebar-Panel für redaktionelle KI-Unterstützung.
// Vorschläge werden nur session-basiert gehalten. Keine automatische Übernahme.

import { useState } from "react";
import { Sparkles, Wand2, ListChecks, HelpCircle, FileText, Lightbulb, ShieldCheck, RefreshCcw, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  AIEditorialService,
  isAIError,
  useAISession,
  type AITaskType,
} from "@/services/editorial/ai";
import { AISuggestionCard } from "./AISuggestionCard";
import type { EditorialCaseRow } from "@/services/editorial/types";
import type { CaseQualityAssessment } from "@/services/editorial/quality/types";

interface Props {
  caseRow: EditorialCaseRow & Record<string, unknown>;
  quality: CaseQualityAssessment | null;
  canEdit: boolean;
}

interface Action {
  task: AITaskType;
  label: string;
  Icon: typeof Sparkles;
  needsField?: string;
}

const IMPROVE_ACTIONS: Action[] = [
  { task: "improve.title", label: "Titel schärfen", Icon: Wand2 },
  { task: "improve.shortDescription", label: "Beschreibung erweitern", Icon: FileText },
  { task: "improve.recommendation", label: "Empfehlung verbessern", Icon: Lightbulb },
  { task: "improve.legalExplanation", label: "Rechtl. Einordnung verbessern", Icon: ShieldCheck },
];
const GENERATE_ACTIONS: Action[] = [
  { task: "generate.checklist", label: "Checkliste generieren", Icon: ListChecks },
  { task: "generate.faq", label: "FAQ generieren", Icon: HelpCircle },
  { task: "generate.documentation", label: "Doku-Schritte generieren", Icon: FileText },
  { task: "generate.practiceTips", label: "Do's generieren", Icon: Lightbulb },
];

export function EditorialAIPanel({ caseRow, quality, canEdit }: Props) {
  const session = useAISession();
  const [runningTask, setRunningTask] = useState<AITaskType | null>(null);

  const isDraft = caseRow.workflow_status === "draft";

  async function run(task: AITaskType, extra?: Record<string, unknown>) {
    setRunningTask(task);
    try {
      const suggestion = await AIEditorialService.suggest({
        task,
        caseRow,
        quality,
        extra,
      });
      session.add(suggestion);
      toast.success("Vorschlag erstellt.");
    } catch (err) {
      const msg = isAIError(err) ? err.userMessage : err instanceof Error ? err.message : "KI-Aufruf fehlgeschlagen.";
      toast.error(msg);
    } finally {
      setRunningTask(null);
    }
  }

  const hasBlockers = (quality?.blockers.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold">KI-Redaktionsassistent</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Alle Ausgaben sind Vorschläge. Übernahme ist nur im Entwurfstatus möglich
          und schreibt genau ein Feld. Keine automatischen Workflow-Änderungen.
        </p>

        {!isDraft && (
          <div className="mb-3 rounded-md border border-amber-400/40 bg-amber-500/5 p-2 text-[11px] text-amber-800 dark:text-amber-300">
            Übernahme ist gesperrt: Fall ist nicht im Entwurfstatus.
          </div>
        )}

        <div className="space-y-3">
          <ActionGroup
            title="Texte verbessern"
            actions={IMPROVE_ACTIONS}
            onRun={run}
            running={runningTask}
            disabled={!canEdit}
          />
          <ActionGroup
            title="Inhalte generieren"
            actions={GENERATE_ACTIONS}
            onRun={run}
            running={runningTask}
            disabled={!canEdit}
          />

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Redaktion &amp; Review
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-2"
                disabled={runningTask !== null}
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

              <Button
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-2"
                disabled={runningTask !== null || !hasBlockers}
                title={!hasBlockers ? "Keine Blocker vorhanden" : ""}
                onClick={() => run("quality.improve")}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Qualitätsprobleme adressieren
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-2"
                disabled={runningTask !== null}
                onClick={() =>
                  run("detect.duplicates", { candidates: [] })
                }
              >
                <Copy className="h-3.5 w-3.5" />
                Duplikate prüfen
              </Button>
            </div>
          </div>
        </div>

        {runningTask !== null && (
          <div className="mt-3">
            <Skeleton className="h-16 w-full" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              KI generiert Vorschlag…
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Session-Historie ({session.suggestions.length})
          </h3>
          {session.suggestions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => session.clear()}
            >
              <RefreshCcw className="h-3 w-3" />
              Leeren
            </Button>
          )}
        </div>
        {session.suggestions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Noch keine Vorschläge in dieser Session.
          </p>
        )}
        <div className="space-y-2">
          {session.suggestions.map((s) => (
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
    </div>
  );
}

function ActionGroup({
  title,
  actions,
  onRun,
  running,
  disabled,
}: {
  title: string;
  actions: Action[];
  onRun: (t: AITaskType) => void;
  running: AITaskType | null;
  disabled: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
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
    </div>
  );
}
