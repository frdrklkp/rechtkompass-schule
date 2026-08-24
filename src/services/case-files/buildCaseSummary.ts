/**
 * Sprint 4.6M – Reine Zusammenführung der Navigator-Kontextdaten zu einer
 * Abschluss-Zusammenfassung (Phase 9) und zum Snapshot für die Fallakte.
 * Trifft keine neuen fachlichen Entscheidungen – liest ausschließlich, was
 * in den vorherigen Phasen bereits erfasst wurde.
 */
import {
  ACTION_CONTEXT_KEY,
  ACTION_STATUS_LABEL,
  type ActionContextEntry,
  type ActionStatus,
} from "@/services/action-engine";
import {
  ASSESSMENT_CONTEXT_KEY,
  TRAFFIC_LIGHT_LABEL,
  type AssessmentContextEntry,
  type TrafficLight,
} from "@/services/assessment-engine";
import { SITUATION_CONTEXT_KEY, type SituationCase } from "@/services/situation-analyzer";
import { LEGAL_CONTEXT_KEY, type LegalContextResult } from "@/services/legal-context";
import {
  DOCUMENTATION_CONTEXT_KEY,
  type DocumentationContextEntry,
} from "@/services/documentation-assistant";

export interface CaseSummaryAction {
  id: string;
  title: string;
  status: ActionStatus;
  statusLabel: string;
}

export interface CaseSummaryLegalReference {
  reference: string;
  title: string | null;
}

export interface CaseSummaryDocument {
  id: string;
  title: string;
  status: string;
}

export interface CaseSummaryOpenPoint {
  label: string;
  stepId: string | null;
}

export interface CaseSummary {
  title: string;
  category: string | null;
  rawDescription: string;
  hasSituation: boolean;
  trafficLight: TrafficLight | null;
  trafficLightLabel: string | null;
  assessmentSummary: string | null;
  actions: CaseSummaryAction[];
  completedActionsCount: number;
  totalActionsCount: number;
  legalReferences: CaseSummaryLegalReference[];
  documents: CaseSummaryDocument[];
  openPoints: CaseSummaryOpenPoint[];
}

export function buildCaseSummary(context: Record<string, unknown>): CaseSummary {
  const situation = context[SITUATION_CONTEXT_KEY] as SituationCase | undefined;
  const assessmentEntry = context[ASSESSMENT_CONTEXT_KEY] as AssessmentContextEntry | undefined;
  const actionEntry = context[ACTION_CONTEXT_KEY] as ActionContextEntry | undefined;
  const legal = context[LEGAL_CONTEXT_KEY] as LegalContextResult | undefined;
  const documentation = context[DOCUMENTATION_CONTEXT_KEY] as DocumentationContextEntry | undefined;

  const assessment = assessmentEntry?.result ?? null;
  const actionPlan = actionEntry?.plan ?? null;
  const actions: CaseSummaryAction[] = (actionPlan?.actions ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    statusLabel: ACTION_STATUS_LABEL[a.status],
  }));
  const completedActionsCount = actions.filter((a) => a.status === "completed").length;
  const openPoints: CaseSummaryOpenPoint[] = [];

  if (!situation) {
    openPoints.push({ label: "Sachverhalt noch nicht erfasst.", stepId: "situation" });
  }
  if (!assessment) {
    openPoints.push({ label: "Bewertung noch nicht abgeschlossen.", stepId: "bewertung" });
  }
  const openActions = actions.filter((a) => a.status === "open" || a.status === "inProgress");
  if (openActions.length > 0) {
    openPoints.push({
      label: `${openActions.length} Maßnahme${openActions.length === 1 ? "" : "n"} noch offen: ${openActions
        .map((a) => a.title)
        .join(", ")}`,
      stepId: "sofortmassnahmen",
    });
  }
  if (!legal || legal.references.length === 0) {
    openPoints.push({ label: "Keine Rechtsgrundlagen verknüpft.", stepId: "rechtsgrundlagen" });
  }
  if (!documentation || documentation.drafts.length === 0) {
    openPoints.push({ label: "Noch keine Dokumente erstellt.", stepId: "vorlagen" });
  }

  return {
    title: situation?.title || "Unbenannter Fall",
    category: situation?.category ?? null,
    rawDescription: situation?.rawDescription ?? "",
    hasSituation: !!situation,
    trafficLight: assessment?.trafficLight ?? null,
    trafficLightLabel: assessment ? TRAFFIC_LIGHT_LABEL[assessment.trafficLight] : null,
    assessmentSummary: assessment?.summary ?? null,
    actions,
    completedActionsCount,
    totalActionsCount: actions.length,
    legalReferences: (legal?.references ?? []).map((r) => ({ reference: r.reference, title: r.title })),
    documents: (documentation?.drafts ?? []).map((d) => ({ id: d.id, title: d.title, status: d.status })),
    openPoints,
  };
}
