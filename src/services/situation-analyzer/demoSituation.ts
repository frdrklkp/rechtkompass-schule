/**
 * Sprint 4.6B.1 / 4.6D – Neutrale Demo-Angaben für die Phase „Situation“.
 * Nutzt ausschließlich den bestehenden SituationAnalyzerService und das Standardschema.
 * Keine realen Namen, keine Bewertung, keine Rechtsgrundlagen.
 * Alle Angaben bleiben vollständig editierbar.
 */
import { SituationAnalyzerService } from "./SituationAnalyzerService";
import type { SituationCase } from "./types";

export const DEMO_SITUATION_TITLE = "Allgemeine schulische Situation – Demo";

export const DEMO_SITUATION_DESCRIPTION =
  "Während einer Unterrichtsstunde kam es zu einer unklaren Situation zwischen einer Lehrkraft und einem Schüler. Der genaue Ablauf soll strukturiert erfasst und bewertet werden. Alle Angaben sind Beispieldaten und können vollständig überschrieben werden.";

/** Kennzeichnung für Listenfragen (Beteiligte, Zeugen, Nachweise, Maßnahmen). */
const LIST_ANSWER = "erfasst";

export class DemoSituationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoSituationError";
  }
}

/**
 * Erzeugt einen vollständig bearbeiteten, jederzeit editierbaren Beispiel-Fall.
 * Alle sichtbaren Pflichtfragen sind beantwortet oder ausdrücklich als
 * unbekannt beziehungsweise nicht zutreffend markiert.
 */
export function buildDemoSituationCase(navigatorId: string, workflowId: string): SituationCase {
  const service = new SituationAnalyzerService({ navigatorId, workflowId });
  service.createCase();

  /* Kurzbeschreibung */
  service.answerQuestion("kurzbeschreibung.titel", DEMO_SITUATION_TITLE);
  service.answerQuestion("kurzbeschreibung.text", DEMO_SITUATION_DESCRIPTION);
  service.answerQuestion("kurzbeschreibung.kategorie", "konflikt");

  /* Zeitpunkt und Ort – Datum ausdrücklich unbekannt */
  service.answerQuestion("zeit-ort.datumBekannt", false);
  service.markUnknown("zeit-ort.datum");
  service.answerQuestion("zeit-ort.zeitraum", "Vergangene Unterrichtswoche (Demoangabe)");
  service.markUnknown("zeit-ort.uhrzeit");
  service.answerQuestion("zeit-ort.ortstyp", "classroom");
  service.answerQuestion("zeit-ort.ort", "Klassenraum (Demoangabe)");

  /* Beteiligte Personen – mindestens zwei Rollen */
  service.addParticipant({
    displayName: "Lehrkraft (Demo)",
    role: "teacher",
    ageGroup: "adult",
    schoolRelation: "Unterrichtende Lehrkraft",
    isResponsiblePerson: true,
  });
  service.addParticipant({
    displayName: "Schüler (Demo)",
    role: "student",
    ageGroup: "adolescent",
    schoolRelation: "Lerngruppe der Stunde",
    isAffected: true,
  });
  service.answerQuestion("beteiligte.liste", LIST_ANSWER);

  /* Betroffene Personen */
  service.answerQuestion("betroffene.vorhanden", true);
  service.answerQuestion(
    "betroffene.beschreibung",
    "Unmittelbar betroffen ist der beteiligte Schüler (Demoangabe).",
  );

  /* Zeugen */
  service.answerQuestion("zeugen.vorhanden", true);
  service.addWitness({
    displayName: "Weitere Lehrkraft (Demo)",
    role: "teacher",
    statementAvailable: false,
    statementDocumented: false,
    notes: "Beobachtung bisher nicht schriftlich festgehalten (Demoangabe).",
  });
  service.answerQuestion("zeugen.liste", LIST_ANSWER);

  /* Fortdauer */
  service.answerQuestion("fortdauer.andauernd", false);
  service.answerQuestion("fortdauer.wiederholt", true);
  service.answerQuestion(
    "fortdauer.haeufigkeit",
    "Mehrfach innerhalb der vergangenen Wochen (Demoangabe)",
  );

  /* Gefahrenangaben – reine Tatsachenangabe */
  service.answerQuestion("gefahren.gemeldet", false);

  /* Nachweise – ausdrücklich nicht vorhanden */
  service.answerQuestion("nachweise.vorhanden", false);

  /* Bereits durchgeführte Maßnahmen */
  service.answerQuestion("massnahmen.durchgefuehrt", true);
  service.addMeasure({
    type: "conversation",
    description: "Kurzes klärendes Gespräch im Anschluss an die Unterrichtsstunde (Demoangabe).",
    performedBy: "Lehrkraft (Demo)",
    documented: false,
    result: "Ergebnis bislang nicht festgehalten.",
  });
  service.answerQuestion("massnahmen.liste", LIST_ANSWER);

  /* Informierte Stellen */
  service.answerQuestion("informierte.stellen", ["classTeacher"]);

  /* Dokumentation – noch unvollständig */
  service.answerQuestion("dokumentation.notizen", true);
  service.answerQuestion("dokumentation.vorfallsbericht", false);
  service.answerQuestion("dokumentation.gespraechsnotiz", false);
  service.markNotApplicable("dokumentation.elternkontakt");
  service.answerQuestion(
    "dokumentation.sonstiges",
    "Bisher nur eine handschriftliche Notiz der Lehrkraft (Demoangabe).",
  );

  /* Offene Fragen */
  service.answerQuestion(
    "offene-fragen.text",
    "Der genaue Ablauf und die Wahrnehmung der Beteiligten sind noch nicht abschließend geklärt (Demoangabe).",
  );

  /* Abschluss ausschließlich über den Service – ohne Umgehung der Validierung */
  const validation = service.completeSituation();
  const situationCase = service.getCase();

  if (!validation.valid || !situationCase.completeness.isComplete) {
    const details = validation.issues
      .map((issue) => `${issue.questionId ?? issue.section}: ${issue.message}`)
      .join(" | ");
    const missing = situationCase.completeness.missingRequiredQuestions.join(", ");
    const message = `Die Demo-Situation ist nicht valide. Offene Pflichtangaben: ${missing || "keine"}. Prüfmeldungen: ${details || "keine"}`;
    if (import.meta.env?.DEV) {
      // Im Entwicklungsmodus laut und sichtbar scheitern.
      throw new DemoSituationError(message);
    }
    console.error(`[Demo-Situation] ${message}`);
  }

  return situationCase;
}
