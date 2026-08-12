/** Sprint 4.6C – Einzelner Bewertungsgrund mit optionaler technischer Detailansicht. */
import { labelForField, type AssessmentReason } from "@/services/assessment-engine";

const IMPACT_LABEL: Record<AssessmentReason["impact"], string> = {
  critical: "Kritisches Merkmal",
  negative: "Erhöhte Aufmerksamkeit",
  neutral: "Neutral",
  positive: "Stärkt die Datengrundlage",
  informational: "Hinweis",
};

export function AssessmentReasonCard({ reason }: { reason: AssessmentReason }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">{reason.userFacingText}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {IMPACT_LABEL[reason.impact]} · Regelpriorität: {reason.priority}
      </p>
      <p className="mt-2 text-sm text-foreground/85">{reason.description}</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-foreground underline underline-offset-2">
          Technische Herkunft anzeigen
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>Regel: {reason.ruleId}</li>
          {reason.sourceFields.map((field) => (
            <li key={field}>
              {labelForField(field)} <code className="text-[11px]">({field})</code>:{" "}
              {String(reason.sourceValues[field])}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
