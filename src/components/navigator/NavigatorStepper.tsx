/**
 * Sprint 4.6B.1 – Sichtbarer Phasenablauf des Decision Navigators.
 * Status wird nicht ausschließlich über Farbe vermittelt.
 */
import { Check, CircleDot, Circle, Construction, SkipForward } from "lucide-react";
import { isStepAvailable } from "./NavigatorStepRenderer";
import type { NavigatorStep } from "@/services/decision-navigator";

export interface NavigatorStepperProps {
  steps: NavigatorStep[];
  currentStepId: string;
}

const STATUS_TEXT: Record<string, string> = {
  pending: "offen",
  current: "aktuelle Phase",
  completed: "abgeschlossen",
  skipped: "übersprungen",
};

export function NavigatorStepper({ steps, currentStepId }: NavigatorStepperProps) {
  return (
    <nav aria-label="Phasen der Bearbeitung">
      <ol className="flex gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentStepId;
          const available = isStepAvailable(step.id);
          const Icon =
            step.status === "completed"
              ? Check
              : step.status === "skipped"
                ? SkipForward
                : isCurrent
                  ? CircleDot
                  : available
                    ? Circle
                    : Construction;
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className={`min-w-[9.5rem] shrink-0 rounded-xl border p-2.5 text-left sm:min-w-0 ${
                isCurrent ? "border-accent bg-accent/10" : "border-border bg-card"
              }`}
            >
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                Phase {index + 1}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium text-foreground">{step.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {STATUS_TEXT[step.status] ?? step.status}
                {!available && " · noch nicht verfügbar"}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
