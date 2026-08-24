/**
 * Sprint 4.6M – Phase 9 "Ergebnis & Abschluss" des Decision Navigators.
 * Fasst die Ergebnisse der vorherigen Phasen zusammen (keine neuen
 * fachlichen Entscheidungen) und erzeugt beim bewussten Abschluss eine
 * dauerhafte, für die Lehrkraft künftig abrufbare Fallakte.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileText,
  Flag,
  Scale,
  Sparkles,
} from "lucide-react";
import { useAuthSession } from "@/lib/adminAuth";
import { AssistantEmailSignIn } from "@/components/assistant/AssistantEmailSignIn";
import { ASSISTANT_SELECTED_CASE_KEY } from "@/services/assistant";
import type { AssistantSelectedCaseContext } from "@/services/assistant";
import { buildCaseSummary } from "@/services/case-files/buildCaseSummary";
import { createCaseFile } from "@/services/case-files/CaseFileService";

const TRAFFIC_LIGHT_DOT: Record<string, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
  unknown: "bg-muted-foreground",
};

export interface AbschlussStepPanelProps {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  onPatchContext: (patch: Record<string, unknown>) => void;
  canGoBack: boolean;
  onBack: () => void;
  onFinish: () => void;
  onGoTo: (stepId: string) => void;
}

export function AbschlussStepPanel({
  context,
  onFinish,
  onGoTo,
}: AbschlussStepPanelProps) {
  const { ready, user } = useAuthSession();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedCaseNumber, setClosedCaseNumber] = useState<string | null>(null);
  const [confirmingWithOpenPoints, setConfirmingWithOpenPoints] = useState(false);

  const summary = buildCaseSummary(context);
  const selectedCase = context[ASSISTANT_SELECTED_CASE_KEY] as AssistantSelectedCaseContext | undefined;

  const requestClose = () => {
    if (summary.openPoints.length > 0 && !confirmingWithOpenPoints) {
      setConfirmingWithOpenPoints(true);
      return;
    }
    void handleClose();
  };

  const handleClose = async () => {
    setConfirmingWithOpenPoints(false);
    setClosing(true);
    setError(null);
    try {
      const record = await createCaseFile({
        title: summary.title,
        category: summary.category,
        situationSnapshot: (context.situation as Record<string, unknown>) ?? null,
        assessmentSnapshot: (context.assessment as Record<string, unknown>) ?? null,
        actionsSnapshot: (context.actions as Record<string, unknown>) ?? null,
        legalSnapshot: (context.legalContext as Record<string, unknown>) ?? null,
        documentsSnapshot: (context.documentation as Record<string, unknown>) ?? null,
        openPoints: summary.openPoints.map((p) => p.label),
        practiceCaseId: selectedCase?.caseId ?? null,
      });
      setClosedCaseNumber(record.caseNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Fallakte konnte nicht gespeichert werden.");
    } finally {
      setClosing(false);
    }
  };

  if (closedCaseNumber) {
    return (
      <section className="space-y-4">
        <div className="rounded-2xl border border-success/40 bg-success/10 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
            <h3 className="text-base font-semibold text-foreground">Fall abgeschlossen</h3>
          </div>
          <p className="mt-2 text-sm text-foreground/85">
            Die Fallakte <span className="font-mono font-semibold">{closedCaseNumber}</span> wurde
            gespeichert. Sie können sie jederzeit unter „Meine Vorgänge" wieder aufrufen.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/vorgaenge"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Zu meinen Vorgängen
            </Link>
            <button
              type="button"
              onClick={onFinish}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:border-accent"
            >
              Bearbeitung schließen
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Flag className="h-4 w-4 text-accent" aria-hidden="true" /> Handlungsstatus
        </p>
        <p className="mt-2 text-sm text-foreground/85">
          {summary.totalActionsCount > 0
            ? `${summary.completedActionsCount} von ${summary.totalActionsCount} Maßnahmen erledigt.`
            : "Keine Maßnahmen erfasst."}
        </p>
        {summary.openPoints.length === 0 ? (
          <p className="mt-1 text-sm text-success">Alle Punkte bearbeitet.</p>
        ) : (
          <p className="mt-1 text-sm text-warning">
            {summary.openPoints.length} Punkt{summary.openPoints.length === 1 ? "" : "e"} noch offen.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Was ist passiert?</p>
        <p className="mt-2 text-sm text-foreground/85">
          {summary.rawDescription || "Kein Sachverhalt erfasst."}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Bewertung</p>
        {summary.trafficLight ? (
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${TRAFFIC_LIGHT_DOT[summary.trafficLight]}`}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground/85">{summary.assessmentSummary}</span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Noch keine Bewertung vorhanden.</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Maßnahmen</p>
        {summary.actions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Keine Maßnahmen erfasst.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {summary.actions.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm text-foreground/85">
                {a.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="flex-1">{a.title}</span>
                <span className="text-xs text-muted-foreground">{a.statusLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Scale className="h-4 w-4 text-accent" aria-hidden="true" /> Rechtsgrundlagen
        </p>
        {summary.legalReferences.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Keine Rechtsgrundlagen verknüpft.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc text-sm text-foreground/85">
            {summary.legalReferences.map((r) => (
              <li key={r.reference}>
                {r.reference}
                {r.title ? ` – ${r.title}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-accent" aria-hidden="true" /> Dokumente
        </p>
        {summary.documents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Noch keine Dokumente erstellt.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc text-sm text-foreground/85">
            {summary.documents.map((d) => (
              <li key={d.id}>{d.title}</li>
            ))}
          </ul>
        )}
      </section>

      {summary.openPoints.length > 0 && (
        <section className="rounded-2xl border border-warning/50 bg-warning/10 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" /> Vor dem Abschluss
            prüfen
          </p>
          <ul className="mt-2 space-y-1.5">
            {summary.openPoints.map((p) => (
              <li key={p.label} className="flex items-center justify-between gap-2 text-sm text-foreground/85">
                <span>{p.label}</span>
                {p.stepId && (
                  <button
                    type="button"
                    onClick={() => onGoTo(p.stepId!)}
                    className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-accent"
                  >
                    Dorthin springen
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Ein Abschluss ist auch mit offenen Punkten möglich – sie werden in der Fallakte
            vermerkt.
          </p>
        </section>
      )}

      {confirmingWithOpenPoints && (
        <section
          role="alertdialog"
          aria-labelledby="confirm-close-heading"
          className="rounded-2xl border border-warning/60 bg-warning/10 p-5"
        >
          <p id="confirm-close-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            Wirklich mit offenen Punkten abschließen?
          </p>
          <p className="mt-1 text-sm text-foreground/85">
            {summary.openPoints.length} Punkt{summary.openPoints.length === 1 ? "" : "e"} sind noch
            offen. Nach dem Abschluss lässt sich der Fall nicht mehr über den Navigator
            weiterbearbeiten.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleClose()}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Ja, trotzdem abschließen
            </button>
            <button
              type="button"
              onClick={() => setConfirmingWithOpenPoints(false)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:border-accent"
            >
              Abbrechen, noch bearbeiten
            </button>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
          {error}
        </p>
      )}

      {ready && !user && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Anmeldung zum Abschließen erforderlich</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Damit Sie diesen Fall später wiederfinden können, wird er mit Ihrem Konto verknüpft.
          </p>
          <AssistantEmailSignIn />
        </section>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={requestClose}
            disabled={closing || !ready || !user || confirmingWithOpenPoints}
            aria-describedby={!user ? "close-disabled-reason" : undefined}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {closing ? "Wird abgeschlossen …" : "Fall abschließen"}
          </button>
          {!user && (
            <p id="close-disabled-reason" className="text-xs text-muted-foreground">
              {ready ? "Erst nach Anmeldung möglich (siehe oben)." : "Anmeldestatus wird geprüft …"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
