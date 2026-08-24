/**
 * Tier 3 – Top-Level-Container der Kachel-Erfassung. Ersetzt die frühere
 * Freitext-DecisionAssistant-Komponente unter /assistent.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import type { TileIntakeController } from "@/hooks/assistant/useTileIntake";
import type { TileSequenceStep } from "@/services/assistant/tile-intake";
import { TileIntakeModeChoice } from "./TileIntakeModeChoice";
import { TileQuestionScreen } from "./TileQuestionScreen";
import { TileIntakeParticipantsStep } from "./TileIntakeParticipantsStep";
import { TileIntakeEvidenceStep } from "./TileIntakeEvidenceStep";
import { TileIntakeWitnessStep } from "./TileIntakeWitnessStep";
import { TileIntakeMeasureStep } from "./TileIntakeMeasureStep";
import { TileIntakeOptionalDetailsIntro } from "./TileIntakeOptionalDetailsIntro";
import { TileIntakeQuickResult } from "./TileIntakeQuickResult";

export interface TileIntakeContainerProps {
  controller: TileIntakeController;
}

export function TileIntakeContainer({ controller }: TileIntakeContainerProps) {
  const { session, hydrated } = controller;
  const [docError, setDocError] = useState<string | null>(null);

  const mode = session?.mode ?? null;
  const stage = session?.stage ?? "modeChoice";
  const inQuestionStages = stage === "questions" || stage === "optionalDetails";
  const step = inQuestionStages ? controller.currentStep() : null;
  const showOptionalIntro = stage === "optionalDetails" && !session?.optionalDetailsStarted;

  /* "Fall dokumentieren": nach der letzten Frage automatisch übergeben. */
  useEffect(() => {
    const ready =
      (stage === "questions" && mode === "dokumentieren" && !step) ||
      (stage === "optionalDetails" &&
        session?.optionalDetailsStarted &&
        mode === "dokumentieren" &&
        !step);
    if (!ready) return;
    const result = controller.completeAndHandoff();
    if (result && !result.valid) {
      setDocError(
        result.validation.issues[0]?.message ??
          "Es fehlen noch Pflichtangaben. Bitte gehen Sie zurück und ergänzen Sie diese.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, mode, step, session?.optionalDetailsStarted, controller.completeAndHandoff]);

  if (!hydrated || !session) {
    return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  }

  if (docError) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
        <p className="font-semibold">Fall konnte noch nicht übergeben werden</p>
        <p className="mt-1 text-xs text-muted-foreground">{docError}</p>
        <button
          type="button"
          onClick={() => {
            setDocError(null);
            controller.back();
          }}
          className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-accent"
        >
          Zurück zur Erfassung
        </button>
      </div>
    );
  }

  if (stage === "handedOff") {
    return (
      <section className="rounded-2xl border border-success/50 bg-success/10 p-4">
        <h2 className="text-base font-semibold text-foreground">
          <CheckCircle2 className="mr-1 inline h-4 w-4 text-success" aria-hidden="true" />
          Fall angelegt
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ihre Angaben wurden übernommen und bereits ausgewertet – Sie müssen nichts erneut eingeben.
        </p>
        {controller.selectedSource && (
          <p className="mt-1 text-xs text-muted-foreground">
            Passender Praxisfall „{controller.selectedSource.title}“ wurde automatisch verknüpft – die
            Rechtsgrundlagen-Phase ist bereits befüllt.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/navigator"
            search={{ fortsetzen: true }}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            Fall bearbeiten <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={controller.reset}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm hover:border-accent"
          >
            Neue Fallschilderung beginnen
          </button>
        </div>
      </section>
    );
  }

  if (stage === "modeChoice") {
    return <TileIntakeModeChoice onChoose={controller.chooseMode} />;
  }

  if (stage === "quickResult" && session.matchResult) {
    return (
      <TileIntakeQuickResult
        matchResult={session.matchResult}
        sources={controller.sources}
        selectedCaseId={session.selectedCaseId}
        rawDescription={session.situation.rawDescription}
        onSelect={controller.selectCase}
        onUpgrade={() => {
          const result = controller.upgradeToDocumentation();
          if (result && !result.valid) {
            setDocError(
              result.validation.issues[0]?.message ??
                "Es fehlen noch Pflichtangaben für die Dokumentation.",
            );
          }
        }}
        onRestart={controller.reset}
      />
    );
  }

  if (showOptionalIntro) {
    return (
      <TileIntakeOptionalDetailsIntro
        onStart={controller.startOptionalDetails}
        onSkip={controller.skipOptionalDetails}
      />
    );
  }

  if (inQuestionStages && step) {
    const progress = controller.progress();
    const canGoBack = stage === "questions" ? progress.index > 0 : true;

    return renderStep(controller, step, progress, canGoBack, session);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
      <p>Die Erfassung wird ausgewertet …</p>
      <button
        type="button"
        onClick={controller.reset}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium hover:border-accent"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Neu starten
      </button>
    </div>
  );
}

function renderStep(
  controller: TileIntakeController,
  step: TileSequenceStep,
  progress: { index: number; total: number },
  canGoBack: boolean,
  session: NonNullable<TileIntakeController["session"]>,
) {
  if (step.kind === "participants") {
    return (
      <TileIntakeParticipantsStep
        step={step}
        progress={progress}
        participants={session.situation.participants}
        onAdd={controller.addParticipant}
        onUpdate={controller.updateParticipant}
        onRemove={controller.removeParticipant}
        onConfirm={controller.confirmEditorStep}
        onBack={controller.back}
        canGoBack={canGoBack}
      />
    );
  }

  if (step.kind === "evidence") {
    return (
      <TileIntakeEvidenceStep
        step={step}
        progress={progress}
        evidence={session.situation.evidence}
        onAdd={controller.addEvidence}
        onRemove={controller.removeEvidence}
        onConfirm={controller.confirmEditorStep}
        onBack={controller.back}
        canGoBack={canGoBack}
      />
    );
  }

  if (step.kind === "witnesses") {
    return (
      <TileIntakeWitnessStep
        step={step}
        progress={progress}
        witnesses={session.situation.witnesses}
        participants={session.situation.participants}
        onAdd={controller.addWitness}
        onRemove={controller.removeWitness}
        onConfirm={controller.confirmEditorStep}
        onBack={controller.back}
        canGoBack={canGoBack}
      />
    );
  }

  if (step.kind === "measures") {
    return (
      <TileIntakeMeasureStep
        step={step}
        progress={progress}
        measures={session.situation.measuresTaken}
        onAdd={controller.addMeasure}
        onRemove={controller.removeMeasure}
        onConfirm={controller.confirmEditorStep}
        onBack={controller.back}
        canGoBack={canGoBack}
      />
    );
  }

  return (
    <TileQuestionScreen
      step={step}
      progress={progress}
      onAnswer={controller.answer}
      onUnknown={controller.markUnknown}
      onBack={controller.back}
      canGoBack={canGoBack}
    />
  );
}
