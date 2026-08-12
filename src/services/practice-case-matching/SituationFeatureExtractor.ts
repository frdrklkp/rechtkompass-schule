/**
 * Sprint 4.6E – Ableitung der Matching-Merkmale aus einem SituationCase.
 * Vollständig deterministisch: nur strukturierte Felder und definierte Signale.
 */
import type { SituationCase } from "@/services/situation-analyzer";
import { tokenize, unique } from "./normalize";
import type {
  MatchLocationType,
  MatchRole,
  MatchSignal,
  SituationMatchFeatures,
} from "./types";

const KNOWN = "known";

function isTrue(state: string | null | undefined): boolean {
  return state === KNOWN;
}

const LOCATION_SIGNALS: Partial<Record<string, MatchSignal>> = {
  classroom: "ortUnterricht",
  schoolyard: "ortSchulgelaende",
  hallway: "ortSchulgelaende",
  gym: "ortSchulgelaende",
  schoolTrip: "ortSchulfahrt",
  online: "ortOnline",
  outsideSchool: "ortAusserhalbSchule",
};

export class SituationFeatureExtractor {
  extract(situation: SituationCase): SituationMatchFeatures {
    const signals: MatchSignal[] = [];
    const unknownAspects: string[] = [];

    /* Gefährdung */
    if (isTrue(situation.dangerInformation.acuteDangerReported)) signals.push("akuteGefahr");
    if (isTrue(situation.dangerInformation.ongoing)) signals.push("gefahrAnhaltend");
    if (isTrue(situation.dangerInformation.emergencyServicesInvolved)) signals.push("notdienstBeteiligt");
    if (situation.dangerInformation.acuteDangerReported === "unknown") unknownAspects.push("Gefährdungslage");

    /* Vorgang */
    if (isTrue(situation.incident.wasRepeated)) signals.push("wiederholung");
    if (isTrue(situation.incident.isOngoing)) signals.push("andauernderVorgang");
    if (situation.incident.dateKnown !== "known") {
      signals.push("zeitpunktUnbekannt");
      unknownAspects.push("Zeitpunkt des Vorgangs");
    }

    /* Ort */
    const locationTypes: MatchLocationType[] = [];
    const locationType = situation.incident.locationType;
    if (locationType && locationType !== "unknown") {
      locationTypes.push(locationType);
      const signal = LOCATION_SIGNALS[locationType];
      if (signal) signals.push(signal);
    } else {
      unknownAspects.push("Ort des Vorgangs");
    }

    /* Beteiligte */
    const roles: MatchRole[] = [];
    for (const participant of situation.participants) {
      if (participant.role && participant.role !== "unknown") roles.push(participant.role);
      if (participant.isAffected) signals.push("betroffenePerson");
      if (participant.isAccused) signals.push("beschuldigtePerson");
      if (participant.ageGroup === "child" || participant.ageGroup === "adolescent") {
        signals.push("minderjaehrigBeteiligt");
      }
      if (participant.ageGroup === "adult") signals.push("volljaehrigBeteiligt");
      switch (participant.role) {
        case "student":
          signals.push("schuelerBeteiligt");
          break;
        case "teacher":
          signals.push("lehrkraftBeteiligt");
          break;
        case "schoolLeadership":
          signals.push("schulleitungBeteiligt");
          break;
        case "parent":
        case "guardian":
          signals.push("elternBeteiligt");
          break;
        case "externalPerson":
          signals.push("externeBeteiligt");
          break;
        default:
          break;
      }
    }
    if (situation.participants.length === 0) unknownAspects.push("Beteiligte Personen");

    /* Zeugen und Nachweise */
    if (situation.witnesses.length > 0) signals.push("zeugenVorhanden");
    const availableEvidence = situation.evidence.filter((e) => e.available);
    if (availableEvidence.length > 0) signals.push("nachweiseVorhanden");
    if (availableEvidence.some((e) => e.secured)) signals.push("nachweiseGesichert");

    /* Dokumentation */
    const doc = situation.documentationStatus;
    const docKnown = [
      doc.notesAvailable,
      doc.incidentReportAvailable,
      doc.conversationRecordAvailable,
    ];
    if (docKnown.some((state) => state === KNOWN)) signals.push("dokumentationVorhanden");
    else signals.push("dokumentationFehlt");
    if (isTrue(doc.schoolLeadershipInformed)) signals.push("schulleitungInformiert");
    if (isTrue(doc.parentContactDocumented)) signals.push("elternkontaktDokumentiert");

    /* Maßnahmen */
    if (situation.measuresTaken.length > 0) signals.push("massnahmenErgriffen");
    else signals.push("keineMassnahmen");

    /* Unklare Angaben aus dem Analyzer übernehmen */
    for (const uncertainty of situation.uncertainties) {
      if (uncertainty.reason === "unknown") unknownAspects.push(uncertainty.title);
    }

    const tokens = unique([
      ...tokenize(situation.title),
      ...tokenize(situation.rawDescription),
      ...tokenize(situation.incident.description),
      ...tokenize(situation.category),
      ...tokenize(situation.incident.location),
      ...situation.evidence.flatMap((e) => tokenize(e.description)),
      ...situation.measuresTaken.flatMap((m) => tokenize(m.description)),
    ]);

    return {
      situationId: situation.caseId,
      categoryHints: situation.category ? [situation.category] : [],
      tokens,
      roles: unique(roles),
      locationTypes: unique(locationTypes),
      signals: unique(signals),
      unknownAspects: unique(unknownAspects),
      completionPercentage: situation.completeness.completionPercentage,
    };
  }
}

export const defaultFeatureExtractor = new SituationFeatureExtractor();
