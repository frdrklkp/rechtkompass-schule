/** Sprint 4.6A – Darstellung eines einzelnen Navigator-Schritts. */
import type { NavigatorStep as NavigatorStepModel } from "@/services/decision-navigator";

export interface NavigatorStepProps {
  step: NavigatorStepModel;
  /** Unterdrückt den Platzhalterhinweis, wenn der Schritt fachlich ausgefüllt ist. */
  hasContent?: boolean;
}


const STATUS_LABEL: Record<string, string> = {
  pending: "offen",
  current: "aktuell",
  completed: "abgeschlossen",
  skipped: "übersprungen",
};

export function NavigatorStep({ step, hasContent = false }: NavigatorStepProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
          {step.type}
        </span>
        <span>{STATUS_LABEL[step.status] ?? step.status}</span>
        {step.optional && <span>· optional</span>}
      </div>
      <h2 className="mt-3 text-base font-semibold text-foreground">{step.title}</h2>
      <p className="mt-1.5 text-sm text-foreground/85">{step.description}</p>
      {!hasContent && (
        <p className="mt-4 text-xs text-muted-foreground">
          Fachliche Inhalte werden in einem späteren Sprint ergänzt. Dieser Schritt bildet aktuell
          nur den Ablauf ab.
        </p>
      )}
    </section>
  );
}
