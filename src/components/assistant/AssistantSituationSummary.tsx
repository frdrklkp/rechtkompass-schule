/**
 * Sprint 4.6F – Anzeige der deterministisch erkannten Angaben mit Belegstelle.
 * Es werden ausschließlich Angaben gezeigt, die die Schilderung hergibt.
 */
import { Check, FileText, Pencil } from "lucide-react";
import type { AssistantDescriptionAnalysis, AssistantFinding } from "@/services/assistant";
import type { SituationCase } from "@/services/situation-analyzer";

export interface AssistantSituationSummaryProps {
  description: string;
  analysis: AssistantDescriptionAnalysis;
  situation: SituationCase | null;
  onEditDescription: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}

function FindingRow({ finding }: { finding: AssistantFinding }) {
  return (
    <li className="rounded-xl border border-border bg-background p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {finding.label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{finding.display}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        <FileText className="mr-1 inline h-3 w-3" aria-hidden="true" />
        Belegstelle: „{finding.evidence}“
      </p>
    </li>
  );
}

export function AssistantSituationSummary({
  description,
  analysis,
  situation,
  onEditDescription,
  onConfirm,
  confirmLabel = "Angaben bestätigen und abgleichen",
  confirmDisabled = false,
}: AssistantSituationSummaryProps) {
  const completion = situation?.completeness.completionPercentage ?? 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Erfasste Angaben</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Aus Ihrer Schilderung wurden {analysis.findings.length} Angabe(n) übernommen. Der
            Sachverhalt ist zu {completion} % erfasst.
          </p>
        </div>
        <button
          type="button"
          onClick={onEditDescription}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] hover:border-accent"
        >
          <Pencil className="h-3 w-3" /> Schilderung korrigieren
        </button>
      </div>

      <blockquote className="mt-3 rounded-xl border-l-2 border-accent bg-muted/40 p-3 text-xs text-muted-foreground">
        {description}
      </blockquote>

      {analysis.findings.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {analysis.findings.map((f) => (
            <FindingRow key={`${f.field}-${f.display}`} finding={f} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          Aus der Schilderung ließ sich keine eindeutige Angabe ableiten. Die Angaben werden über
          Rückfragen erfasst.
        </p>
      )}

      {analysis.openAspects.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-xs font-semibold text-foreground">Nicht aus der Schilderung ableitbar</p>
          <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
            {analysis.openAspects.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Diese Angaben werden nicht ergänzt, sondern gezielt erfragt.
          </p>
        </div>
      )}

      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> {confirmLabel}
        </button>
      )}
    </section>
  );
}
