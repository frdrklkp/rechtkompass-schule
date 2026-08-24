/**
 * Sprint 4.6C – Phase „Bewertung“. Die Komponente stellt ausschließlich dar;
 * jede Einstufung stammt aus der Assessment Engine.
 */
import { useEffect, useState } from "react";
import { AssessmentOverview } from "./AssessmentOverview";
import { AssessmentStaleNotice } from "./AssessmentStaleNotice";
import { useAssessment } from "@/hooks/navigator/useAssessment";

export interface AssessmentStepPanelProps {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
  canGoBack: boolean;
  onBack: () => void;
}

export function AssessmentStepPanel({
  navigatorId,
  workflowId,
  context,
  onPatchContext,
}: AssessmentStepPanelProps) {
  const assessment = useAssessment({ navigatorId, workflowId, context, onPatchContext });
  const [didRun, setDidRun] = useState(false);

  const handleRun = () => {
    assessment.run();
    setDidRun(true);
  };

  // Bewertung ist eine reine, synchrone Regelauswertung ohne Netzwerkzugriff -
  // beim Betreten der Phase automatisch anstoßen, statt einen manuellen Klick
  // zu verlangen, den man leicht vergisst (Fund 2026-08-19, UX-Review).
  useEffect(() => {
    if (assessment.validation.valid && !assessment.hasResult) {
      handleRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.validation.valid, assessment.hasResult]);

  if (!assessment.validation.valid) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground">Bewertung nicht möglich</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/85">
          {assessment.validation.issues.map((issue) => (
            <li key={issue.code + issue.message}>{issue.message}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={assessment.reset}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Ergebnis zurücksetzen
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground">Bewertung</h3>
        <p className="mt-2 text-sm text-foreground/85">
          Die Bewertung wertet ausschließlich die strukturiert erfassten Angaben mit festen Regeln
          aus. Es erfolgt keine automatische Auslegung der Freitextbeschreibung und keine
          Handlungsempfehlung.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRun}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {assessment.hasResult ? "Bewertung erneut ausführen" : "Bewertung ausführen"}
          </button>
          {assessment.hasResult && (
            <button
              type="button"
              onClick={() => {
                assessment.reset();
                setDidRun(false);
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Ergebnis zurücksetzen
            </button>
          )}
        </div>
      </section>

      {assessment.loadError && (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
          {assessment.loadError} Sie können die Bewertung erneut ausführen.
        </p>
      )}
      {assessment.runError && (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
          {assessment.runError}
        </p>
      )}

      {assessment.isStale && <AssessmentStaleNotice onReevaluate={handleRun} />}

      {assessment.result ? (
        <AssessmentOverview result={assessment.result} focusOnMount={didRun} />
      ) : (
        <p className="text-sm text-foreground/85">
          Es liegt noch keine Bewertung vor. Starten Sie die Auswertung über die Schaltfläche
          „Bewertung ausführen“.
        </p>
      )}
    </div>
  );
}
