/**
 * Sprint 4.6G – Phase „Rechtsgrundlagen“ des Decision Navigators.
 * Container: Die Fachlogik liegt vollständig in useLegalContext und den
 * Services des Legal Context; diese Komponente wählt nur die Darstellung.
 */
import { ArrowLeft } from "lucide-react";
import { LoadingState } from "@/components/DataStates";
import { useLegalContext } from "@/hooks/legal-context/useLegalContext";
import { LegalContextView } from "./LegalContextView";

export interface LegalContextStepPanelProps {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
  canGoBack: boolean;
  onBack: () => void;
}

export function LegalContextStepPanel({
  navigatorId,
  workflowId,
  context,
  onPatchContext,
  canGoBack,
  onBack,
}: LegalContextStepPanelProps) {
  const legal = useLegalContext({ navigatorId, workflowId, context, onPatchContext });

  /* Generischer Fallback: kein bestätigter Praxisfall – keine Ersatznormen. */
  if (!legal.hasCase) {
    return (
      <section
        className="rounded-2xl border border-border bg-card p-5"
        aria-label="Rechtsgrundlagen – allgemeine Bearbeitung"
      >
        <h3 className="text-base font-semibold text-foreground">Rechtsgrundlagen</h3>
        <p className="mt-2 text-sm text-foreground/85">
          Für diese Bearbeitung wurde kein kuratierter Praxisfall bestätigt.
        </p>
        <p className="mt-1 text-sm text-foreground/85">
          Daher stehen aktuell keine fallspezifisch geprüften Rechtsgrundlagen zur Verfügung.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Es werden keine Ersatznormen ergänzt. Die übrigen Phasen der Bearbeitung sind davon
          nicht betroffen.
        </p>
        {canGoBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Zurück zur vorherigen Phase
          </button>
        )}
      </section>
    );
  }

  /* Gespeicherter Stand hat Vorrang; ohne Stand wird geladen. */
  if (!legal.result) {
    if (legal.error) {
      return (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground"
        >
          {legal.error} Sie können die Phase erneut aufrufen.
        </p>
      );
    }
    return <LoadingState label="Rechtsgrundlagen werden geladen …" />;
  }

  return (
    <div className="space-y-4">
      {legal.error && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground"
        >
          {legal.error} Der zuletzt gespeicherte Stand wird weiterhin angezeigt.
        </p>
      )}
      <LegalContextView
        result={legal.result}
        isStale={legal.isStale}
        onRefresh={legal.refresh}
        onDismissStale={legal.dismissStale}
      />
    </div>
  );
}
