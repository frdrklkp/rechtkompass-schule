/**
 * Sprint 4.6D – Hinweise zu veralteten Plänen und Maßnahmen-Deltas.
 */
import type { ActionPlanDelta } from "@/services/action-engine";

export function ActionStaleNotice({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <section
      role="status"
      className="rounded-2xl border border-accent/50 bg-accent/10 p-5"
    >
      <h4 className="text-sm font-semibold text-foreground">
        Die Handlungsschritte beruhen auf einem älteren Stand
      </h4>
      <p className="mt-1 text-sm text-foreground/85">
        Situation oder Bewertung wurden geändert. Die angezeigten Schritte werden weiterhin
        dargestellt, bilden aber möglicherweise nicht mehr den aktuellen Stand ab.
      </p>
      <button
        type="button"
        onClick={onRegenerate}
        className="mt-3 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Handlungsschritte neu erzeugen
      </button>
    </section>
  );
}

export function ActionDeltaNotice({
  delta,
  onDismiss,
}: {
  delta: ActionPlanDelta;
  onDismiss: () => void;
}) {
  const hasChanges =
    delta.added.length > 0 || delta.changed.length > 0 || delta.removed.length > 0;
  if (!hasChanges) return null;
  return (
    <section role="status" className="rounded-2xl border border-border bg-card p-5">
      <h4 className="text-sm font-semibold text-foreground">Änderungen gegenüber dem vorherigen Plan</h4>
      <ul className="mt-2 space-y-2 text-sm text-foreground/85">
        {delta.added.length > 0 && (
          <li>
            <span className="font-medium">Neu:</span>{" "}
            {delta.added.map((a) => a.title).join("; ")}
          </li>
        )}
        {delta.changed.length > 0 && (
          <li>
            <span className="font-medium">Geändert:</span>{" "}
            {delta.changed.map((c) => c.next.title).join("; ")}
          </li>
        )}
        {delta.removed.length > 0 && (
          <li>
            <span className="font-medium">Entfallen:</span>{" "}
            {delta.removed.map((a) => a.title).join("; ")}
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Entfallene Schritte bleiben im Verlauf des Vorgangs erhalten.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
      >
        Hinweis ausblenden
      </button>
    </section>
  );
}
