/**
 * Sprint 4.6F – Trefferübersicht des Assistenten.
 * Zeigt Abdeckung, besten Treffer und Alternativen. Es wird keine
 * Matching-Logik nachgebaut; alle Werte stammen aus dem Abgleichergebnis.
 */
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AssistantCandidateCard } from "./AssistantCandidateCard";
import { AssistantCoverageBadge } from "./AssistantCoverageBadge";
import { AssistantMissingInformation } from "./AssistantMissingInformation";
import {
  ASSISTANT_STALE_MESSAGES,
  type AssistantCoverage,
  type AssistantStaleReason,
} from "@/services/assistant";
import type {
  PracticeCaseMatchResult,
  PracticeCaseSource,
} from "@/services/practice-case-matching";

export interface AssistantMatchSummaryProps {
  result: PracticeCaseMatchResult;
  coverage: AssistantCoverage | null;
  sources: PracticeCaseSource[];
  selectedCaseId: string | null;
  stale: AssistantStaleReason;
  onSelect: (caseId: string) => void;
  onRematch: () => void;
  onContinueWithout: () => void;
}

export function AssistantMatchSummary({
  result,
  coverage,
  sources,
  selectedCaseId,
  stale,
  onSelect,
  onRematch,
  onContinueWithout,
}: AssistantMatchSummaryProps) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const [best, ...alternatives] = result.matches;
  const staleMessage = ASSISTANT_STALE_MESSAGES[stale];

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Passende Praxisfälle</h2>
          {coverage && <AssistantCoverageBadge coverage={coverage} showScore />}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {result.matches.length === 0
            ? "Kein Praxisfall erreicht die Mindestübereinstimmung."
            : `${result.matches.length} Treffer aus ${result.stats.evaluated} geprüften Praxisfällen.`}
        </p>

        {coverage && coverage.reasons.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
            {coverage.reasons.slice(0, 4).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}

        {staleMessage && stale !== "no_result" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-xs text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            <span className="flex-1">{staleMessage}</span>
            <button
              type="button"
              onClick={onRematch}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 font-medium hover:border-accent"
            >
              <RefreshCw className="h-3 w-3" /> Abgleich erneuern
            </button>
          </div>
        )}

        {coverage && <div className="mt-3"><AssistantMissingInformation items={coverage.missing} /></div>}

        {result.limitations.length > 0 && (
          <details className="mt-3 rounded-xl border border-border bg-background/60 p-2">
            <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
              Unsicherheiten und Grenzen des Abgleichs
            </summary>
            <ul className="mt-2 list-inside list-disc text-[11px] text-muted-foreground">
              {result.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {best ? (
        <>
          <AssistantCandidateCard
            match={best}
            source={byId.get(best.caseId) ?? null}
            selected={selectedCaseId === best.caseId}
            primary
            onSelect={() => onSelect(best.caseId)}
          />
          {alternatives.length > 0 && (
            <details open className="rounded-2xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                {alternatives.length} alternative{alternatives.length === 1 ? "r Treffer" : " Treffer"}
              </summary>
              <div className="mt-3 space-y-3">
                {alternatives.map((m) => (
                  <AssistantCandidateCard
                    key={m.caseId}
                    match={m}
                    source={byId.get(m.caseId) ?? null}
                    selected={selectedCaseId === m.caseId}
                    onSelect={() => onSelect(m.caseId)}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
          <p className="text-sm font-semibold text-foreground">
            Kein ausreichend passender Praxisfall
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Es wird kein Praxisfall angezeigt, weil keiner die Mindestübereinstimmung erreicht. Es
            werden keine Inhalte, Rechtsgrundlagen oder Maßnahmen erfunden. Sie können weitere
            Rückfragen beantworten oder ohne Praxisfall mit der allgemeinen Bearbeitung fortfahren.
          </p>
          <button
            type="button"
            onClick={onContinueWithout}
            className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-accent"
          >
            Ohne Praxisfall fortfahren
          </button>
        </div>
      )}
    </section>
  );
}
