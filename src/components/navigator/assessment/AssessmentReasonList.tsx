/** Sprint 4.6C – Liste der Bewertungsgründe (tastaturzugänglich). */
import { AssessmentReasonCard } from "./AssessmentReasonCard";
import type { AssessmentReason } from "@/services/assessment-engine";

export function AssessmentReasonList({ reasons }: { reasons: AssessmentReason[] }) {
  if (reasons.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <h4 className="text-sm font-semibold text-foreground">Bewertungsgründe</h4>
        <p className="mt-2 text-sm text-foreground/85">
          Auf die erfassten Angaben hat keine Bewertungsregel zugetroffen.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">
        Bewertungsgründe ({reasons.length})
      </h4>
      <ul className="space-y-2">
        {reasons.map((reason) => (
          <AssessmentReasonCard key={reason.id} reason={reason} />
        ))}
      </ul>
    </section>
  );
}
