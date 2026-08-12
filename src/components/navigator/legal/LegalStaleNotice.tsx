/**
 * Sprint 4.6G – Hinweis auf veraltete Rechtsgrundlagen.
 * Der vorherige Stand bleibt sichtbar und wird erst nach bewusster
 * Aktualisierung ersetzt – keine stille Neuberechnung.
 */
import { RefreshCw } from "lucide-react";

export interface LegalStaleNoticeProps {
  onRefresh: () => void;
  onDismiss: () => void;
}

export function LegalStaleNotice({ onRefresh, onDismiss }: LegalStaleNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-accent/50 bg-accent/10 p-4"
    >
      <p className="text-sm font-semibold text-foreground">Rechtsgrundlagen veraltet</p>
      <p className="mt-1 text-sm text-foreground/85">
        Grund: Der Praxisfall, seine Verknüpfungen oder die hinterlegten Rechtsquellen wurden
        seit der letzten Auflösung verändert. Die Anzeige bezieht sich noch auf den vorherigen
        Stand und wird nicht automatisch überschrieben.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Rechtsgrundlagen aktualisieren
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Hinweis ausblenden
        </button>
      </div>
    </div>
  );
}
