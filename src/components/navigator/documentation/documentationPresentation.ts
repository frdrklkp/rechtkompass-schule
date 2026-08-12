/**
 * Sprint 4.6H – Zentrale Beschriftungen der Dokumentationsphase.
 * Keine Fachlogik – nur Darstellung.
 */
import type {
  DocumentationMissingField,
  DocumentationReadiness,
} from "@/services/documentation-assistant";

export const READINESS_BADGE_CLASS: Record<DocumentationReadiness, string> = {
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  incomplete: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  blocked: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

const FIELD_LABELS: Record<string, string> = {
  date: "Datum",
  datetime: "Zeitpunkt",
  "situation.title": "Titel des Vorgangs",
  "situation.category": "Kategorie",
  "situation.description": "Sachverhaltsbeschreibung",
  "incident.occurredAt": "Zeitpunkt des Vorfalls",
  "incident.location": "Ort des Vorfalls",
  "incident.locationTypeLabel": "Art des Ortes",
  "incident.description": "Beschreibung des Vorfalls",
  "incident.ongoingLabel": "Dauer des Vorfalls",
  "incident.repeatedLabel": "Wiederholung",
  "danger.acuteDangerLabel": "Akute Gefahr",
  "danger.dangerType": "Art der Gefahr",
  "danger.details": "Details zur Gefahr",
  "assessment.trafficLightLabel": "Ampelbewertung",
  "assessment.summary": "Zusammenfassung der Bewertung",
  "assessment.reasonsText": "Begründungen der Bewertung",
  "practiceCase.title": "Praxisfall",
  participants: "Beteiligte",
  witnesses: "Zeuginnen und Zeugen",
  evidence: "Beweismittel",
  measures: "Ergriffene Maßnahmen",
  actions: "Handlungsschritte",
  sources: "Rechtsgrundlagen",
};

/** Lesbare Bezeichnung für eine fehlende Angabe. */
export function missingFieldLabel(field: DocumentationMissingField): string {
  if (field.reason === "ai_disabled") {
    return `Freitextfeld „${field.key.replace(/^ai:/, "")}“ (manuell auszufüllen)`;
  }
  const eachMatch = /^([^[]+)\[\]\.(.+)$/.exec(field.key);
  if (eachMatch) {
    const list = FIELD_LABELS[eachMatch[1]] ?? eachMatch[1];
    const sub = FIELD_LABELS[`${eachMatch[1]}.${eachMatch[2]}`] ?? eachMatch[2];
    return `${list} (Angabe „${sub}“)`;
  }
  return FIELD_LABELS[field.key] ?? field.key;
}
