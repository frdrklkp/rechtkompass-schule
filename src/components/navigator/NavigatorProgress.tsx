/** Sprint 4.6A – Fortschrittsanzeige des Decision Navigators. */
import { Progress } from "@/components/ui/progress";
import type { NavigatorProgress } from "@/services/decision-navigator";

export interface NavigatorProgressProps {
  progress: NavigatorProgress;
  stepIndex?: number;
}

export function NavigatorProgressBar({ progress, stepIndex }: NavigatorProgressProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {typeof stepIndex === "number"
            ? `Schritt ${stepIndex + 1} von ${progress.totalSteps}`
            : `${progress.totalSteps} Schritte`}
        </span>
        <span>
          {progress.percent}% · {progress.openSteps} offen
        </span>
      </div>
      <Progress value={progress.percent} className="h-2" />
    </div>
  );
}
