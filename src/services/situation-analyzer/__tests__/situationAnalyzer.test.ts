/**
 * Sprint 4.6B – Tests des Situation Analyzers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DecisionNavigatorEngine,
  InMemoryNavigatorSessionStore,
} from "../../decision-navigator/index";
import {
  SITUATION_CONTEXT_KEY,
  SITUATION_SCHEMA_VERSION,
  SituationAnalyzerService,
  SituationCaseMapper,
  SituationDataError,
  buildStandardSituationSchema,
  type SituationEvent,
} from "../index";

function makeService() {
  return new SituationAnalyzerService({ navigatorId: "nav-1", workflowId: "wf-1" });
}

/** Beantwortet alle sichtbaren Pflichtfragen minimal, damit die Situation abschließbar ist. */
function answerAllRequired(service: SituationAnalyzerService) {
  service.answerQuestion("kurzbeschreibung.titel", "Vorgang A");
  service.answerQuestion("kurzbeschreibung.text", "Es gab eine Auseinandersetzung im Unterricht.");
  service.answerQuestion("zeit-ort.datumBekannt", true);
  service.answerQuestion("zeit-ort.datum", "2026-05-04");
  service.answerQuestion("zeit-ort.ortstyp", "classroom");
  service.addParticipant({ displayName: "Schüler A", role: "student" });
  service.answerQuestion("beteiligte.liste", "erfasst");
  service.answerQuestion("betroffene.vorhanden", false);
  service.answerQuestion("zeugen.vorhanden", false);
  service.answerQuestion("fortdauer.andauernd", false);
  service.answerQuestion("fortdauer.wiederholt", false);
  service.answerQuestion("gefahren.gemeldet", false);
  service.answerQuestion("nachweise.vorhanden", false);
  service.answerQuestion("massnahmen.durchgefuehrt", false);
  service.answerQuestion("informierte.stellen", ["schoolLeadership"]);
  service.answerQuestion("dokumentation.notizen", true);
  service.answerQuestion("dokumentation.vorfallsbericht", false);
}

test("1 – leeres SituationCase wird erzeugt", () => {
  const service = makeService();
  const c = service.createCase();
  assert.equal(c.schemaVersion, SITUATION_SCHEMA_VERSION);
  assert.equal(c.status, "notStarted");
  assert.deepEqual(c.participants, []);
  assert.equal(c.navigatorId, "nav-1");
  assert.ok(c.caseId.startsWith("sit_"));
});

test("2 – Serialisierung und Deserialisierung erhalten die Angaben", () => {
  const service = makeService();
  service.createCase();
  service.answerQuestion("kurzbeschreibung.titel", "Vorgang B");
  const raw = service.serialize();
  const restored = makeService();
  const c = restored.deserialize(raw);
  assert.equal(c.answers["kurzbeschreibung.titel"].value, "Vorgang B");
  assert.equal(c.title, "Vorgang B");
});

test("3 – Kurzbeschreibung wird gespeichert", () => {
  const service = makeService();
  service.createCase();
  const c = service.updateRawDescription("Freitextbeschreibung");
  assert.equal(c.rawDescription, "Freitextbeschreibung");
  assert.equal(c.status, "inProgress");
});

test("4 – Pflichtfragen werden bemängelt", () => {
  const service = makeService();
  service.createCase();
  const result = service.validate();
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.questionId === "kurzbeschreibung.titel"));
});

test("5 – unbekannte Angabe wird ausdrücklich markiert", () => {
  const service = makeService();
  service.createCase();
  const c = service.markUnknown("zeit-ort.uhrzeit");
  assert.equal(c.answers["zeit-ort.uhrzeit"].answerStatus, "unknown");
  assert.ok(c.completeness.unknownQuestions >= 1);
});

test("6 – „nicht zutreffend“ wird markiert", () => {
  const service = makeService();
  service.createCase();
  const c = service.markNotApplicable("zeit-ort.uhrzeit");
  assert.equal(c.answers["zeit-ort.uhrzeit"].answerStatus, "notApplicable");
  assert.equal(c.completeness.notApplicableQuestions, 1);
});

test("7 – bedingte Frage wird eingeblendet", () => {
  const service = makeService();
  service.createCase();
  const resolver = service.getResolver();
  assert.equal(
    resolver.visibleQuestions(service.getCase().answers).some((q) => q.id === "zeugen.liste"),
    false,
  );
  service.answerQuestion("zeugen.vorhanden", true);
  assert.equal(
    resolver.visibleQuestions(service.getCase().answers).some((q) => q.id === "zeugen.liste"),
    true,
  );
});

test("8 – bedingte Pflichtfrage wird geprüft", () => {
  const service = makeService();
  service.createCase();
  service.answerQuestion("nachweise.vorhanden", true);
  const result = service.validate();
  assert.ok(
    result.issues.some(
      (i) => i.questionId === "nachweise.liste" && i.code === "conditional_required_missing",
    ),
  );
});

test("9-11 – Beteiligte hinzufügen, aktualisieren, entfernen", () => {
  const service = makeService();
  service.createCase();
  const added = service.addParticipant({ displayName: "Schüler A", role: "student" });
  const id = added.participants[0].id;
  const updated = service.updateParticipant(id, { isAffected: true });
  assert.equal(updated.participants[0].isAffected, true);
  const removed = service.removeParticipant(id);
  assert.equal(removed.participants.length, 0);
});

test("12 – Zeuge kann mit Beteiligtem verknüpft werden", () => {
  const service = makeService();
  service.createCase();
  const withParticipant = service.addParticipant({ displayName: "Schülerin B", role: "student" });
  const pid = withParticipant.participants[0].id;
  const c = service.addWitness({ displayName: "Schülerin B", participantId: pid });
  assert.equal(c.witnesses[0].participantId, pid);
  assert.throws(() => service.addWitness({ displayName: "X", participantId: "unbekannt" }));
});

test("13/14 – Nachweis und Maßnahme hinzufügen", () => {
  const service = makeService();
  service.createCase();
  const withEvidence = service.addEvidence({ type: "photo", description: "Screenshot" });
  assert.equal(withEvidence.evidence[0].type, "photo");
  const withMeasure = service.addMeasure({ type: "conversation", description: "Gespräch" });
  assert.equal(withMeasure.measuresTaken[0].description, "Gespräch");
});

test("15 – IDs sind eindeutig", () => {
  const service = makeService();
  service.createCase();
  service.addParticipant({ displayName: "A" });
  service.addParticipant({ displayName: "B" });
  const ids = service.getCase().participants.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(service.validate().issues.some((i) => i.code === "duplicate_participant_id"), false);
});

test("16/17 – Vollständigkeit berücksichtigt nur sichtbare Fragen", () => {
  const service = makeService();
  service.createCase();
  const before = service.calculateCompleteness().totalRelevantQuestions;
  service.answerQuestion("zeugen.vorhanden", true);
  const after = service.calculateCompleteness().totalRelevantQuestions;
  assert.equal(after, before + 1);
  const schemaQuestions = buildStandardSituationSchema().questions.filter(
    (q) => q.type !== "information",
  ).length;
  assert.ok(after < schemaQuestions);
});

test("18/19 – Abschluss nur bei vollständiger Erfassung", () => {
  const service = makeService();
  service.createCase();
  const failed = service.completeSituation();
  assert.equal(failed.valid, false);
  assert.notEqual(service.getCase().status, "complete");

  answerAllRequired(service);
  const ok = service.completeSituation();
  assert.deepEqual(ok.issues, []);
  assert.equal(service.getCase().status, "complete");
  assert.equal(service.getCase().completeness.isComplete, true);
});

test("20 – Situation zurücksetzen", () => {
  const service = makeService();
  service.createCase();
  answerAllRequired(service);
  const reset = service.resetSituation();
  assert.deepEqual(reset.participants, []);
  assert.deepEqual(reset.answers, {});
  assert.equal(reset.status, "notStarted");
});

test("21/22 – Speicherung im Navigator-Kontext und Wiederherstellung", () => {
  const store = new InMemoryNavigatorSessionStore();
  const engine = new DecisionNavigatorEngine({ navigatorId: "nav-sit", store });
  engine.start();
  engine.next(); // Schritt „Situation“

  const service = makeService();
  service.createCase();
  answerAllRequired(service);
  service.completeSituation();
  engine.patchContext({ [SITUATION_CONTEXT_KEY]: service.getCase() });

  const resumed = DecisionNavigatorEngine.resumeFromStore("nav-sit", store);
  assert.ok(resumed);
  const stored = resumed!.getState().context[SITUATION_CONTEXT_KEY];
  const restoredService = makeService();
  const restoredCase = restoredService.loadCase(stored);
  assert.equal(restoredCase.status, "complete");
  assert.equal(restoredCase.answers["kurzbeschreibung.titel"].value, "Vorgang A");
});

test("23 – Events werden ausgelöst", () => {
  const service = makeService();
  const seen: SituationEvent[] = [];
  service.on((e) => seen.push(e));
  service.createCase();
  service.updateRawDescription("Text");
  service.answerQuestion("kurzbeschreibung.titel", "T");
  service.addParticipant({ displayName: "A" });
  service.completeSituation();
  const names = seen.map((e) => e.name);
  assert.ok(names.includes("SituationAnalysisStarted"));
  assert.ok(names.includes("SituationDescriptionUpdated"));
  assert.ok(names.includes("SituationAnswerChanged"));
  assert.ok(names.includes("SituationParticipantAdded"));
  assert.ok(names.includes("SituationValidationFailed"));
});

test("24 – ungültige gespeicherte Daten werden kontrolliert behandelt", () => {
  const service = makeService();
  assert.throws(() => service.deserialize("{kaputt"), SituationDataError);
  assert.throws(() => service.loadCase({ schemaVersion: 99 }), SituationDataError);
  assert.throws(() => service.loadCase(null), SituationDataError);
  try {
    SituationCaseMapper.fromUnknown({ schemaVersion: 99 });
    assert.fail("Erwarteter Fehler ausgeblieben");
  } catch (error) {
    assert.equal((error as SituationDataError).code, "incompatible_version");
  }
});

test("25 – Decision Navigator Engine bleibt unverändert nutzbar", () => {
  const engine = new DecisionNavigatorEngine({ navigatorId: "nav-reg" });
  engine.start();
  assert.equal(engine.getCurrentStep()?.id, "start");
  engine.next();
  assert.equal(engine.getCurrentStep()?.id, "situation");
  engine.back();
  assert.equal(engine.getCurrentStep()?.id, "start");
});
