/** Sprint 4.6C – Zusammenfassung der Bewertung (rein darstellend). */
import { SEVERITY_LABEL, type AssessmentResult } from "@/services/assessment-engine";

export function AssessmentSummary({ result }: { result: AssessmentResult }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h4 className="text-sm font-semibold text-foreground">Bewertungszusammenfassung</h4>
      <p className="mt-2 text-sm text-foreground/85">{result.summary}</p>
      <dl className="mt-3 grid gap-2 text-xs text-foreground/85 sm:grid-cols-2">
        <div>
          <dt className="font-medium">Schweregrad (intern)</dt>
          <dd>{SEVERITY_LABEL[result.severity]}</dd>
        </div>
        <div>
          <dt className="font-medium">Zeitpunkt der Bewertung</dt>
          <dd>
            <time dateTime={result.evaluatedAt}>
              {new Date(result.evaluatedAt).toLocaleString("de-DE")}
            </time>
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Der Schweregrad dient der internen Sortierung und ist keine rechtlich verbindliche
        Einstufung.
      </p>
    </section>
  );
}
