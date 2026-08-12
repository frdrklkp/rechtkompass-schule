/**
 * Sprint 4.6C – Strukturierte Datengrundlage für die Phase „Analyse“.
 * Reine Ableitung aus dem SituationCase, keine Bewertung.
 */
import type { SituationCase } from "@/services/situation-analyzer";
import { labelForField } from "./fieldLabels";

export interface SituationOverviewEntry {
  field: string;
  label: string;
  value: string;
}

export interface SituationOverview {
  title: string;
  category: string;
  rawDescription: string;
  completionPercentage: number;
  isComplete: boolean;
  answeredQuestions: number;
  totalRelevantQuestions: number;
  participantCount: number;
  affectedCount: number;
  witnessCount: number;
  evidenceCount: number;
  measureCount: number;
  unknownEntries: Array<{ questionId: string; title: string; reason: "unknown" | "notAnswered" }>;
  missingRequiredQuestions: string[];
  keyFacts: SituationOverviewEntry[];
  /** Ausreichend Angaben, um eine Bewertung sinnvoll auszuführen? */
  assessable: boolean;
  notAssessableReason: string | null;
}

const KNOWLEDGE_TEXT: Record<string, string> = {
  known: "ja",
  notApplicable: "nein",
  unknown: "unbekannt",
  notAnswered: "nicht beantwortet",
};

function knowledgeText(value: string): string {
  return KNOWLEDGE_TEXT[value] ?? value;
}

export function buildSituationOverview(situation: SituationCase): SituationOverview {
  const keyFields: Array<[string, string]> = [
    ["dangerInformation.acuteDangerReported", situation.dangerInformation.acuteDangerReported],
    ["dangerInformation.emergencyServicesInvolved", situation.dangerInformation.emergencyServicesInvolved],
    ["dangerInformation.ongoing", situation.dangerInformation.ongoing],
    ["incident.isOngoing", situation.incident.isOngoing],
    ["incident.wasRepeated", situation.incident.wasRepeated],
    ["documentationStatus.notesAvailable", situation.documentationStatus.notesAvailable],
  ];

  const keyFacts: SituationOverviewEntry[] = keyFields.map(([field, value]) => ({
    field,
    label: labelForField(field),
    value: knowledgeText(value),
  }));
  keyFacts.push({
    field: "incident.occurredAt",
    label: labelForField("incident.occurredAt"),
    value: situation.incident.occurredAt ?? "nicht erfasst",
  });
  keyFacts.push({
    field: "incident.location",
    label: labelForField("incident.location"),
    value: situation.incident.location || "nicht erfasst",
  });

  const assessable = situation.status === "complete" || situation.completeness.answeredQuestions > 0;

  return {
    title: situation.title || "Ohne Titel",
    category: situation.category || "nicht erfasst",
    rawDescription: situation.rawDescription,
    completionPercentage: situation.completeness.completionPercentage,
    isComplete: situation.completeness.isComplete,
    answeredQuestions: situation.completeness.answeredQuestions,
    totalRelevantQuestions: situation.completeness.totalRelevantQuestions,
    participantCount: situation.participants.length,
    affectedCount: situation.participants.filter((p) => p.isAffected).length,
    witnessCount: situation.witnesses.length,
    evidenceCount: situation.evidence.length,
    measureCount: situation.measuresTaken.length,
    unknownEntries: situation.uncertainties.map((u) => ({
      questionId: u.questionId,
      title: u.title,
      reason: u.reason,
    })),
    missingRequiredQuestions: [...situation.completeness.missingRequiredQuestions],
    keyFacts,
    assessable,
    notAssessableReason: assessable
      ? null
      : "Es wurden noch keine Angaben erfasst. Bitte zunächst die Phase „Situation“ ausfüllen.",
  };
}
