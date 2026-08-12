/**
 * Sprint 4.6F – Aufbau des strukturierten Sachverhalts aus einer Schilderung.
 *
 * Verwendet ausschließlich den bestehenden SituationAnalyzerService. Angaben,
 * die die Schilderung nicht hergibt, bleiben offen oder werden ausdrücklich als
 * unbekannt gekennzeichnet – sie werden niemals ergänzt.
 */
import {
  SituationAnalyzerService,
  type SituationCase,
} from "@/services/situation-analyzer";
import { roleLabel } from "./descriptionAnalysis";
import type { AssistantDescriptionAnalysis } from "./types";

/** Kennzeichnung für Listenfragen, wie im Situation Analyzer vorgesehen. */
const LIST_ANSWER = "erfasst";

/** Titel aus dem ersten Satz der Schilderung – ohne Umformulierung. */
export function titleFromDescription(description: string): string {
  const firstSentence = description.trim().split(/(?<=[.!?])\s+/)[0] ?? description.trim();
  const compact = firstSentence.replace(/\s+/g, " ").trim();
  if (compact.length === 0) return "Fallschilderung";
  return compact.length > 90 ? `${compact.slice(0, 87)}…` : compact;
}

export interface BuiltAssistantSituation {
  situation: SituationCase;
  service: SituationAnalyzerService;
}

export class AssistantSituationBuilder {
  build(
    description: string,
    analysis: AssistantDescriptionAnalysis,
    navigatorId: string,
    workflowId: string,
  ): BuiltAssistantSituation {
    const service = new SituationAnalyzerService({ navigatorId, workflowId });
    service.createCase();

    /* Kurzbeschreibung – wörtliche Übernahme der Schilderung */
    service.answerQuestion("kurzbeschreibung.titel", titleFromDescription(description));
    service.answerQuestion("kurzbeschreibung.text", description.trim());
    if (analysis.category) service.answerQuestion("kurzbeschreibung.kategorie", analysis.category);

    /* Zeitpunkt – aus freiem Text nicht ableitbar, daher ausdrücklich offen */
    service.answerQuestion("zeit-ort.datumBekannt", false);
    service.markUnknown("zeit-ort.datum");
    service.markUnknown("zeit-ort.uhrzeit");

    /* Ort */
    if (analysis.locationType) service.answerQuestion("zeit-ort.ortstyp", analysis.locationType);

    /* Beteiligte – nur erkannte Rollen, ohne Namen */
    for (const role of analysis.roles) {
      service.addParticipant({
        displayName: `${roleLabel(role)} (aus Schilderung)`,
        role,
        ageGroup: role === "student" ? "adolescent" : role === "teacher" || role === "schoolLeadership" ? "adult" : "unknown",
      });
    }
    if (analysis.roles.length > 0) service.answerQuestion("beteiligte.liste", LIST_ANSWER);

    /* Fortdauer und Wiederholung */
    if (analysis.ongoing !== null) service.answerQuestion("fortdauer.andauernd", analysis.ongoing);
    if (analysis.repeated !== null) service.answerQuestion("fortdauer.wiederholt", analysis.repeated);

    /* Gefahrenangaben – reine Tatsachenangabe */
    if (analysis.dangerReported !== null) {
      service.answerQuestion("gefahren.gemeldet", analysis.dangerReported);
    }

    /* Zeugen */
    if (analysis.witnessesPresent === true) {
      service.answerQuestion("zeugen.vorhanden", true);
      service.markUnknown("zeugen.liste");
    } else if (analysis.witnessesPresent === false) {
      service.answerQuestion("zeugen.vorhanden", false);
    }

    /* Nachweise */
    if (analysis.evidencePresent === true) {
      service.answerQuestion("nachweise.vorhanden", true);
      service.markUnknown("nachweise.liste");
    } else if (analysis.evidencePresent === false) {
      service.answerQuestion("nachweise.vorhanden", false);
    }

    /* Bereits durchgeführte Maßnahmen */
    if (analysis.measuresTaken === true) {
      service.answerQuestion("massnahmen.durchgefuehrt", true);
      service.markUnknown("massnahmen.liste");
    } else if (analysis.measuresTaken === false) {
      service.answerQuestion("massnahmen.durchgefuehrt", false);
    }

    /* Informierte Stellen – nur ausdrücklich genannte */
    const informed: string[] = [];
    if (analysis.leadershipInformed === true) informed.push("schoolLeadership");
    if (analysis.parentContact === true) informed.push("parents");
    if (analysis.leadershipInformed === false && analysis.parentContact === false) {
      informed.push("none");
    }
    if (informed.length > 0) service.answerQuestion("informierte.stellen", informed);

    /* Dokumentation */
    if (analysis.parentContact !== null) {
      service.answerQuestion("dokumentation.elternkontakt", analysis.parentContact);
    }

    return { situation: service.getCase(), service };
  }
}

export const defaultSituationBuilder = new AssistantSituationBuilder();
