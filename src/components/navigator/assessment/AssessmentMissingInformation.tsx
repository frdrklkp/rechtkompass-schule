/** Sprint 4.6C – Fehlende entscheidungsrelevante Angaben. */
import type { AssessmentMissingInformation } from "@/services/assessment-engine";

const SEVERITY_LABEL: Record<AssessmentMissingInformation["severity"], string> = {
  info: "Hinweis",
  relevant: "relevant",
  critical: "entscheidungsrelevant",
};

const STATUS_LABEL: Record<AssessmentMissingInformation["answerStatus"], string> = {
  unknown: "ausdrücklich unbekannt",
  notAnswered: "nicht beantwortet",
  invalid: "ungültig",
};

export function AssessmentMissingInformationList({
  items,
}: {
  items: AssessmentMissingInformation[];
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h4 className="text-sm font-semibold text-foreground">
        Fehlende Informationen ({items.length})
      </h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-foreground/85">
          Es fehlen keine der geprüften entscheidungsrelevanten Angaben.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.field} className="rounded-lg border border-border/70 p-3">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="mt-1 text-sm text-foreground/85">{item.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {SEVERITY_LABEL[item.severity]} · {STATUS_LABEL[item.answerStatus]} · benötigt für:{" "}
                {item.requiredFor}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Fehlende Angaben werden nicht automatisch ergänzt.
      </p>
    </section>
  );
}
