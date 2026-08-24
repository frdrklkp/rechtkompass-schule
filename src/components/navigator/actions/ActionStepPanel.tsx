/**
 * Sprint 4.6D – Phase „Sofortmaßnahmen“.
 * Die Komponente stellt ausschließlich dar; alle Schritte stammen aus der
 * Action Engine. Es erfolgt keine Rechtsauslegung und keine KI-Nutzung.
 */
import { useEffect } from "react";
import { ActionGroupSection } from "./ActionGroupSection";
import {
  ActionConflictList,
  ActionLimitations,
  ActionMissingPrerequisites,
  ActionProgressSummary,
} from "./ActionPlanMeta";
import { ActionDeltaNotice, ActionStaleNotice } from "./ActionNotices";
import { useActionPlan } from "@/hooks/navigator/useActionPlan";

export interface ActionStepPanelProps {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
  canGoBack: boolean;
  onBack: () => void;
}

export function ActionStepPanel({
  navigatorId,
  workflowId,
  context,
  onPatchContext,
}: ActionStepPanelProps) {
  const controller = useActionPlan({ navigatorId, workflowId, context, onPatchContext });
  const { plan } = controller;

  // Erzeugung ist eine reine, synchrone Regelauswertung ohne Netzwerkzugriff -
  // beim Betreten der Phase automatisch anstoßen, statt einen manuellen Klick
  // zu verlangen (Fund 2026-08-19, UX-Review).
  useEffect(() => {
    if (controller.validation.valid && !plan) {
      controller.generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller.validation.valid, plan]);

  if (!controller.validation.valid && !plan) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground">
          Handlungsschritte noch nicht möglich
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/85">
          {controller.validation.issues.map((issue) => (
            <li key={issue.code + issue.message}>{issue.message}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground">Sofortmaßnahmen</h3>
        <p className="mt-2 text-sm text-foreground/85">
          Die Schritte werden regelbasiert aus den erfassten Angaben und der Bewertung abgeleitet.
          Sie sind nach Dringlichkeit gruppiert und ersetzen keine Einzelfallprüfung.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={controller.generate}
            disabled={!controller.validation.valid}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {plan ? "Handlungsschritte neu erzeugen" : "Handlungsschritte erzeugen"}
          </button>
          {plan && (
            <button
              type="button"
              onClick={controller.reset}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Plan zurücksetzen
            </button>
          )}
        </div>
      </section>

      {controller.loadError && (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
          {controller.loadError} Sie können die Handlungsschritte neu erzeugen.
        </p>
      )}
      {controller.runError && (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
          {controller.runError}
        </p>
      )}

      {plan && controller.isStale && <ActionStaleNotice onRegenerate={controller.generate} />}
      {controller.delta && (
        <ActionDeltaNotice delta={controller.delta} onDismiss={controller.dismissDelta} />
      )}

      {plan && plan.actions.length === 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-foreground/85">
            Aus den vorliegenden Angaben lassen sich keine konkreten Schritte ableiten. Bitte
            ergänzen Sie die Angaben zur Situation und führen Sie die Bewertung erneut aus.
          </p>
        </section>
      )}

      {plan && plan.actions.length > 0 && (
        <>
          <ActionProgressSummary plan={plan} />
          <ActionConflictList plan={plan} />
          {plan.groups.map((group) => (
            <ActionGroupSection
              key={group.group}
              group={group}
              actions={plan.actions.filter((a) => group.actionKeys.includes(a.actionKey))}
              controller={controller}
            />
          ))}
          <ActionMissingPrerequisites plan={plan} />
          <ActionLimitations plan={plan} />
        </>
      )}
    </div>
  );
}
