/**
 * Sprint 4.6D – Fortschritt, Konflikte und Grenzen des Maßnahmenplans.
 */
import type { ActionPlan } from "@/services/action-engine";

export function ActionProgressSummary({ plan }: { plan: ActionPlan }) {
  const p = plan.progress;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h4 className="text-sm font-semibold text-foreground">Bearbeitungsstand</h4>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={p.requiredCompletionPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Fortschritt der verpflichtenden Maßnahmen"
      >
        <div className="h-full bg-primary" style={{ width: `${p.requiredCompletionPercentage}%` }} />
      </div>
      <p className="mt-2 text-sm text-foreground/85">
        {p.completedActions} von {p.totalActions} Schritten bearbeitet, davon {p.requiredActions}{" "}
        verpflichtend ({p.requiredCompletionPercentage} %).
      </p>
      {p.blockedActions > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {p.blockedActions} Schritte sind derzeit durch offene Voraussetzungen blockiert.
        </p>
      )}
    </section>
  );
}

export function ActionConflictList({ plan }: { plan: ActionPlan }) {
  if (plan.conflicts.length === 0) return null;
  return (
    <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
      <h4 className="text-sm font-semibold text-foreground">Hinweise zu Widersprüchen</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/85">
        {plan.conflicts.map((conflict) => (
          <li key={conflict.id}>{conflict.description}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Widersprüche werden angezeigt und nicht automatisch aufgelöst.
      </p>
    </section>
  );
}

export function ActionLimitations({ plan }: { plan: ActionPlan }) {
  return (
    <section className="rounded-2xl border border-border bg-muted/40 p-5">
      <h4 className="text-sm font-semibold text-foreground">Grenzen dieser Vorschläge</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/85">
        {plan.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </section>
  );
}

export function ActionMissingPrerequisites({ plan }: { plan: ActionPlan }) {
  if (plan.missingPrerequisites.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h4 className="text-sm font-semibold text-foreground">Offene Voraussetzungen</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/85">
        {plan.missingPrerequisites.map((item) => (
          <li key={`${item.actionKey}_${item.reference}`}>
            {item.actionTitle}: {item.reason}
          </li>
        ))}
      </ul>
    </section>
  );
}
