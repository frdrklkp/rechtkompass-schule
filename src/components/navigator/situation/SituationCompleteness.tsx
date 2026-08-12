/** Sprint 4.6B – Anzeige der Erfassungsvollständigkeit (keine Bewertung). */
import { Progress } from "@/components/ui/progress";
import type { SituationCompleteness as SituationCompletenessModel } from "@/services/situation-analyzer";

export interface SituationCompletenessProps {
  completeness: SituationCompletenessModel;
}

export function SituationCompleteness({ completeness }: SituationCompletenessProps) {
  return (
    <div className="space-y-1.5 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Erfassung: {completeness.answeredQuestions} von {completeness.totalRelevantQuestions}{" "}
          Angaben beantwortet
        </span>
        <span>
          {completeness.completionPercentage}% erfasst · {completeness.unknownQuestions} unbekannt ·{" "}
          {completeness.notApplicableQuestions} nicht zutreffend
        </span>
      </div>
      <Progress
        value={completeness.completionPercentage}
        className="h-2"
        aria-label="Vollständigkeit der Situationserfassung"
      />
      <p className="text-xs text-muted-foreground">
        {completeness.missingRequiredQuestions.length === 0
          ? "Alle sichtbaren Pflichtangaben sind bearbeitet."
          : `${completeness.missingRequiredQuestions.length} Pflichtangabe(n) offen.`}
      </p>
    </div>
  );
}
