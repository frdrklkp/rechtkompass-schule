/**
 * Sprint 4.6F – Integrationstests: Assistent → Matching → Navigator.
 *
 * Prüft den vollständigen fachlichen Pfad ohne Browser:
 * Strukturierung, Abgleich, Rückfragen, Veraltung, Sitzungswiederherstellung
 * und Übergabe an den Decision Navigator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AssistantError,
  AssistantOrchestrator,
  InMemoryAssistantSessionStore,
  isCompatibleAssistantSession,
  startNavigatorFromAssistant,
  ASSISTANT_HANDOFF_STEP_ID,
} from "@/services/assistant";
import {
  PracticeCaseMatchingEngine,
  type PracticeCaseSource,
} from "@/services/practice-case-matching";
import { InMemoryNavigatorSessionStore } from "@/services/decision-navigator";

/* ------------------------------ Fixtures --------------------------------- */

const BASE = {
  ampel: "gelb" as const,
  shortAnswer: null,
  recommendation: null,
  responsibilities: null,
  legalExplanation: null,
  checklist: [],
  documentation: [],
  curatedProfile: null,
};

const CASE_KONFLIKT: PracticeCaseSource = {
  ...BASE,
  id: "case-konflikt",
  title: "Wiederholte Beleidigung einer Mitschülerin im Unterricht",
  shortDescription:
    "Ein Schüler beleidigt eine Mitschülerin wiederholt im Unterricht und grenzt sie vor den anderen aus. Mehrere Mitschüler beobachten die Vorfälle.",
  category: "Konflikt",
  subcategory: "Beleidigung",
  keywords: ["Beleidigung", "Ausgrenzung", "Mitschüler"],
  legalSectionIds: ["ls-1"],
  templateIds: ["tpl-1"],
  hasDecisionTree: true,
  status: "published",
  updatedAt: "2026-07-15T10:00:00.000Z",
};

const CASE_SCHLAEGEREI: PracticeCaseSource = {
  ...BASE,
  id: "case-schlaegerei",
  title: "Körperliche Auseinandersetzung zwischen Schülern in der Pause",
  shortDescription:
    "Zwei Schüler geraten auf dem Schulhof in der Pause in eine körperliche Auseinandersetzung. Aufsichtspersonen schreiten ein.",
  category: "Konflikt",
  subcategory: "Körperliche Auseinandersetzung",
  keywords: ["Schlägerei", "Schulhof", "Pause"],
  legalSectionIds: ["ls-2"],
  templateIds: [],
  hasDecisionTree: false,
  status: "published",
  updatedAt: "2026-07-14T09:00:00.000Z",
};

const CASE_ZEUGNIS: PracticeCaseSource = {
  ...BASE,
  id: "case-zeugnis",
  title: "Zeugnisverzögerung im Sekretariat",
  shortDescription:
    "Ein Zeugnis wird im Sekretariat verspätet ausgestellt; die Verwaltung informiert die Eltern.",
  category: "Organisation",
  subcategory: "Verwaltung",
  keywords: ["Zeugnis", "Versetzung", "Sekretariat"],
  legalSectionIds: [],
  templateIds: ["tpl-9"],
  hasDecisionTree: false,
  status: "published",
  updatedAt: "2026-07-13T08:00:00.000Z",
};

const ALL_SOURCES = [CASE_KONFLIKT, CASE_SCHLAEGEREI, CASE_ZEUGNIS];

const DESC_KONFLIKT =
  "Ein Schüler hat im Unterricht wiederholt eine Mitschülerin beleidigt. " +
  "Die Beleidigung und Ausgrenzung wurde von mehreren Mitschülern beobachtet. " +
  "Die Schulleitung ist noch nicht informiert.";

const DESC_IRRELEVANT =
  "Die Heizung im Musikraum ist seit einer Woche defekt. Der Raum kann derzeit nicht genutzt werden.";

function createOrchestrator(sources: PracticeCaseSource[] = ALL_SOURCES) {
  const matching = new PracticeCaseMatchingEngine();
  matching.rebuildIndex(sources);
  const store = new InMemoryAssistantSessionStore();
  const orchestrator = new AssistantOrchestrator({ matching, store });
  return { matching, store, orchestrator };
}

/** Liest den Wert einer gekapselten Situationsantwort. */
function answerValue(situation: { answers: Record<string, unknown> }, questionId: string): unknown {
  const entry = situation.answers[questionId] as { value?: unknown } | undefined;
  return entry?.value;
}

/* --------------------------- Strukturierung ------------------------------ */

test("Strukturierung: freie Schilderung wird deterministisch in einen SituationCase überführt", () => {
  const { orchestrator } = createOrchestrator();
  const session = orchestrator.structure(DESC_KONFLIKT);

  assert.equal(session.status, "running");
  assert.equal(session.phase, "struktur");
  assert.ok(session.sessionId.length > 0);

  const analysis = session.analysis!;
  assert.equal(analysis.category, "konflikt");
  assert.equal(analysis.locationType, "classroom");
  assert.ok(analysis.roles.includes("student"));
  assert.equal(analysis.repeated, true);
  assert.equal(analysis.witnessesPresent, true);
  assert.equal(analysis.leadershipInformed, null);
  assert.ok(analysis.openAspects.includes("Schulleitung informiert"));
  assert.ok(analysis.findings.length > 0);
  /* Jede Angabe trägt eine wörtliche Belegstelle. */
  for (const f of analysis.findings) assert.ok(f.evidence.length > 0);

  const situation = session.situation!;
  assert.equal(answerValue(situation, "kurzbeschreibung.kategorie"), "konflikt");
  assert.equal(answerValue(situation, "zeit-ort.ortstyp"), "classroom");
  assert.equal(answerValue(situation, "fortdauer.wiederholt"), true);
  assert.equal(answerValue(situation, "zeugen.vorhanden"), true);
  assert.ok(situation.participants.length >= 1);
  /* Nichts ergänzt: offene Aspekte bleiben unbeantwortet. */
  assert.equal(answerValue(situation, "gefahren.gemeldet"), undefined);
});

test("Validierung: zu kurze Schilderung wird mit verständlichem Fehler abgelehnt", () => {
  const { orchestrator } = createOrchestrator();
  assert.throws(() => orchestrator.structure("zu kurz"), (e: unknown) => {
    assert.ok(e instanceof AssistantError);
    assert.match((e as Error).message, /mindestens/);
    return true;
  });
  assert.equal(orchestrator.getSession(), null);
});

/* ------------------------------ Abgleich --------------------------------- */

test("Abgleich: kuratierter Pilotfall ist bester Treffer, Alternativen sind absteigend sortiert", () => {
  const { orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_KONFLIKT);
  const session = orchestrator.runMatching();

  assert.equal(session.phase, "treffer");
  const result = session.matchResult!;
  assert.equal(result.stats.evaluated, 3);
  assert.ok(result.matches.length >= 1);

  const best = result.matches[0]!;
  assert.equal(best.caseId, "case-konflikt");
  assert.equal(best.level, "strong");
  assert.equal(best.excluded, false);

  /* Absteigende Sortierung und Schwellenlogik. */
  for (let i = 1; i < result.matches.length; i += 1) {
    assert.ok(result.matches[i]!.score <= result.matches[i - 1]!.score);
  }
  assert.ok(!result.matches.some((m) => m.caseId === "case-zeugnis"));

  assert.notEqual(session.coverage!.level, "none");
  assert.ok(result.features.tokens.length > 0);
  assert.ok(result.limitations.length > 0);
});

test("Abgleich: nicht passende Schilderung liefert keine Treffer und klare Rückfragen", () => {
  const { orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_IRRELEVANT);
  const session = orchestrator.runMatching();

  assert.equal(session.matchResult!.matches.length, 0);
  assert.equal(session.coverage!.level, "none");
  assert.equal(session.phase, "rueckfragen");
  assert.ok(orchestrator.questions().length > 0);
  assert.ok(session.matchResult!.limitations.length > 0);
});

test("Abgleich: ohne Sitzung oder Sachverhalt wird ein verständlicher Fehler geworfen", () => {
  const { orchestrator } = createOrchestrator();
  assert.throws(() => orchestrator.runMatching(), /keine Assistenten-Sitzung/);
});

/* ----------------------------- Rückfragen -------------------------------- */

test("Rückfragen: Antwort verändert den Sachverhalt und macht das Ergebnis veraltet", () => {
  const { orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_KONFLIKT);
  const first = orchestrator.runMatching();
  const hashBefore = first.matchResult!.inputHash;

  const questionIds = orchestrator.questions().map((q) => q.questionId);
  assert.ok(questionIds.includes("gefahren.gemeldet"));

  const answered = orchestrator.answerQuestion("gefahren.gemeldet", false);
  assert.equal(answerValue(answered.situation!, "gefahren.gemeldet"), false);
  assert.ok(answered.answeredQuestionIds.includes("gefahren.gemeldet"));
  assert.equal(answered.phase, "rueckfragen");

  /* Beantwortete Frage wird nicht erneut gestellt. */
  assert.ok(!orchestrator.questions().some((q) => q.questionId === "gefahren.gemeldet"));

  /* Veraltung durch geänderte Angaben. */
  assert.equal(orchestrator.staleReason(), "situation_changed");
  const second = orchestrator.runMatching();
  assert.notEqual(second.matchResult!.inputHash, hashBefore);
  assert.equal(orchestrator.staleReason(), "none");
});

test("Rückfragen: 'Weiß ich nicht' wird als unbekannt übernommen und nicht erneut gefragt", () => {
  const { orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_KONFLIKT);
  orchestrator.runMatching();

  const session = orchestrator.markQuestionUnknown("nachweise.vorhanden");
  assert.ok(session.answeredQuestionIds.includes("nachweise.vorhanden"));
  assert.ok(!orchestrator.questions().some((q) => q.questionId === "nachweise.vorhanden"));
});

test("Veraltung: Indexänderung wird erkannt", () => {
  const { matching, orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_KONFLIKT);
  orchestrator.runMatching();
  assert.equal(orchestrator.staleReason(), "none");

  matching.rebuildIndex([
    ...ALL_SOURCES,
    { ...CASE_ZEUGNIS, id: "case-neu", title: "Neuer Fall", updatedAt: "2026-07-16T00:00:00.000Z" },
  ]);
  assert.equal(orchestrator.staleReason(), "index_changed");
});

/* ------------------------------ Sitzung ---------------------------------- */

test("Sitzung: JSON-Roundtrip bleibt kompatibel und ist nach Neuladen fortsetzbar", () => {
  const { matching, store, orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_KONFLIKT);
  orchestrator.runMatching();
  const original = orchestrator.getSession()!;

  /* Simuliert den localStorage-Roundtrip. */
  const raw = JSON.parse(JSON.stringify(original));
  assert.ok(isCompatibleAssistantSession(raw));

  const restored = new AssistantOrchestrator({ matching, store });
  const session = restored.getSession()!;
  assert.equal(session.sessionId, original.sessionId);
  assert.equal(session.situation!.caseId, original.situation!.caseId);

  /* Rückfragen funktionieren auch nach der Wiederherstellung. */
  const answered = restored.answerQuestion("gefahren.gemeldet", true);
  assert.equal(answerValue(answered.situation!, "gefahren.gemeldet"), true);
});

test("Sitzung: Pausieren, Fortsetzen, Abbrechen und Zurücksetzen", () => {
  const { orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_KONFLIKT);

  assert.equal(orchestrator.pause().status, "paused");
  assert.throws(() => orchestrator.pause(), /pausiert/);
  assert.equal(orchestrator.resume().status, "running");
  assert.equal(orchestrator.cancel().status, "cancelled");

  orchestrator.reset();
  assert.equal(orchestrator.getSession(), null);
});

/* ------------------------------ Übergabe --------------------------------- */

test("Übergabe: Handoff-Kontext enthält Sachverhalt, Fallbezug und Sitzungsreferenz", () => {
  const { orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_KONFLIKT);
  orchestrator.runMatching();
  orchestrator.selectCase("case-konflikt");

  const ctx = orchestrator.buildHandoffContext(CASE_KONFLIKT);
  const session = orchestrator.getSession()!;

  const situation = ctx["situation"] as { caseId: string };
  assert.equal(situation.caseId, session.situation!.caseId);
  assert.equal(ctx["navigatorTitle"], session.situation!.title);
  assert.ok(ctx["practiceCaseMatch"]);

  const selected = ctx["selectedPracticeCase"] as Record<string, unknown>;
  assert.equal(selected["caseId"], "case-konflikt");
  assert.equal(selected["version"], "2026-07-15T10:00:00.000Z");
  assert.equal(selected["curated"], true);
  assert.deepEqual(selected["legalSectionIds"], ["ls-1"]);
  assert.deepEqual(selected["templateIds"], ["tpl-1"]);
  assert.equal(selected["matchLevel"], "strong");
  assert.equal(selected["matchScore"], 100);

  const reference = ctx["assistantSessionReference"] as Record<string, unknown>;
  assert.equal(reference["sessionId"], session.sessionId);
  assert.ok(Array.isArray(reference["answeredQuestionIds"]));
  assert.notEqual(reference["coverageLevel"], null);

  const done = orchestrator.completeHandoff();
  assert.equal(done.status, "handedOff");
  assert.equal(done.phase, "uebergabe");
  assert.ok(done.handoffAt);
});

test("Übergabe: allgemeiner Ablauf ohne Praxisfall bleibt vollständig möglich", () => {
  const { orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_IRRELEVANT);
  orchestrator.runMatching();
  orchestrator.selectCase(null);

  const ctx = orchestrator.buildHandoffContext(null);
  assert.equal(ctx["selectedPracticeCase"], null);
  assert.ok(ctx["situation"]);
  assert.ok(ctx["practiceCaseMatch"]);
});

test("Übergabe: Navigator startet am Analyseschritt – keine Doppeleingabe", () => {
  const { orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_KONFLIKT);
  orchestrator.runMatching();
  orchestrator.selectCase("case-konflikt");
  const ctx = orchestrator.buildHandoffContext(CASE_KONFLIKT);

  const { state } = startNavigatorFromAssistant(ctx, {
    store: new InMemoryNavigatorSessionStore(),
    navigatorId: "test-handoff",
  });

  assert.equal(ASSISTANT_HANDOFF_STEP_ID, "analyse");
  assert.equal(state.currentStep, "analyse");
  assert.equal(state.status, "running");

  /* Der Sachverhalt liegt unverändert im Navigator-Kontext. */
  const situation = state.context["situation"] as { caseId: string };
  assert.equal(situation.caseId, (ctx["situation"] as { caseId: string }).caseId);
  const selected = state.context["selectedPracticeCase"] as { caseId: string };
  assert.equal(selected.caseId, "case-konflikt");
});

/* ------------------------------ Ereignisse ------------------------------- */

test("Ereignisse: der Ablauf ist über den EventBus nachvollziehbar", () => {
  const { orchestrator } = createOrchestrator();
  orchestrator.structure(DESC_KONFLIKT);
  orchestrator.runMatching();
  orchestrator.answerQuestion("gefahren.gemeldet", false);
  orchestrator.selectCase("case-konflikt");
  orchestrator.completeHandoff();

  const names = orchestrator.events.getEvents().map((e) => e.name);
  assert.ok(names.includes("DescriptionStructured"));
  assert.ok(names.includes("MatchingRequested"));
  assert.ok(names.includes("FollowUpAnswered"));
  assert.ok(names.includes("HandoffPrepared"));
});
