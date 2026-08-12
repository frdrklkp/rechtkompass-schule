/**
 * Sprint 4.6D – Darstellung einer einzelnen Maßnahme.
 * Reine Präsentation; jede Zustandsänderung läuft über die Action Engine.
 */
import { useState } from "react";
import {
  ACTION_EFFORT_LABEL,
  ACTION_PRIORITY_LABEL,
  labelForRole,
  type ActionItem,
} from "@/services/action-engine";
import type { ActionPlanController } from "@/hooks/navigator/useActionPlan";

const STATUS_LABEL: Record<ActionItem["status"], string> = {
  open: "Offen",
  inProgress: "In Bearbeitung",
  completed: "Erledigt",
  skipped: "Übersprungen",
  blocked: "Blockiert",
  notApplicable: "Nicht zutreffend",
  cancelled: "Entfallen",
};

const STATUS_STYLE: Record<ActionItem["status"], string> = {
  open: "border-border bg-muted text-foreground",
  inProgress: "border-border bg-muted text-foreground",
  completed: "border-primary/40 bg-primary/10 text-foreground",
  skipped: "border-border bg-muted text-muted-foreground",
  blocked: "border-destructive/40 bg-destructive/10 text-foreground",
  notApplicable: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
};

export interface ActionCardProps {
  action: ActionItem;
  controller: ActionPlanController;
  readOnly?: boolean;
}

export function ActionCard({ action, controller, readOnly = false }: ActionCardProps) {
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState(action.completionData.justification);
  const [note, setNote] = useState(action.completionData.note);
  const [confirmed, setConfirmed] = useState(false);
  const closed =
    action.status === "completed" ||
    action.status === "skipped" ||
    action.status === "notApplicable";

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="text-sm font-semibold text-foreground">{action.title}</h5>
          <p className="mt-1 text-sm text-foreground/85">{action.description}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[action.status]}`}
        >
          {STATUS_LABEL[action.status]}
        </span>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline font-medium">Möglicherweise zuständig: </dt>
          <dd className="inline">{labelForRole(action.responsibleRole)}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Priorität: </dt>
          <dd className="inline">{ACTION_PRIORITY_LABEL[action.priority]}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Aufwand: </dt>
          <dd className="inline">{ACTION_EFFORT_LABEL[action.estimatedEffort]}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Art: </dt>
          <dd className="inline">{action.required ? "verpflichtend" : "optional"}</dd>
        </div>
      </dl>

      {action.alternativeResponsibleRoles.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Alternativ möglicherweise zuständig:{" "}
          {action.alternativeResponsibleRoles.map(labelForRole).join(", ")}
        </p>
      )}

      {action.blockedReason && (
        <p className="mt-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
          {action.blockedReason}
        </p>
      )}

      {action.carryOverReviewRequired && (
        <p className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-foreground">
          Diese Maßnahme hat sich inhaltlich geändert. Bitte prüfen Sie den Bearbeitungsstand erneut.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-xs font-medium text-primary underline underline-offset-2"
        aria-expanded={open}
      >
        {open ? "Begründung ausblenden" : "Warum wird dieser Schritt angezeigt?"}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-foreground/90">
          <ul className="list-disc space-y-1 pl-4">
            {action.reason.map((reason) => (
              <li key={reason.ruleId}>{reason.userFacingText}</li>
            ))}
          </ul>
          {action.sourceFields.length > 0 && (
            <p className="mt-2 text-muted-foreground">
              Grundlage: {action.sourceFields.join(", ")}
            </p>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {!closed && (
            <>
              <label className="block text-xs font-medium text-foreground" htmlFor={`note_${action.actionKey}`}>
                Notiz zur Bearbeitung (optional)
              </label>
              <textarea
                id={`note_${action.actionKey}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => note !== action.completionData.note && controller.updateNote(action.actionKey, note)}
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
              {(action.allowSkip || action.allowNotApplicable) && (
                <input
                  type="text"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Begründung für Überspringen oder Nichtzutreffen"
                  aria-label={`Begründung für ${action.title}`}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              )}
              {action.confirmationRequired && (
                <label className="flex items-start gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  Ich bestätige, dass ich diesen Schritt geprüft beziehungsweise veranlasst habe.
                </label>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-2">
            {!closed && (
              <button
                type="button"
                disabled={action.status === "blocked"}
                onClick={() =>
                  controller.completeAction(action.actionKey, {
                    note,
                    completedByRole: action.responsibleRole,
                    confirmation: action.confirmationRequired ? confirmed : true,
                  })
                }
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Als erledigt markieren
              </button>
            )}
            {!closed && action.allowSkip && (
              <button
                type="button"
                onClick={() => controller.skipAction(action.actionKey, justification)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Überspringen
              </button>
            )}
            {!closed && action.allowNotApplicable && (
              <button
                type="button"
                onClick={() => controller.markNotApplicable(action.actionKey, justification)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Trifft nicht zu
              </button>
            )}
            {closed && (
              <button
                type="button"
                onClick={() => controller.reopenAction(action.actionKey)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Wieder öffnen
              </button>
            )}
          </div>
          {action.completionData.justification && closed && (
            <p className="text-xs text-muted-foreground">
              Begründung: {action.completionData.justification}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
