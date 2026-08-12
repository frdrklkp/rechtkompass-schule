/**
 * Sprint 4.6F – Bestätigung vor der Übergabe an den Navigator.
 * Zeigt, was übernommen wird; es wird nichts ergänzt.
 */
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import { AssistantCoverageBadge } from "./AssistantCoverageBadge";
import {
  AssistantLegalPreview,
  type AssistantLegalPreviewData,
} from "./AssistantLegalPreview";
import { AssistantMissingInformation } from "./AssistantMissingInformation";
import type { AssistantSession } from "@/services/assistant";
import type { PracticeCaseSource } from "@/services/practice-case-matching";

export interface AssistantConfirmationProps {
  session: AssistantSession;
  selectedSource: PracticeCaseSource | null;
  /**
   * Aufgelöste Rechtsgrundlagen-Vorschau des bestätigten Praxisfalls.
   * Ohne bestätigten Praxisfall oder vor der Auflösung: null (keine Vorschau).
   */
  legalPreview?: AssistantLegalPreviewData | null;
  /**
   * Sprint 4.6H – Vorschau der Dokumentationsphase: Anzahl der für diesen
   * Vorgang verfügbaren Dokumentvorlagen. null = noch nicht ermittelt.
   */
  documentationPreview?: { templateCount: number } | null;
  openQuestionCount: number;
  onHandoff: () => void;
  onBackToQuestions: () => void;
}

export function AssistantConfirmation({
  session,
  selectedSource,
  legalPreview,
  documentationPreview,
  openQuestionCount,
  onHandoff,
  onBackToQuestions,
}: AssistantConfirmationProps) {
  const situation = session.situation;
  const completion = situation?.completeness.completionPercentage ?? 0;
  const missingRequired = situation?.completeness.missingRequiredQuestions ?? [];

  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">
          <ShieldCheck className="mr-1 inline h-4 w-4 text-accent" aria-hidden="true" />
          Übergabe prüfen
        </h2>
        {session.coverage && <AssistantCoverageBadge coverage={session.coverage} />}
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <dt className="text-muted-foreground">Sachverhalt</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {situation?.title ?? "—"} · zu {completion} % erfasst
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <dt className="text-muted-foreground">Bestätigter Praxisfall</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {selectedSource ? selectedSource.title : "Ohne Praxisfall (allgemeine Bearbeitung)"}
          </dd>
          {selectedSource && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Stand:{" "}
              {selectedSource.updatedAt
                ? new Date(selectedSource.updatedAt).toLocaleDateString("de-DE")
                : "unbekannt"}{" "}
              · {selectedSource.hasDecisionTree ? "kuratierte" : "generische"} Bearbeitung
            </p>
          )}
        </div>
      </dl>

      {selectedSource && legalPreview && (
        <div className="mt-3">
          <AssistantLegalPreview preview={legalPreview} onOpenNavigator={onHandoff} />
        </div>
      )}

      {documentationPreview && documentationPreview.templateCount > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-foreground">
            <FileText className="mr-1 inline h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {documentationPreview.templateCount} Dokumentvorlage
            {documentationPreview.templateCount === 1 ? "" : "n"} verfügbar – z. B.
            Gesprächsnotiz oder Aktenvermerk, erzeugt aus den erfassten Angaben.
          </p>
          <button
            type="button"
            onClick={onHandoff}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
          >
            Dokumentation vorbereiten <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Die erfassten Angaben werden vollständig in den Entscheidungsnavigator übernommen. Sie
        müssen dort nichts erneut eingeben. Der Navigator öffnet sich bei der Analyse.
      </p>

      {missingRequired.length > 0 && (
        <div className="mt-3">
          <AssistantMissingInformation
            title="Offene Pflichtangaben"
            items={missingRequired}
          />

        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onHandoff}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          In den Navigator übernehmen <ArrowRight className="h-4 w-4" />
        </button>
        {openQuestionCount > 0 && (
          <button
            type="button"
            onClick={onBackToQuestions}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm hover:border-accent"
          >
            {openQuestionCount} offene Rückfrage(n) beantworten
          </button>
        )}
      </div>
    </section>
  );
}
