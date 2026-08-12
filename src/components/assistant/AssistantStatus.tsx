/**
 * Sprint 4.6F – Statusanzeige des Entscheidungsassistenten.
 * Reine Darstellung: Phase, Fortschritt und Sitzungsstatus.
 */
import {
  ASSISTANT_PHASES,
  ASSISTANT_PHASE_LABELS,
  ASSISTANT_STATUS_LABELS,
  type AssistantPhase,
  type AssistantStatus as AssistantSessionStatus,
} from "@/services/assistant";

export interface AssistantStatusProps {
  phase: AssistantPhase;
  status: AssistantSessionStatus;
  caseCount: number;
}

export function AssistantStatus({ phase, status, caseCount }: AssistantStatusProps) {
  const index = Math.max(0, ASSISTANT_PHASES.indexOf(phase));
  const percent = Math.round(((index + 1) / ASSISTANT_PHASES.length) * 100);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          Schritt {index + 1} von {ASSISTANT_PHASES.length}: {ASSISTANT_PHASE_LABELS[phase]}
        </p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {ASSISTANT_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {ASSISTANT_PHASES.map((p, i) => (
          <li
            key={p}
            aria-current={p === phase ? "step" : undefined}
            className={`rounded-full border px-2 py-0.5 ${
              p === phase
                ? "border-accent bg-accent/10 font-semibold text-foreground"
                : i < index
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-dashed border-border text-muted-foreground"
            }`}
          >
            {i < index ? "✓ " : ""}
            {ASSISTANT_PHASE_LABELS[p]}
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Abgleich mit {caseCount} redaktionell erfassten Praxisfällen. Es werden keine Inhalte
        erzeugt und keine rechtliche Bewertung vorgenommen.
      </p>
    </div>
  );
}
