/** Sprint 4.6C – Erkannte Konflikte werden sichtbar ausgewiesen, nicht verborgen. */
import { labelForField, type AssessmentConflict } from "@/services/assessment-engine";

export function AssessmentConflictList({ conflicts }: { conflicts: AssessmentConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
      <h4 className="text-sm font-semibold text-foreground">
        Erkannte Widersprüche ({conflicts.length})
      </h4>
      <ul className="mt-2 space-y-2">
        {conflicts.map((conflict) => (
          <li key={conflict.id} className="rounded-lg border border-border/70 bg-card p-3">
            <p className="text-sm text-foreground">{conflict.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {conflict.blocksAssessment
                ? "Dieser Widerspruch verhindert eine eindeutige Einstufung."
                : "Dieser Widerspruch wurde über die Regelpriorität aufgelöst."}
              {conflict.fields.length > 0 &&
                ` Betroffene Angaben: ${conflict.fields.map(labelForField).join(", ")}.`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
