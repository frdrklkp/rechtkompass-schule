/**
 * Sprint 4.6C – Verständliche Bezeichnungen für technische Feldpfade.
 * Die UI darf keine Feldpfade als alleinige Erklärung anzeigen.
 */

export const ASSESSMENT_FIELD_LABELS: Record<string, string> = {
  "dangerInformation.acuteDangerReported": "Meldung einer akuten Gefahr",
  "dangerInformation.ongoing": "Andauern der Gefahr",
  "dangerInformation.emergencyServicesInvolved": "Einsatz externer Notfallstellen",
  "dangerInformation.affectedPersons": "Unmittelbar betroffene Personen",
  "incident.isOngoing": "Andauern der Situation",
  "incident.wasRepeated": "Wiederholtes Geschehen",
  "incident.occurredAt": "Zeitpunkt des Vorfalls",
  "incident.dateKnown": "Datum des Vorfalls",
  "incident.location": "Ort des Vorfalls",
  "documentationStatus.notesAvailable": "Vorhandene Notizen",
  "documentationStatus.incidentReportAvailable": "Vorfallsbericht",
  "documentationStatus.conversationRecordAvailable": "Gesprächsnotiz",
  "documentationStatus.parentContactDocumented": "Dokumentierter Elternkontakt",
  "documentationStatus.schoolLeadershipInformed": "Information der Schulleitung",
  participants: "Beteiligte Personen",
  witnesses: "Zeuginnen und Zeugen",
  evidence: "Nachweise",
  measuresTaken: "Bereits durchgeführte Maßnahmen",
  "completeness.completionPercentage": "Vollständigkeit der Erfassung",
};

export function labelForField(field: string): string {
  return ASSESSMENT_FIELD_LABELS[field] ?? field;
}
