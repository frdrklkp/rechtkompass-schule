/**
 * Sprint 4.6B.1 – Zentrale Zuordnung zwischen Navigator-Schritt und Oberfläche.
 * Einzige Stelle, an der entschieden wird, welche Ansicht eine Phase rendert.
 */
import type { ReactNode } from "react";
import { NavigatorStepPlaceholder } from "./NavigatorStepPlaceholder";
import { SituationStepPanel } from "./situation/SituationStepPanel";
import { AnalysisStepPanel } from "./assessment/AnalysisStepPanel";
import { AssessmentStepPanel } from "./assessment/AssessmentStepPanel";
import { ActionStepPanel } from "./actions/ActionStepPanel";
import { LegalContextStepPanel } from "./legal/LegalContextStepPanel";
import { DocumentationStepPanel } from "./documentation/DocumentationStepPanel";
import { NAVIGATOR_DEMO_CONTEXT_KEY } from "@/services/decision-navigator";

export interface NavigatorStepViewProps {
  navigatorId: string;
  workflowId: string;
  context: Record<string, unknown>;
  patchContext: (patch: Record<string, unknown>) => void;
  canGoBack: boolean;
  onBack: () => void;
  onNext?: () => void;
}

export interface NavigatorStepViewEntry {
  /** Fachlich bereits umgesetzt? */
  available: boolean;
  /** Kurzer künftiger Zweck – für Platzhalter und Stepper. */
  purpose: string;
  /** Aktueller Entwicklungsstatus. */
  status: string;
  render: (props: NavigatorStepViewProps) => ReactNode;
}

function placeholder(title: string, purpose: string, status: string): NavigatorStepViewEntry {
  return {
    available: false,
    purpose,
    status,
    render: (p) => (
      <NavigatorStepPlaceholder
        title={title}
        purpose={purpose}
        status={status}
        canGoBack={p.canGoBack}
        onBack={p.onBack}
      />
    ),
  };
}

export const NAVIGATOR_STEP_VIEWS: Record<string, NavigatorStepViewEntry> = {
  start: {
    available: true,
    purpose: "Einstieg in die Bearbeitung.",
    status: "Verfügbar.",
    render: (p) => (
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground">Bearbeitung beginnen</h3>
        <p className="mt-2 text-sm text-foreground/85">
          Der Navigator führt Sie in neun Phasen durch den Vorgang. Sie können jederzeit
          unterbrechen und später fortsetzen.
        </p>
        {p.context[NAVIGATOR_DEMO_CONTEXT_KEY] === true && (
          <p className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-foreground">
            Dies ist eine Demo-Bearbeitung mit Beispieldaten. Alle Angaben sind frei editierbar und
            haben keine rechtliche Bedeutung.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Bitte keine vollständigen Namen oder unnötigen personenbezogenen Daten erfassen.
        </p>
      </section>
    ),
  },
  situation: {
    available: true,
    purpose: "Strukturierte Erfassung des Sachverhalts.",
    status: "Verfügbar.",
    render: (p) => (
      <SituationStepPanel
        navigatorId={p.navigatorId}
        workflowId={p.workflowId}
        context={p.context}
        onPatchContext={p.patchContext}
      />
    ),
  },
  analyse: {
    available: true,
    purpose: "Strukturierte Zusammenführung der erfassten Angaben.",
    status: "Verfügbar.",
    render: (p) => (
      <AnalysisStepPanel
        context={p.context}
        canGoBack={p.canGoBack}
        onBack={p.onBack}
        onNext={p.onNext}
      />
    ),
  },
  bewertung: {
    available: true,
    purpose: "Regelbasierte Ampelbewertung der erfassten Angaben.",
    status: "Verfügbar.",
    render: (p) => (
      <AssessmentStepPanel
        navigatorId={p.navigatorId}
        workflowId={p.workflowId}
        context={p.context}
        onPatchContext={p.patchContext}
        canGoBack={p.canGoBack}
        onBack={p.onBack}
      />
    ),
  },
  sofortmassnahmen: {
    available: true,
    purpose: "Regelbasierte, priorisierte Handlungsschritte.",
    status: "Verfügbar.",
    render: (p) => (
      <ActionStepPanel
        navigatorId={p.navigatorId}
        workflowId={p.workflowId}
        context={p.context}
        onPatchContext={p.patchContext}
        canGoBack={p.canGoBack}
        onBack={p.onBack}
      />
    ),
  },
  dokumentation: {
    available: true,
    purpose: "Dokumente aus den erfassten Angaben erzeugen, prüfen und exportieren.",
    status: "Verfügbar.",
    render: (p) => (
      <DocumentationStepPanel
        navigatorId={p.navigatorId}
        workflowId={p.workflowId}
        context={p.context}
        onPatchContext={p.patchContext}
        canGoBack={p.canGoBack}
        onBack={p.onBack}
      />
    ),
  },
  rechtsgrundlagen: {
    available: true,
    purpose: "Kuratierte Rechtsgrundlagen des bestätigten Praxisfalls.",
    status: "Verfügbar.",
    render: (p) => (
      <LegalContextStepPanel
        navigatorId={p.navigatorId}
        workflowId={p.workflowId}
        context={p.context}
        onPatchContext={p.patchContext}
        canGoBack={p.canGoBack}
        onBack={p.onBack}
      />
    ),
  },
  vorlagen: placeholder(
    "Vorlagen",
    "Später werden hier passende Dokumentvorlagen vorgeschlagen.",
    "Diese Phase wird in einem späteren Sprint ergänzt.",
  ),
  abschluss: placeholder(
    "Abschluss",
    "Später wird hier die Bearbeitung zusammengefasst und abgeschlossen.",
    "Die Abschlussansicht wird in einem späteren Sprint ergänzt.",
  ),
};

export function getStepView(stepId: string): NavigatorStepViewEntry {
  return (
    NAVIGATOR_STEP_VIEWS[stepId] ??
    placeholder(stepId, "Diese Phase ist noch nicht beschrieben.", "Folgt in einem späteren Sprint.")
  );
}

export function isStepAvailable(stepId: string): boolean {
  return getStepView(stepId).available;
}

/** Zentraler Step Renderer. */
export function NavigatorStepRenderer({
  stepId,
  ...props
}: NavigatorStepViewProps & { stepId: string }) {
  return <>{getStepView(stepId).render(props)}</>;
}
