/**
 * Sprint 4.6H – Baut den Dokumentationskontext aus den strukturierten
 * Falldaten des Navigators (SituationCase, AssessmentResult, ActionPlan,
 * LegalContext, bestätigter Praxisfall).
 *
 * Das Ergebnis ist ein flaches, JSON-serialisierbares Kontextobjekt für den
 * PlaceholderResolver der Dokumentengenerierung. Es werden ausschließlich
 * vorhandene Angaben abgebildet – unbekannte Werte bleiben leer und werden
 * vom Resolver als fehlend gemeldet. Keine KI, keine Ergänzungen.
 */
import {
  ACTION_GROUP_LABEL,
  ACTION_PRIORITY_LABEL,
  ACTION_STATUS_LABEL,
  labelForRole,
  type ActionPlan,
} from "@/services/action-engine";
import {
  CONFIDENCE_LABEL,
  SEVERITY_LABEL,
  TRAFFIC_LIGHT_LABEL,
  TRAFFIC_LIGHT_MEANING,
  type AssessmentResult,
} from "@/services/assessment-engine";
import type { LegalContextResult } from "@/services/legal-context";
import type {
  AgeGroup,
  EvidenceType,
  KnowledgeState,
  LocationType,
  MeasureType,
  ParticipantRole,
  SituationCase,
} from "@/services/situation-analyzer";

/** Referenz auf den bestätigten Praxisfall (nur vorhandene Angaben). */
export interface DocumentationPracticeCaseRef {
  id: string;
  title: string;
  version: string | null;
}

export interface DocumentationContextInput {
  navigatorId: string;
  workflowId: string;
  situation: SituationCase | null;
  assessment: AssessmentResult | null;
  actionPlan: ActionPlan | null;
  legalContext: LegalContextResult | null;
  practiceCase: DocumentationPracticeCaseRef | null;
  now?: Date;
}

/* ------------------------------ Label-Helfer ----------------------------- */

function knowledgeLabel(state: KnowledgeState, knownLabel = "Ja"): string {
  switch (state) {
    case "known":
      return knownLabel;
    case "unknown":
      return "unbekannt";
    case "notApplicable":
      return "nicht zutreffend";
    case "notAnswered":
      return "nicht beantwortet";
    default:
      return "unbekannt";
  }
}

const PARTICIPANT_ROLE_LABELS: Record<string, string> = {
  student: "Schülerin/Schüler",
  teacher: "Lehrkraft",
  schoolLeadership: "Schulleitung",
  parent: "Elternteil",
  guardian: "Erziehungsberechtigte Person",
  schoolStaff: "Schulpersonal",
  externalPerson: "Externe Person",
  unknown: "unbekannt",
};

const AGE_GROUP_LABELS: Record<string, string> = {
  child: "Kind",
  adolescent: "Jugendliche/r",
  adult: "Erwachsene/r",
  unknown: "unbekannt",
};

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  document: "Dokument",
  photo: "Foto",
  video: "Video",
  audio: "Audio",
  message: "Nachricht",
  email: "E-Mail",
  witnessStatement: "Zeugenaussage",
  systemLog: "Systemprotokoll",
  other: "Sonstiges",
};

const MEASURE_TYPE_LABELS: Record<string, string> = {
  conversation: "Gespräch",
  separation: "Trennung der Beteiligten",
  parentContact: "Elternkontakt",
  report: "Meldung",
  documentation: "Dokumentation",
  escalation: "Eskalation",
  other: "Sonstiges",
};

const LOCATION_TYPE_LABELS: Record<string, string> = {
  classroom: "Klassenraum",
  schoolyard: "Schulhof",
  hallway: "Flur",
  gym: "Sporthalle",
  schoolTrip: "Klassenfahrt/Exkursion",
  online: "Online",
  outsideSchool: "Außerhalb der Schule",
  unknown: "unbekannt",
};

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

function boolLabel(value: boolean): string {
  return value ? "Ja" : "Nein";
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("de-DE");
}

/* ---------------------------- Bereichs-Mapper ---------------------------- */

function mapParticipants(situation: SituationCase) {
  return situation.participants.map((p) => ({
    displayName: p.displayName,
    role: p.role,
    roleLabel: label(PARTICIPANT_ROLE_LABELS, p.role as ParticipantRole),
    ageGroupLabel: label(AGE_GROUP_LABELS, p.ageGroup as AgeGroup),
    schoolRelation: p.schoolRelation,
    affectedLabel: boolLabel(p.isAffected),
    accusedLabel: boolLabel(p.isAccused),
    witnessLabel: boolLabel(p.isWitness),
    responsibleLabel: boolLabel(p.isResponsiblePerson),
    additionalInformation: p.additionalInformation,
  }));
}

function mapWitnesses(situation: SituationCase) {
  return situation.witnesses.map((w) => ({
    displayName: w.displayName,
    roleLabel: label(PARTICIPANT_ROLE_LABELS, w.role as ParticipantRole),
    statementAvailableLabel: boolLabel(w.statementAvailable),
    statementDocumentedLabel: boolLabel(w.statementDocumented),
    notes: w.notes,
  }));
}

function mapEvidence(situation: SituationCase) {
  return situation.evidence.map((e) => ({
    typeLabel: label(EVIDENCE_TYPE_LABELS, e.type as EvidenceType),
    description: e.description,
    availableLabel: boolLabel(e.available),
    securedLabel: boolLabel(e.secured),
    storageLocation: e.storageLocation,
    createdAt: fmtDate(e.createdAt),
    notes: e.notes,
  }));
}

function mapMeasures(situation: SituationCase) {
  return situation.measuresTaken.map((m) => ({
    typeLabel: label(MEASURE_TYPE_LABELS, m.type as MeasureType),
    description: m.description,
    performedAt: fmtDate(m.performedAt),
    performedBy: m.performedBy,
    documentedLabel: boolLabel(m.documented),
    result: m.result,
  }));
}

function mapAssessment(assessment: AssessmentResult | null) {
  if (!assessment) return null;
  return {
    trafficLight: assessment.trafficLight,
    trafficLightLabel: TRAFFIC_LIGHT_LABEL[assessment.trafficLight],
    trafficLightMeaning: TRAFFIC_LIGHT_MEANING[assessment.trafficLight],
    severityLabel: SEVERITY_LABEL[assessment.severity],
    confidenceLabel: CONFIDENCE_LABEL[assessment.confidence.level],
    summary: assessment.summary,
    evaluatedAt: fmtDate(assessment.evaluatedAt),
    reasons: assessment.reasons.map((r) => ({
      text: r.userFacingText,
      priority: r.priority,
    })),
    reasonsText: assessment.reasons.map((r) => r.userFacingText).join("\n"),
  };
}

function mapActions(plan: ActionPlan | null) {
  if (!plan) return [];
  return plan.actions
    .filter((a) => a.visible && !a.noLongerCurrent)
    .map((a) => ({
      title: a.title,
      description: a.description,
      statusLabel: ACTION_STATUS_LABEL[a.status],
      priorityLabel: ACTION_PRIORITY_LABEL[a.priority],
      groupLabel: ACTION_GROUP_LABEL[a.group],
      responsibleLabel: labelForRole(a.responsibleRole),
      note: a.completionData.note,
      result: a.completionData.result,
      completedAt: a.completionData.completedAt ? fmtDate(a.completionData.completedAt) : "",
    }));
}

function mapLegal(legalContext: LegalContextResult | null) {
  const references = (legalContext?.references ?? []).map((r) => ({
    citation: `${r.source?.shortName ?? r.source?.name ?? "Rechtsgrundlage"} ${r.reference}`.trim(),
    sourceLabel: r.source?.shortName ?? r.source?.name ?? "",
    reference: r.reference,
    title: r.title ?? "",
  }));
  return { count: references.length, references };
}

/**
 * Baut den Platzhalterkontext. Listen stehen zusätzlich auf oberster Ebene
 * bereit (Kompatibilität mit bestehenden Vorlagen).
 */
export function buildDocumentationContext(
  input: DocumentationContextInput,
): Record<string, unknown> {
  const { situation, assessment, actionPlan, legalContext, practiceCase } = input;
  const now = input.now ?? new Date();

  const participants = situation ? mapParticipants(situation) : [];
  const witnesses = situation ? mapWitnesses(situation) : [];
  const evidence = situation ? mapEvidence(situation) : [];
  const measures = situation ? mapMeasures(situation) : [];
  const actions = mapActions(actionPlan);
  const legal = mapLegal(legalContext);

  return {
    date: now.toLocaleDateString("de-DE"),
    datetime: now.toLocaleString("de-DE"),
    situation: situation
      ? {
          title: situation.title,
          category: situation.category,
          description: situation.rawDescription,
          completionPercentage: situation.completeness.completionPercentage,
        }
      : null,
    incident: situation
      ? {
          occurredAt: situation.incident.occurredAt ?? "",
          dateKnownLabel: knowledgeLabel(situation.incident.dateKnown, "bekannt"),
          timeKnownLabel: knowledgeLabel(situation.incident.timeKnown, "bekannt"),
          location: situation.incident.location,
          locationTypeLabel: label(
            LOCATION_TYPE_LABELS,
            situation.incident.locationType as LocationType,
          ),
          description: situation.incident.description,
          ongoingLabel: knowledgeLabel(situation.incident.isOngoing),
          repeatedLabel: knowledgeLabel(situation.incident.wasRepeated),
        }
      : null,
    danger: situation
      ? {
          acuteDangerLabel: knowledgeLabel(situation.dangerInformation.acuteDangerReported),
          dangerType: situation.dangerInformation.dangerType,
          affectedPersons: situation.dangerInformation.affectedPersons,
          ongoingLabel: knowledgeLabel(situation.dangerInformation.ongoing),
          emergencyServicesLabel: knowledgeLabel(
            situation.dangerInformation.emergencyServicesInvolved,
          ),
          details: situation.dangerInformation.details,
        }
      : null,
    documentationStatus: situation
      ? {
          notesAvailableLabel: knowledgeLabel(situation.documentationStatus.notesAvailable),
          incidentReportAvailableLabel: knowledgeLabel(
            situation.documentationStatus.incidentReportAvailable,
          ),
          conversationRecordAvailableLabel: knowledgeLabel(
            situation.documentationStatus.conversationRecordAvailable,
          ),
          parentContactDocumentedLabel: knowledgeLabel(
            situation.documentationStatus.parentContactDocumented,
          ),
          schoolLeadershipInformedLabel: knowledgeLabel(
            situation.documentationStatus.schoolLeadershipInformed,
          ),
          otherDocumentation: situation.documentationStatus.otherDocumentation,
        }
      : null,
    assessment: mapAssessment(assessment),
    legal,
    practiceCase: practiceCase
      ? { id: practiceCase.id, title: practiceCase.title, version: practiceCase.version ?? "" }
      : null,
    meta: {
      navigatorId: input.navigatorId,
      workflowId: input.workflowId,
      generatedAt: now.toISOString(),
    },
    // Oberste Ebene (Vorlagenkompatibilität)
    participants,
    witnesses,
    evidence,
    measures,
    actions,
    sources: legal.references,
  };
}
