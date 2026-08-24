/**
 * Sprint 4.6G – Phase „Rechtsgrundlagen“ des Decision Navigators.
 * Container: Die Fachlogik liegt vollständig in useLegalContext und den
 * Services des Legal Context; diese Komponente wählt nur die Darstellung.
 */
import { useEffect } from "react";
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
  onNext?: () => void;
}

export function LegalContextStepPanel({
  navigatorId,
  workflowId,
  context,
  onPatchContext,
  onNext,
}: LegalContextStepPanelProps) {
  const legal = useLegalContext({ navigatorId, workflowId, context, onPatchContext });

  // Fund 2026-08-19 (UX-Review): für die meisten Fälle (kein bestätigter
  // Praxisfall) war diese Phase eine leere Pflicht-Station. Die Phase kann
  // im aktuellen Ablauf-Modell nicht aus der Zählung entfernt werden
  // (Sichtbarkeit ist statisch pro Ablauf-Definition, nicht laufzeit-
  // abhängig vom Fall) - stattdessen wird automatisch weitergesprungen,
  // sobald feststeht, dass es nichts anzuzeigen gibt, statt den leeren
  // Platzhalter überhaupt sichtbar zu machen.
  useEffect(() => {
    if (legal.hasCase === false && onNext) {
      onNext();
    }
  }, [legal.hasCase, onNext]);

  if (!legal.hasCase) {
    return null;
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
