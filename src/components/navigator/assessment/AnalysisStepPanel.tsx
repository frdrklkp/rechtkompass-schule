/**
 * Sprint 4.6C – Phase „Analyse“: strukturierte Datengrundlage vor der Bewertung.
 * Reine Darstellung; die Ableitung erfolgt in der Assessment-Engine-Schicht.
 */
import { useMemo } from "react";
import { buildSituationOverview } from "@/services/assessment-engine";
import { SITUATION_CONTEXT_KEY, type SituationCase } from "@/services/situation-analyzer";

export interface AnalysisStepPanelProps {
  context: Record<string, unknown>;
  canGoBack: boolean;
  onBack: () => void;
  onNext?: () => void;
}

export function AnalysisStepPanel({ context, onNext }: AnalysisStepPanelProps) {
  const situation = (context[SITUATION_CONTEXT_KEY] ?? null) as SituationCase | null;
  const overview = useMemo(
    () => (situation && typeof situation === "object" ? buildSituationOverview(situation) : null),
    [situation],
  );

  if (!overview) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground">Analyse</h3>
        <p className="mt-2 text-sm text-foreground/85">
          Es wurden noch keine Angaben erfasst. Bitte zunächst die Phase „Situation“ ausfüllen.
        </p>
      </section>
    );
  }

  const counters: Array<[string, number]> = [
    ["Beteiligte", overview.participantCount],
    ["davon unmittelbar betroffen", overview.affectedCount],
    ["Zeuginnen und Zeugen", overview.witnessCount],
    ["Nachweise", overview.evidenceCount],
    ["Bereits durchgeführte Maßnahmen", overview.measureCount],
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground">Strukturierte Datengrundlage</h3>
        <dl className="mt-3 grid gap-2 text-sm text-foreground/85 sm:grid-cols-2">
          <div>
            <dt className="font-medium">Titel</dt>
            <dd>{overview.title}</dd>
          </div>
          <div>
            <dt className="font-medium">Kategorie</dt>
            <dd>{overview.category}</dd>
          </div>
          <div>
            <dt className="font-medium">Vollständigkeit der Erfassung</dt>
            <dd>
              {overview.completionPercentage} % ({overview.answeredQuestions} von{" "}
              {overview.totalRelevantQuestions} relevanten Fragen)
            </dd>
          </div>
          <div>
            <dt className="font-medium">Erfassung abgeschlossen</dt>
            <dd>{overview.isComplete ? "ja" : "nein"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h4 className="text-sm font-semibold text-foreground">Erfasste Kernangaben</h4>
        <ul className="mt-2 space-y-1 text-sm text-foreground/85">
          {overview.keyFacts.map((fact) => (
            <li key={fact.field}>
              {fact.label}: <span className="font-medium">{fact.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h4 className="text-sm font-semibold text-foreground">Umfang der Erfassung</h4>
        <ul className="mt-2 space-y-1 text-sm text-foreground/85">
          {counters.map(([label, value]) => (
            <li key={label}>
              {label}: <span className="font-medium">{value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h4 className="text-sm font-semibold text-foreground">
          Unbekannte oder offene Angaben ({overview.unknownEntries.length})
        </h4>
        {overview.unknownEntries.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/85">
            Es sind keine Angaben als unbekannt oder unbeantwortet markiert.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-foreground/85">
            {overview.unknownEntries.map((entry) => (
              <li key={entry.questionId}>
                {entry.title} –{" "}
                {entry.reason === "unknown" ? "ausdrücklich unbekannt" : "nicht beantwortet"}
              </li>
            ))}
          </ul>
        )}
      </section>

      {overview.missingRequiredQuestions.length > 0 && (
        <section className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <h4 className="text-sm font-semibold text-foreground">
            Fehlende entscheidungsrelevante Angaben ({overview.missingRequiredQuestions.length})
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/85">
            {overview.missingRequiredQuestions.map((questionId) => (
              <li key={questionId}>{questionId}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        In dieser Phase erfolgt noch keine rechtliche Bewertung und keine Ampeleinstufung. Die
        Angaben werden ausschließlich strukturiert zusammengeführt.
      </p>

      <div className="flex flex-wrap gap-2">
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Zur Bewertung
          </button>
        )}
      </div>
    </div>
  );
}
