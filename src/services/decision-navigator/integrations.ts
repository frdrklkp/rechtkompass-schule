/**
 * Sprint 4.6A – Integrationspunkte des Decision Navigators.
 *
 * Diese Ports sind bewusst NUR deklariert. Es findet in dieser Version keine
 * Anbindung an Workflow Engine, Praxisfälle, Rechtsquellen, Dokumentengenerator
 * oder KI statt. Bestehende Komponenten bleiben unverändert.
 */
import type { NavigatorFlowDefinition, NavigatorState, NavigatorStep } from "./types";

/** Liefert den Ablauf zu einem Fall/Workflow (später: Workflow Engine). */
export interface NavigatorFlowProviderPort {
  getFlow(flowId: string): Promise<NavigatorFlowDefinition | null>;
}

/** Verknüpfung mit einer Workflow-Session (später: Workflow Runtime). */
export interface NavigatorWorkflowBridgePort {
  linkSession(state: NavigatorState): Promise<{ workflowSessionId: string } | null>;
}

/** Fachliche Inhalte je Schritt (später: Praxisfälle). */
export interface NavigatorCaseContentPort {
  contentForStep(step: NavigatorStep, state: NavigatorState): Promise<unknown>;
}

/** Rechtsquellen zu einem Schritt (später: Legal Knowledge Center). */
export interface NavigatorLegalSourcePort {
  sourcesForStep(step: NavigatorStep, state: NavigatorState): Promise<unknown[]>;
}

/** Dokumentvorschläge (später: Dokumentengenerator). */
export interface NavigatorDocumentPort {
  documentsForStep(step: NavigatorStep, state: NavigatorState): Promise<unknown[]>;
}

/** Unterstützende KI-Funktionen (später: AI Layer). */
export interface NavigatorAssistancePort {
  assist(step: NavigatorStep, state: NavigatorState): Promise<unknown>;
}

export interface NavigatorIntegrations {
  flows?: NavigatorFlowProviderPort;
  workflow?: NavigatorWorkflowBridgePort;
  cases?: NavigatorCaseContentPort;
  legal?: NavigatorLegalSourcePort;
  documents?: NavigatorDocumentPort;
  assistance?: NavigatorAssistancePort;
}
