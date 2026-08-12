/**
 * Sprint 4.6B.1 – Transparenter Platzhalter für noch nicht umgesetzte Phasen.
 * Zeigt Zweck und Entwicklungsstatus – niemals fiktive Ergebnisse.
 */
import { ArrowLeft, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface NavigatorStepPlaceholderProps {
  title: string;
  purpose: string;
  status: string;
  canGoBack?: boolean;
  onBack?: () => void;
}

export function NavigatorStepPlaceholder({
  title,
  purpose,
  status,
  canGoBack,
  onBack,
}: NavigatorStepPlaceholderProps) {
  return (
    <section
      aria-label={`Phase ${title} – noch nicht verfügbar`}
      className="rounded-2xl border border-dashed border-border bg-muted/30 p-5"
    >
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Construction className="h-4 w-4" aria-hidden="true" />
        Noch nicht verfügbar
      </p>
      <h3 className="mt-2 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-foreground/85">
        Die strukturierte Situation wurde gespeichert.
      </p>
      <p className="mt-1 text-sm text-foreground/85">{purpose}</p>
      <p className="mt-1 text-sm text-muted-foreground">{status}</p>
      <p className="mt-3 text-xs text-muted-foreground">
        Aktuell erfolgt in dieser Phase keine fachliche oder rechtliche Bewertung, keine
        Handlungsempfehlung und keine Ampel.
      </p>
      {onBack && (
        <Button
          type="button"
          variant="outline"
          className="mt-4 gap-2"
          onClick={onBack}
          disabled={!canGoBack}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Zurück zur vorherigen Phase
        </Button>
      )}
    </section>
  );
}
