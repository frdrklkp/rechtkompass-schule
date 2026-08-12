/**
 * Sprint 4.6C – Stabiler Hash über die bewertungsrelevanten Angaben.
 * Dient ausschließlich der Erkennung veralteter Bewertungen (keine Sicherheitsfunktion).
 */
import type { SituationCase } from "@/services/situation-analyzer";

/** Deterministische, sortierte JSON-Darstellung. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** djb2-Hash, konsistent mit der im Projekt verwendeten Delta-Berechnung. */
export function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Bewertungsrelevante Projektion des SituationCase. */
export function assessmentInputProjection(situation: SituationCase): Record<string, unknown> {
  return {
    schemaVersion: situation.schemaVersion,
    caseId: situation.caseId,
    status: situation.status,
    incident: situation.incident,
    dangerInformation: situation.dangerInformation,
    documentationStatus: situation.documentationStatus,
    participants: situation.participants,
    witnesses: situation.witnesses,
    evidence: situation.evidence,
    measuresTaken: situation.measuresTaken,
    responsiblePersonsInformed: situation.responsiblePersonsInformed,
    uncertainties: situation.uncertainties,
    completeness: situation.completeness,
    answers: situation.answers,
    rawDescription: situation.rawDescription,
  };
}

export function computeInputHash(situation: SituationCase): string {
  return djb2(stableStringify(assessmentInputProjection(situation)));
}
