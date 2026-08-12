/** Sprint 4.6B – Zusammenfassung der Prüfhinweise. */
import { AlertCircle } from "lucide-react";
import type { SituationValidationIssue } from "@/services/situation-analyzer";

export interface SituationValidationSummaryProps {
  issues: SituationValidationIssue[];
}

export function SituationValidationSummary({ issues }: SituationValidationSummaryProps) {
  if (issues.length === 0) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {issues.length} Angabe(n) müssen noch ergänzt oder korrigiert werden
      </p>
      <ul className="list-disc space-y-1 pl-5 text-xs text-foreground/90">
        {issues.map((issue, i) => (
          <li key={`${issue.code}-${issue.questionId ?? i}`}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}
