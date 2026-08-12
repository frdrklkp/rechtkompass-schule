/**
 * Sprint 4.6B – Abbildung zwischen Antworten und strukturiertem SituationCase.
 * Reine Übersetzung, keine Bewertung.
 */
import { STANDARD_SITUATION_SCHEMA_ID } from "./standardSituationSchema";
import {
  SITUATION_SCHEMA_VERSION,
  type AnswerStatus,
  type KnowledgeState,
  type SituationAnswer,
  type SituationCase,
  type SituationCompleteness,
  type SituationDangerInformation,
  type SituationDocumentationStatus,
  type SituationIncident,
} from "./types";

export class SituationDataError extends Error {
  constructor(
    public readonly code: "invalid_json" | "invalid_shape" | "incompatible_version",
    message: string,
  ) {
    super(message);
    this.name = "SituationDataError";
  }
}

export function createSituationId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    /* Fallback unten */
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

const EMPTY_COMPLETENESS: SituationCompleteness = {
  totalRelevantQuestions: 0,
  answeredQuestions: 0,
  unknownQuestions: 0,
  notApplicableQuestions: 0,
  missingRequiredQuestions: [],
  completionPercentage: 0,
  isComplete: false,
};

function emptyIncident(): SituationIncident {
  return {
    occurredAt: null,
    dateKnown: "notAnswered",
    timeKnown: "notAnswered",
    location: "",
    locationType: "unknown",
    isOngoing: "notAnswered",
    wasRepeated: "notAnswered",
    description: "",
  };
}

function emptyDanger(): SituationDangerInformation {
  return {
    acuteDangerReported: "notAnswered",
    dangerType: "",
    affectedPersons: [],
    ongoing: "notAnswered",
    emergencyServicesInvolved: "notAnswered",
    details: "",
  };
}

function emptyDocumentation(): SituationDocumentationStatus {
  return {
    notesAvailable: "notAnswered",
    incidentReportAvailable: "notAnswered",
    conversationRecordAvailable: "notAnswered",
    parentContactDocumented: "notAnswered",
    schoolLeadershipInformed: "notAnswered",
    otherDocumentation: "",
  };
}

export interface CreateSituationCaseInput {
  navigatorId: string;
  workflowId: string;
  schemaId?: string;
  now?: () => Date;
}

export class SituationCaseMapper {
  static createEmpty(input: CreateSituationCaseInput): SituationCase {
    const ts = (input.now ?? (() => new Date()))().toISOString();
    return {
      schemaVersion: SITUATION_SCHEMA_VERSION,
      schemaId: input.schemaId ?? STANDARD_SITUATION_SCHEMA_ID,
      caseId: createSituationId("sit"),
      navigatorId: input.navigatorId,
      workflowId: input.workflowId,
      title: "",
      rawDescription: "",
      category: "",
      incident: emptyIncident(),
      participants: [],
      witnesses: [],
      evidence: [],
      dangerInformation: emptyDanger(),
      measuresTaken: [],
      documentationStatus: emptyDocumentation(),
      responsiblePersonsInformed: [],
      answers: {},
      uncertainties: [],
      completeness: { ...EMPTY_COMPLETENESS },
      createdAt: ts,
      updatedAt: ts,
      status: "notStarted",
    };
  }

  /** Bekannter Zustand aus einem Antwortstatus ableiten (rein strukturell). */
  static knowledgeFromStatus(status: AnswerStatus | undefined): KnowledgeState {
    switch (status) {
      case "answered":
        return "known";
      case "unknown":
        return "unknown";
      case "notApplicable":
        return "notApplicable";
      default:
        return "notAnswered";
    }
  }

  /** Projiziert die Antworten des Standardschemas in die strukturierten Felder. */
  static applyStandardProjection(situationCase: SituationCase): SituationCase {
    const a = situationCase.answers;
    const read = (id: string): SituationAnswer | undefined => a[id];
    const text = (id: string): string => {
      const answer = read(id);
      return answer?.answerStatus === "answered" && typeof answer.value === "string"
        ? answer.value
        : "";
    };
    const bool = (id: string): KnowledgeState => {
      const answer = read(id);
      if (!answer) return "notAnswered";
      if (answer.answerStatus !== "answered") return SituationCaseMapper.knowledgeFromStatus(answer.answerStatus);
      return answer.value === true ? "known" : answer.value === false ? "notApplicable" : "notAnswered";
    };
    const flag = (id: string): KnowledgeState => {
      const answer = read(id);
      if (!answer || answer.answerStatus !== "answered") {
        return SituationCaseMapper.knowledgeFromStatus(answer?.answerStatus);
      }
      return answer.value === true ? "known" : "notApplicable";
    };
    const list = (id: string): string[] => {
      const answer = read(id);
      if (!answer || answer.answerStatus !== "answered" || !Array.isArray(answer.value)) return [];
      return answer.value.filter((v): v is string => typeof v === "string");
    };

    const dateAnswer = read("zeit-ort.datum");
    const timeText = text("zeit-ort.uhrzeit");

    return {
      ...situationCase,
      title: text("kurzbeschreibung.titel") || situationCase.title,
      category: text("kurzbeschreibung.kategorie"),
      rawDescription: text("kurzbeschreibung.text") || situationCase.rawDescription,
      incident: {
        occurredAt: dateAnswer?.answerStatus === "answered" && typeof dateAnswer.value === "string" ? dateAnswer.value : null,
        dateKnown: SituationCaseMapper.knowledgeFromStatus(read("zeit-ort.datum")?.answerStatus ?? read("zeit-ort.datumBekannt")?.answerStatus),
        timeKnown: timeText ? "known" : SituationCaseMapper.knowledgeFromStatus(read("zeit-ort.uhrzeit")?.answerStatus),
        location: text("zeit-ort.ort"),
        locationType: text("zeit-ort.ortstyp") || "unknown",
        isOngoing: bool("fortdauer.andauernd"),
        wasRepeated: bool("fortdauer.wiederholt"),
        description: text("kurzbeschreibung.text"),
      },
      dangerInformation: {
        acuteDangerReported: flag("gefahren.gemeldet"),
        dangerType: text("gefahren.art"),
        affectedPersons: situationCase.participants.filter((p) => p.isAffected).map((p) => p.id),
        ongoing: bool("gefahren.andauernd"),
        emergencyServicesInvolved: bool("gefahren.rettungsdienste"),
        details: text("gefahren.art"),
      },
      documentationStatus: {
        notesAvailable: bool("dokumentation.notizen"),
        incidentReportAvailable: bool("dokumentation.vorfallsbericht"),
        conversationRecordAvailable: bool("dokumentation.gespraechsnotiz"),
        parentContactDocumented: bool("dokumentation.elternkontakt"),
        schoolLeadershipInformed: list("informierte.stellen").includes("schoolLeadership")
          ? "known"
          : SituationCaseMapper.knowledgeFromStatus(read("informierte.stellen")?.answerStatus),
        otherDocumentation: text("dokumentation.sonstiges"),
      },
      responsiblePersonsInformed: list("informierte.stellen"),
    };
  }

  static serialize(situationCase: SituationCase): string {
    return JSON.stringify(situationCase);
  }

  static deserialize(raw: string): SituationCase {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SituationDataError("invalid_json", "Die gespeicherten Angaben konnten nicht gelesen werden.");
    }
    return SituationCaseMapper.fromUnknown(parsed);
  }

  /** Prüft eine unbekannte Struktur kontrolliert – wirft statt still zu löschen. */
  static fromUnknown(input: unknown): SituationCase {
    if (typeof input !== "object" || input === null) {
      throw new SituationDataError("invalid_shape", "Die gespeicherten Angaben haben ein unerwartetes Format.");
    }
    const candidate = input as Partial<SituationCase>;
    if (typeof candidate.schemaVersion !== "number") {
      throw new SituationDataError("invalid_shape", "Den gespeicherten Angaben fehlt die Schema-Version.");
    }
    if (candidate.schemaVersion !== SITUATION_SCHEMA_VERSION) {
      throw new SituationDataError(
        "incompatible_version",
        `Die gespeicherten Angaben stammen aus Version ${candidate.schemaVersion} und sind mit der aktuellen Version ${SITUATION_SCHEMA_VERSION} nicht kompatibel.`,
      );
    }
    const requiredArrays: Array<keyof SituationCase> = [
      "participants",
      "witnesses",
      "evidence",
      "measuresTaken",
      "responsiblePersonsInformed",
      "uncertainties",
    ];
    for (const key of requiredArrays) {
      if (!Array.isArray(candidate[key])) {
        throw new SituationDataError("invalid_shape", `Das Feld „${String(key)}“ fehlt oder ist beschädigt.`);
      }
    }
    if (typeof candidate.answers !== "object" || candidate.answers === null || Array.isArray(candidate.answers)) {
      throw new SituationDataError("invalid_shape", "Die gespeicherten Antworten sind beschädigt.");
    }
    if (typeof candidate.caseId !== "string" || typeof candidate.navigatorId !== "string") {
      throw new SituationDataError("invalid_shape", "Die Kennungen der gespeicherten Situation fehlen.");
    }
    return candidate as SituationCase;
  }
}
