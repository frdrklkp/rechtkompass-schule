/** Sprint 4.6C – Kompakte Wiedergabe einer bereits vorhandenen Bewertung. */
import {
  CONFIDENCE_LABEL,
  TRAFFIC_LIGHT_LABEL,
  TRAFFIC_LIGHT_SYMBOL,
  type AssessmentResult,
} from "@/services/assessment-engine";

export function AssessmentReview({ result }: { result: AssessmentResult }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h4 className="text-sm font-semibold text-foreground">Letzte Bewertung</h4>
      <p className="mt-1 text-sm text-foreground/85">
        <span aria-hidden="true">{TRAFFIC_LIGHT_SYMBOL[result.trafficLight]} </span>
        {TRAFFIC_LIGHT_LABEL[result.trafficLight]}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {result.reasons.length} Bewertungsgrund/-gründe · Bewertungsgrundlage:{" "}
        {CONFIDENCE_LABEL[result.confidence.level]} · Stand:{" "}
        <time dateTime={result.evaluatedAt}>
          {new Date(result.evaluatedAt).toLocaleString("de-DE")}
        </time>
      </p>
    </section>
  );
}
