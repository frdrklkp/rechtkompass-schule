/**
 * Sprint 4.6G – Kopfbereich der Rechtsgrundlagen-Phase.
 * Zeigt Bezug zum Praxisfall, Anzahl und Herkunft der Rechtsgrundlagen.
 * Technische Angaben (IDs, Hash) erscheinen nur in der Detailansicht.
 */
import { Scale } from "lucide-react";
import { LegalContextExplainer, type LegalContextResult } from "@/services/legal-context";
import { formatDateDe } from "./legalPresentation";

const explainer = new LegalContextExplainer();

export function LegalContextHeader({ result }: { result: LegalContextResult }) {
  const source = result.source;
  const count = result.references.length;
  const countLabel =
    count === 1
      ? "1 mit diesem Praxisfall verknüpfte Rechtsgrundlage"
      : `${count} mit diesem Praxisfall verknüpfte Rechtsgrundlagen`;

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Überblick">
      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Scale className="h-4 w-4 text-accent" aria-hidden="true" />
        Rechtsgrundlagen
      </h3>

      {source.kind === "practice_case" && (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-3">
            <dt className="text-muted-foreground">Bestätigter Praxisfall</dt>
            <dd className="mt-0.5 font-medium text-foreground">„{source.caseTitle}“</dd>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <dt className="text-muted-foreground">Stand des Praxisfalls</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {formatDateDe(source.caseVersion) ?? "unbekannt"}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-3 text-sm font-medium text-foreground">{countLabel}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {explainer.explainProvenance(source)}
      </p>

      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground/80">
          Technische Angaben
        </summary>
        <dl className="mt-2 space-y-1 rounded-lg border border-border bg-muted/30 p-3">
          {source.kind === "practice_case" && (
            <div className="flex flex-wrap gap-x-1">
              <dt>Fall-ID:</dt>
              <dd className="break-all">{source.caseId}</dd>
            </div>
          )}
          <div className="flex flex-wrap gap-x-1">
            <dt>Aufgelöst am:</dt>
            <dd>{new Date(result.resolvedAt).toLocaleString("de-DE")}</dd>
          </div>
          <div className="flex flex-wrap gap-x-1">
            <dt>Eingabe-Hash:</dt>
            <dd className="break-all">{result.inputHash}</dd>
          </div>
          <div className="flex flex-wrap gap-x-1">
            <dt>Schema-Version:</dt>
            <dd>{result.schemaVersion}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
