/**
 * Sprint 4.6B.1 – Sichtbarer Phasenablauf des Decision Navigators.
 * Status wird nicht ausschließlich über Farbe vermittelt.
 *
 * Fund 2026-08-19 (UX-Review): bislang wurden Fortschrittsbalken und
 * Phasen-Chips gleichzeitig, aber getrennt angezeigt - besonders auf dem
 * Handy kostet das doppelt Bildschirmplatz. Die knappe Fortschrittszeile
 * ist jetzt Teil dieser Komponente statt eines eigenen Elements. Bereits
 * besuchte Phasen (abgeschlossen/übersprungen/aktuell) sind anklickbar und
 * springen direkt dorthin (nutzt den bereits vorhandenen, bereits über
 * "Dorthin springen" im Abschluss-Schritt genutzten goTo()-Mechanismus).
 * Offene, noch nicht besuchte Phasen bleiben bewusst nicht anklickbar, um
 * kein versehentliches Vorspringen zu ermöglichen.
 */
import { Check, CircleDot, Circle, Construction, SkipForward } from "lucide-react";
import { isStepAvailable } from "./NavigatorStepRenderer";
import type { NavigatorProgress, NavigatorStep } from "@/services/decision-navigator";

export interface NavigatorStepperProps {
  steps: NavigatorStep[];
  currentStepId: string;
  progress?: NavigatorProgress;
  onSelect?: (stepId: string) => void;
}

const STATUS_TEXT: Record<string, string> = {
  pending: "offen",
  current: "aktuelle Phase",
  completed: "abgeschlossen",
  skipped: "übersprungen",
};

const VISITED_STATUSES = new Set(["completed", "skipped", "current"]);

export function NavigatorStepper({ steps, currentStepId, progress, onSelect }: NavigatorStepperProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);
  return (
    <nav aria-label="Phasen der Bearbeitung">
      {progress && (
        <p className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Schritt {Math.max(currentIndex, 0) + 1} von {progress.totalSteps}
          </span>
          <span>
            {progress.percent}% · {progress.openSteps} offen
          </span>
        </p>
      )}
      <ol className="flex gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentStepId;
          const available = isStepAvailable(step.id);
          const isClickable = Boolean(onSelect) && available && VISITED_STATUSES.has(step.status);
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
          const content = (
            <>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                Phase {index + 1}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium text-foreground">{step.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {STATUS_TEXT[step.status] ?? step.status}
                {!available && " · noch nicht verfügbar"}
              </p>
            </>
          );
          const className = `min-w-[9.5rem] shrink-0 rounded-xl border p-2.5 text-left sm:min-w-0 ${
            isCurrent ? "border-accent bg-accent/10" : "border-border bg-card"
          } ${isClickable ? "cursor-pointer hover:border-accent/60" : ""}`;
          return (
            <li key={step.id} aria-current={isCurrent ? "step" : undefined} className={className}>
              {isClickable ? (
                <button type="button" onClick={() => onSelect?.(step.id)} className="w-full text-left">
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
