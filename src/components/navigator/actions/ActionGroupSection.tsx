/**
 * Sprint 4.6D – Zeitgruppe eines Maßnahmenplans.
 */
import { ActionCard } from "./ActionCard";
import type { ActionGroupView, ActionItem } from "@/services/action-engine";
import type { ActionPlanController } from "@/hooks/navigator/useActionPlan";

export interface ActionGroupSectionProps {
  group: ActionGroupView;
  actions: ActionItem[];
  controller: ActionPlanController;
}

export function ActionGroupSection({ group, actions, controller }: ActionGroupSectionProps) {
  if (actions.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h4 className="text-sm font-semibold text-foreground">{group.label}</h4>
      <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
      <ul className="mt-3 space-y-3">
        {actions.map((action) => (
          <ActionCard key={action.actionKey} action={action} controller={controller} />
        ))}
      </ul>
    </section>
  );
}
