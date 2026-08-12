/**
 * Sprint 4.6A – Container-Komponente des Decision Navigators.
 * Sprint 4.6B.1 – Zentraler Step Renderer, sichtbarer Phasenablauf und Session-Steuerung.
 * Verbindet Engine-Controller und Präsentationskomponenten.
 */
import { NavigationButtons } from "./NavigationButtons";
import { NavigatorFooter } from "./NavigatorFooter";
import { NavigatorHeader } from "./NavigatorHeader";
import { NavigatorProgressBar } from "./NavigatorProgress";
import { NavigatorSessionControls } from "./NavigatorSessionControls";
import { NavigatorStep } from "./NavigatorStep";
import { getStepView, NavigatorStepRenderer } from "./NavigatorStepRenderer";
import { NavigatorStepper } from "./NavigatorStepper";
import { isSituationComplete } from "./situation/SituationStepPanel";
import type { DecisionNavigatorController } from "@/hooks/navigator/useDecisionNavigator";
import { NAVIGATOR_DEMO_CONTEXT_KEY } from "@/services/decision-navigator";

const STATUS_LABEL: Record<string, string> = {
  idle: "bereit",
  running: "in Bearbeitung",
  paused: "pausiert",
  cancelled: "abgebrochen",
  finished: "abgeschlossen",
};

export interface DecisionNavigatorProps {
  nav: DecisionNavigatorController;
  onLeave?: () => void;
  onResetSession?: () => void;
}

export function DecisionNavigator({ nav, onLeave, onResetSession }: DecisionNavigatorProps) {
  if (!nav.ready || !nav.state || !nav.currentStep || !nav.flow) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Navigator wird vorbereitet …
      </div>
    );
  }

  const index = nav.steps.findIndex((s) => s.id === nav.currentStep!.id);
  const finished = nav.state.status === "finished" || nav.state.status === "cancelled";
  const isSituationStep = nav.currentStep.id === "situation";
  const situationComplete = isSituationComplete(nav.context);
  const canGoNext = nav.canGoNext && (!isSituationStep || situationComplete);
  const isDemo = nav.context[NAVIGATOR_DEMO_CONTEXT_KEY] === true;
  const stepView = getStepView(nav.currentStep.id);

  const nextBlockedReason =
    isSituationStep && !situationComplete
      ? "„Weiter“ ist erst möglich, wenn alle sichtbaren Pflichtangaben beantwortet oder ausdrücklich als unbekannt markiert wurden und die Situation abgeschlossen ist."
      : null;

  return (
    <div className="space-y-5">
      <NavigatorHeader
        title={isDemo ? "Decision Navigator – Demo" : nav.flow.title}
        subtitle={nav.flow.description}
        statusLabel={STATUS_LABEL[nav.state.status] ?? nav.state.status}
      />
      {isDemo && (
        <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-foreground">
          Demo-Bearbeitung mit Beispieldaten – keine rechtliche Bewertung, keine echten Personen.
        </p>
      )}

      <NavigatorProgressBar progress={nav.state.progress} stepIndex={index} />
      <NavigatorStepper steps={nav.steps} currentStepId={nav.currentStep.id} />

      <NavigatorSessionControls
        status={nav.state.status}
        isDemo={isDemo}
        onPause={nav.pause}
        onResume={nav.resume}
        onCancel={nav.cancel}
        onRestart={nav.restart}
        onLeave={() => {
          nav.leave();
          onLeave?.();
        }}
        onResetDemo={() => {
          nav.resetSession();
          onResetSession?.();
        }}
      />

      <NavigatorStep step={nav.currentStep} hasContent />
      <NavigatorStepRenderer
        stepId={nav.currentStep.id}
        navigatorId={nav.state.navigatorId}
        workflowId={nav.state.workflowId}
        context={nav.context}
        patchContext={nav.patchContext}
        canGoBack={nav.canGoBack}
        onBack={nav.back}
        onNext={nav.next}
      />
      {!stepView.available && (
        <p className="text-xs text-muted-foreground">
          Diese Phase ist im Ablauf sichtbar, fachlich aber noch nicht umgesetzt.
        </p>
      )}

      <NavigatorFooter
        error={nav.error}
        hint={
          nav.restored
            ? "Die Bearbeitung wurde am zuletzt bearbeiteten Schritt fortgesetzt."
            : "Sie können die Bearbeitung jederzeit unterbrechen und später fortsetzen."
        }
      >
        <NavigationButtons
          canGoBack={nav.canGoBack}
          canGoNext={canGoNext}
          canSkip={nav.canSkip}
          finished={finished}
          onBack={nav.back}
          onNext={nav.next}
          onSkip={nav.skip}
          onCancel={nav.cancel}
          onRestart={nav.restart}
        />
        {nextBlockedReason && (
          <p role="status" className="text-xs text-muted-foreground">
            {nextBlockedReason}
          </p>
        )}
      </NavigatorFooter>
    </div>
  );
}
