/** Sprint 4.5H – Fortschrittsanzeige der Importphasen. */
import { Check, Loader2, Circle, AlertTriangle } from "lucide-react";
import {
  IMPORT_STEPS,
  progressRatio,
  stepStates,
  type ImportStepId,
} from "@/services/legal-knowledge/import-experience";

export function ImportProgressStepper({
  currentStep,
  failed = false,
  message,
}: {
  currentStep: ImportStepId;
  failed?: boolean;
  message?: string;
}) {
  const states = stepStates(currentStep, { failed });
  const ratio = failed ? progressRatio(currentStep) : progressRatio(currentStep);
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
        <div
          className={`h-full transition-all ${failed ? "bg-rose-500" : "bg-accent"}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <ol className="grid gap-1 sm:grid-cols-3">
        {states.map(({ step, state }) => (
          <li key={step.id} className="flex items-center gap-2 text-[11px]">
            {state === "done" && <Check className="h-3.5 w-3.5 text-emerald-600" />}
            {state === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
            {state === "failed" && <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
            {state === "pending" && <Circle className="h-3 w-3 text-muted-foreground/50" />}
            <span className={state === "pending" ? "text-muted-foreground" : "font-medium"}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-muted-foreground">
        {message ?? IMPORT_STEPS.find((s) => s.id === currentStep)?.description}
      </p>
    </div>
  );
}
