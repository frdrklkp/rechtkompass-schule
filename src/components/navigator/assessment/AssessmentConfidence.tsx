/** Sprint 4.6C – Aussagekraft der Datengrundlage (nicht: Rechtssicherheit). */
import { CONFIDENCE_LABEL, type AssessmentConfidence } from "@/services/assessment-engine";

export function AssessmentConfidencePanel({ confidence }: { confidence: AssessmentConfidence }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h4 className="text-sm font-semibold text-foreground">Aussagekraft der Erfassung</h4>
      <p className="mt-1 text-sm text-foreground/85">
        Bewertungsgrundlage: {CONFIDENCE_LABEL[confidence.level]} ({confidence.score} von 100)
      </p>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Bewertungsgrundlage ${confidence.score} von 100, Stufe ${CONFIDENCE_LABEL[confidence.level]}`}
      >
        <div className="h-full bg-primary" style={{ width: `${confidence.score}%` }} />
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-foreground/85 sm:grid-cols-3">
        <div>
          <dt className="font-medium">Vollständigkeit</dt>
          <dd>{confidence.dataCompleteness} %</dd>
        </div>
        <div>
          <dt className="font-medium">Regelabdeckung</dt>
          <dd>{confidence.ruleCoverage} %</dd>
        </div>
        <div>
          <dt className="font-medium">Offene Angaben</dt>
          <dd>{confidence.uncertaintyCount}</dd>
        </div>
      </dl>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        {confidence.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Dieser Wert beschreibt ausschließlich, wie vollständig und eindeutig die erfassten Angaben
        ausgewertet werden konnten. Er beschreibt keine juristische Sicherheit.
      </p>
    </section>
  );
}
