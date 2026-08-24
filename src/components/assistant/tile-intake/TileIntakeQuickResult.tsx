/**
 * Tier 3 – Ergebnis-Bildschirm "Schnelle Einschätzung". Nichts wird
 * gespeichert; ein Klick auf "Fall dokumentieren" übernimmt die bereits
 * gesammelten Antworten verlustfrei (siehe useTileIntake.upgradeToDocumentation).
 */
import { ArrowRight, FileCheck2, RotateCcw } from "lucide-react";
import { AssistantCandidateCard } from "@/components/assistant/AssistantCandidateCard";
import { AssistantCaseGenerationOffer } from "@/components/assistant/AssistantCaseGenerationOffer";
import type { PracticeCaseMatchResult, PracticeCaseSource } from "@/services/practice-case-matching";

export interface TileIntakeQuickResultProps {
  matchResult: PracticeCaseMatchResult;
  sources: PracticeCaseSource[];
  selectedCaseId: string | null;
  rawDescription: string;
  onSelect: (caseId: string) => void;
  onUpgrade: () => void;
  onRestart: () => void;
}

export function TileIntakeQuickResult({
  matchResult,
  sources,
  selectedCaseId,
  rawDescription,
  onSelect,
  onUpgrade,
  onRestart,
}: TileIntakeQuickResultProps) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const [best, ...alternatives] = matchResult.matches;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Ihre Einschätzung</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {matchResult.matches.length === 0
            ? "Kein Praxisfall erreicht die Mindestübereinstimmung."
            : `${matchResult.matches.length} Treffer aus ${matchResult.stats.evaluated} geprüften Praxisfällen.`}
        </p>
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
            <details className="rounded-2xl border border-border bg-card p-4">
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
          <p className="text-sm font-semibold text-foreground">Kein ausreichend passender Praxisfall</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Es werden keine Inhalte, Rechtsgrundlagen oder Maßnahmen erfunden. Sie können den Fall
            trotzdem strukturiert dokumentieren.
          </p>
          {rawDescription.trim().length > 0 && (
            <AssistantCaseGenerationOffer sketch={rawDescription} />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onUpgrade}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
        >
          <FileCheck2 className="h-3.5 w-3.5" />
          Als Fall dokumentieren <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium hover:border-accent"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Neu starten
        </button>
      </div>
    </div>
  );
}
