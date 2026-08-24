/**
 * Assistant-Konstanten und -Typen, die für die Übergabe an den Decision
 * Navigator gebraucht werden (kachelbasierte Erfassung, siehe ./tile-intake).
 *
 * Grundsätze:
 * - Vollständig deterministisch. Keine KI, keine Rechtsauslegung, keine
 *   erfundenen Tatsachen.
 * - Es entsteht keine zweite Situations-, Matching- oder Navigatorlogik.
 */
/** Navigator-/Workflow-Kennungen der Assistenten-Übergabe. */
export const ASSISTANT_NAVIGATOR_ID = "aktueller-vorgang";
export const ASSISTANT_WORKFLOW_ID = "assistent-uebergabe";

/** Kontext-Schlüssel, unter dem die Herkunft im Navigator hinterlegt wird. */
export const ASSISTANT_CONTEXT_KEY = "assistantHandoff";

/** Kontext-Schlüssel der Sitzungsreferenz (Nachvollziehbarkeit der Herkunft). */
export const ASSISTANT_SESSION_REFERENCE_KEY = "assistantSessionReference";

/** Kontext-Schlüssel des ausdrücklich bestätigten Praxisfalls. */
export const ASSISTANT_SELECTED_CASE_KEY = "selectedPracticeCase";

/** Phase, an der der Navigator nach der Übergabe standardmäßig geöffnet wird. */
export const ASSISTANT_HANDOFF_STEP_ID = "analyse";

/**
 * Im Navigator hinterlegte Angaben zum bestätigten Praxisfall. Es werden
 * ausschließlich vorhandene Falldaten übernommen – keine Ergänzungen.
 */
export interface AssistantSelectedCaseContext {
  caseId: string;
  title: string;
  /** Stand des Praxisfalls (Änderungszeitpunkt) als Versionsangabe. */
  version: string | null;
  /** true, wenn ein kuratierter Entscheidungsbaum vorliegt. */
  curated: boolean;
  legalSectionIds: string[];
  templateIds: string[];
  matchLevel: string | null;
  matchScore: number | null;
}

/** Referenz auf die Assistenten-Sitzung im Navigator-Kontext. */
export interface AssistantSessionReference {
  sessionId: string;
  startedAt: string;
  handedOverAt: string;
  answeredQuestionIds: string[];
  coverageLevel: string | null;
}
