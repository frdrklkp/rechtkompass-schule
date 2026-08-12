/**
 * Sprint 4.6F – UI-Smoke-Tests der Assistenten-Oberfläche.
 *
 * Rendert die Komponenten serverseitig (renderToString) und prüft die
 * sichtbaren Kerninhalte jedes Zustands. Der TanStack-Router-Link wird
 * durch ein einfaches Anchor-Element ersetzt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";

/*
 * Die Tests laufen unter `bun test`; nur der Modul-Mock stammt aus bun:test.
 * Die Typdeklaration liegt in ./bun-test.d.ts, damit die globalen bun-types
 * (Konflikt mit DOM-fetch im übrigen Projekt) nicht geladen werden.
 */
const { mock } = await import("bun:test");

const actualRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) =>
    React.createElement("a", { href: typeof to === "string" ? to : "#" }, children),
}));

const { AssistantStatus } = await import("../AssistantStatus");
const { AssistantCoverageBadge } = await import("../AssistantCoverageBadge");
const { AssistantErrorState } = await import("../AssistantErrorState");
const { AssistantInput } = await import("../AssistantInput");
const { AssistantSituationSummary } = await import("../AssistantSituationSummary");
const { AssistantMatchSummary } = await import("../AssistantMatchSummary");
const { AssistantQuestionCard } = await import("../AssistantQuestionCard");
const { AssistantConfirmation } = await import("../AssistantConfirmation");
const { AssistantHandoff } = await import("../AssistantHandoff");
const { AssistantSessionControls } = await import("../AssistantSessionControls");
const { AssistantConversation } = await import("../AssistantConversation");
const { DecisionAssistant } = await import("../DecisionAssistant");

const { SituationAnalyzerService } = await import("@/services/situation-analyzer");

import type { DecisionAssistantController } from "@/hooks/assistant/useDecisionAssistant";
import type {
  AssistantCoverage,
  AssistantQuestion,
  AssistantSession,
} from "@/services/assistant";
import type {
  PracticeCaseMatch,
  PracticeCaseMatchResult,
  PracticeCaseSource,
} from "@/services/practice-case-matching";

/* ------------------------------ Fixtures --------------------------------- */

function render(element: React.ReactElement): string {
  /* SSR-Kommentarmarker (<!-- -->) zwischen Textknoten entfernen. */
  return renderToString(element).replace(/<!--.*?-->/g, "");
}

function makeSituation() {
  const service = new SituationAnalyzerService({ navigatorId: "t", workflowId: "t" });
  service.createCase();
  service.answerQuestion("kurzbeschreibung.titel", "Beleidigung im Unterricht");
  return service.getCase();
}

const SOURCE: PracticeCaseSource = {
  id: "case-konflikt",
  title: "Wiederholte Beleidigung einer Mitschülerin im Unterricht",
  status: "published",
  ampel: "gelb",
  category: "Konflikt",
  subcategory: "Beleidigung",
  shortDescription: "Ein Schüler beleidigt eine Mitschülerin wiederholt.",
  shortAnswer: null,
  recommendation: null,
  responsibilities: null,
  legalExplanation: null,
  checklist: [],
  documentation: [],
  keywords: ["Beleidigung", "Ausgrenzung", "Mitschüler"],
  legalSectionIds: ["ls-1"],
  templateIds: ["tpl-1"],
  hasDecisionTree: true,
  updatedAt: "2026-07-15T10:00:00.000Z",
  curatedProfile: null,
};

function makeMatch(over: Partial<PracticeCaseMatch>): PracticeCaseMatch {
  return {
    caseId: "case-konflikt",
    title: SOURCE.title,
    ampel: "gelb",
    score: 100,
    level: "strong",
    confidence: 60,
    dimensions: [],
    reasons: [
      { code: "category_match", label: "Kategorie", detail: "konflikt", positive: true },
    ],
    excluded: false,
    exclusionReasons: [],
    profileStatus: "derived",
    ...over,
  };
}

function makeResult(matches: PracticeCaseMatch[]): PracticeCaseMatchResult {
  return {
    situationId: "s1",
    matchedAt: "2026-08-08T07:00:00.000Z",
    inputHash: "h1",
    indexHash: "i1",
    indexVersion: 1,
    matches,
    excluded: [],
    limitations: ["Sachverhalt zu 40 % erfasst."],
    features: {
      situationId: "s1",
      categoryHints: ["konflikt"],
      tokens: ["unterricht"],
      roles: ["student"],
      locationTypes: ["classroom"],
      signals: [],
      unknownAspects: [],
      completionPercentage: 40,
    },
    stats: { evaluated: 3, excludedCount: 0, strong: 1, moderate: 1, weak: 0 },
  };
}

const COVERAGE: AssistantCoverage = {
  level: "medium",
  score: 68,
  reasons: ["1 Treffer mit hoher Übereinstimmung."],
  missing: ["gefahren.gemeldet"],
  strongMatches: 1,
  evaluated: 3,
};

function makeSession(over: Partial<AssistantSession>): AssistantSession {
  return {
    version: 1,
    sessionId: "assistent-test",
    navigatorId: "t",
    workflowId: "t",
    status: "running",
    phase: "treffer",
    description: "Ein Schüler hat im Unterricht wiederholt eine Mitschülerin beleidigt.",
    analysis: null,
    situation: makeSituation(),
    matchResult: null,
    coverage: null,
    answeredQuestionIds: [],
    selectedCaseId: null,
    startedAt: "2026-08-08T07:00:00.000Z",
    updatedAt: "2026-08-08T07:00:00.000Z",
    handoffAt: null,
    ...over,
  };
}

function makeController(over: Partial<DecisionAssistantController>): DecisionAssistantController {
  return {
    hydrated: true,
    session: null,
    error: null,
    sourcesError: null,
    sourcesLoading: false,
    caseCount: 3,
    questions: [],
    stale: "none",
    sources: [SOURCE],
    selectedSource: null,
    legalPreview: null,
    structureAndMatch: () => true,
    runMatching: () => {},
    selectCase: () => {},
    answer: () => {},
    markUnknown: () => {},
    handOffToNavigator: () => {},
    pause: () => {},
    resumeSession: () => {},
    cancel: () => {},
    reset: () => {},
    ...over,
  } as DecisionAssistantController;
}

/* --------------------------------- Tests --------------------------------- */

test("AssistantStatus zeigt Phase, Fortschritt und Fallbestand", () => {
  const html = render(
    <AssistantStatus phase="treffer" status="running" caseCount={3} />,
  );
  assert.ok(html.includes("Schritt 3 von 5"));
  assert.ok(html.includes("Passende Praxisfälle"));
  assert.ok(html.includes("in Bearbeitung"));
  assert.ok(html.includes("3 redaktionell erfassten Praxisfällen"));
});

test("AssistantCoverageBadge kennzeichnet die Abdeckung verständlich", () => {
  const html = render(<AssistantCoverageBadge coverage={COVERAGE} showScore />);
  assert.ok(html.includes("Mittlere Abdeckung"));
  assert.ok(html.includes("68/100"));
});

test("AssistantErrorState zeigt verständliche Meldung mit Handlungsoption", () => {
  const html = render(
    <AssistantErrorState message="Der Abgleich ist fehlgeschlagen." actionLabel="Erneut versuchen" onAction={() => {}} />,
  );
  assert.ok(html.includes("role=\"alert\""));
  assert.ok(html.includes("Das hat nicht funktioniert"));
  assert.ok(html.includes("Der Abgleich ist fehlgeschlagen."));
  assert.ok(html.includes("Erneut versuchen"));
});

test("AssistantInput fragt die Fallschilderung mit Mindestlänge ab", () => {
  const html = render(<AssistantInput onSubmit={() => {}} />);
  assert.ok(html.includes("Was ist vorgefallen?"));
  assert.ok(html.includes("mindestens"));
  assert.ok(html.includes("Angaben strukturieren"));
});

test("AssistantSituationSummary zeigt Findings mit Belegstelle und offene Aspekte", () => {
  const session = makeSession({});
  const analysis = {
    wordCount: 12,
    category: "konflikt",
    locationType: "classroom" as const,
    roles: ["student" as const],
    repeated: true,
    ongoing: null,
    dangerReported: null,
    witnessesPresent: true,
    evidencePresent: null,
    measuresTaken: null,
    leadershipInformed: null,
    parentContact: null,
    findings: [
      { field: "category", label: "Einordnung", display: "Konflikt", evidence: "beleidigt" },
    ],
    openAspects: ["Schulleitung informiert"],
  };
  const html = render(
    <AssistantSituationSummary
      description={session.description}
      analysis={analysis}
      situation={session.situation}
      onEditDescription={() => {}}
      onConfirm={() => {}}
    />,
  );
  assert.ok(html.includes("Erfasste Angaben"));
  assert.ok(html.includes("Belegstelle"));
  assert.ok(html.includes("beleidigt"));
  assert.ok(html.includes("Schulleitung informiert"));
  assert.ok(html.includes("Angaben bestätigen und abgleichen"));
});

test("AssistantMatchSummary zeigt besten Treffer, Alternativen und Kuratierungskennzeichnung", () => {
  const result = makeResult([
    makeMatch({}),
    makeMatch({ caseId: "case-alt", title: "Auseinandersetzung in der Pause", score: 49, level: "moderate", confidence: 25 }),
  ]);
  const html = render(
    <AssistantMatchSummary
      result={result}
      coverage={COVERAGE}
      sources={[SOURCE]}
      selectedCaseId={null}
      stale="none"
      onSelect={() => {}}
      onRematch={() => {}}
      onContinueWithout={() => {}}
    />,
  );
  assert.ok(html.includes("Passende Praxisfälle"));
  assert.ok(html.includes("2 Treffer aus 3 geprüften Praxisfällen"));
  assert.ok(html.includes("Bester Treffer"));
  assert.ok(html.includes("Hohe Übereinstimmung"));
  assert.ok(html.includes("Kuratierte Bearbeitung"));
  assert.ok(html.includes("1 alternative"));
  assert.ok(html.includes("Diesen Praxisfall verwenden"));
  assert.ok(html.includes("Praxisfall ansehen"));
});

test("AssistantMatchSummary bietet bei null Treffern den allgemeinen Ablauf an", () => {
  const html = render(
    <AssistantMatchSummary
      result={makeResult([])}
      coverage={{ ...COVERAGE, level: "none", score: 12 }}
      sources={[SOURCE]}
      selectedCaseId={null}
      stale="none"
      onSelect={() => {}}
      onRematch={() => {}}
      onContinueWithout={() => {}}
    />,
  );
  assert.ok(html.includes("Kein ausreichend passender Praxisfall"));
  assert.ok(html.includes("werden keine Inhalte"));
  assert.ok(html.includes("Ohne Praxisfall fortfahren"));
});

test("AssistantMatchSummary meldet ein veraltetes Ergebnis mit Erneuerungsoption", () => {
  const html = render(
    <AssistantMatchSummary
      result={makeResult([makeMatch({})])}
      coverage={COVERAGE}
      sources={[SOURCE]}
      selectedCaseId={null}
      stale="situation_changed"
      onSelect={() => {}}
      onRematch={() => {}}
      onContinueWithout={() => {}}
    />,
  );
  assert.ok(html.includes("Angaben zum Sachverhalt haben sich geändert"));
  assert.ok(html.includes("Abgleich erneuern"));
});

test("AssistantQuestionCard stellt Boolean-Rückfrage mit 'Weiß ich nicht'", () => {
  const question: AssistantQuestion = {
    questionId: "gefahren.gemeldet",
    title: "Wurde eine akute Gefährdung gemeldet?",
    help: "Gemeint ist eine konkrete Gefährdungsmeldung.",
    kind: "boolean",
    reason: "Die Schilderung enthält keine Gefahrenangabe.",
    priority: 1,
    required: true,
  };
  const html = render(
    <AssistantQuestionCard question={question} onAnswer={() => {}} onUnknown={() => {}} />,
  );
  assert.ok(html.includes("Wurde eine akute Gefährdung gemeldet?"));
  assert.ok(html.includes("Pflichtangabe"));
  assert.ok(html.includes("Grund der Rückfrage"));
  assert.ok(html.includes("Ja"));
  assert.ok(html.includes("Nein"));
  assert.ok(html.includes("Weiß ich nicht"));
});

test("AssistantConfirmation fasst die Übergabe nachvollziehbar zusammen", () => {
  const session = makeSession({ coverage: COVERAGE });
  const html = render(
    <AssistantConfirmation
      session={session}
      selectedSource={SOURCE}
      openQuestionCount={2}
      onHandoff={() => {}}
      onBackToQuestions={() => {}}
    />,
  );
  assert.ok(html.includes("Übergabe prüfen"));
  assert.ok(html.includes(SOURCE.title));
  assert.ok(html.includes("kuratierte"));
  assert.ok(html.includes("nichts erneut eingeben"));
  assert.ok(html.includes("In den Navigator übernehmen"));
  assert.ok(html.includes("2 offene Rückfrage(n) beantworten"));
});

test("AssistantConfirmation zeigt Anzahl und kompakte Rechtsgrundlagen-Vorschau", () => {
  const session = makeSession({ coverage: COVERAGE });
  const html = render(
    <AssistantConfirmation
      session={session}
      selectedSource={SOURCE}
      legalPreview={{
        referenceCount: 4,
        topReferences: [
          { id: "sec-53", sourceLabel: "SchulG NRW", reference: "§ 53", freshness: "current" },
          { id: "sec-vv", sourceLabel: "VV-SchulR", reference: "Nr. 4.2", freshness: "unknown" },
        ],
      }}
      openQuestionCount={0}
      onHandoff={() => {}}
      onBackToQuestions={() => {}}
    />,
  );
  assert.ok(html.includes("Zu diesem Praxisfall sind 4 Rechtsgrundlagen hinterlegt."));
  assert.ok(html.includes("SchulG NRW"));
  assert.ok(html.includes("§ 53"));
  assert.ok(html.includes("Aktuelle Fassung"));
  assert.ok(html.includes("Aktualität unbekannt"));
  assert.ok(html.includes("Im Navigator ansehen"));
});

test("AssistantConfirmation ohne Praxisfall täuscht keine Rechtsgrundlagen-Vorschau vor", () => {
  const session = makeSession({ coverage: COVERAGE });
  const html = render(
    <AssistantConfirmation
      session={session}
      selectedSource={null}
      legalPreview={null}
      openQuestionCount={0}
      onHandoff={() => {}}
      onBackToQuestions={() => {}}
    />,
  );
  assert.ok(!html.includes("Rechtsgrundlage"));
  assert.ok(!html.includes("Im Navigator ansehen"));
  assert.ok(html.includes("Ohne Praxisfall (allgemeine Bearbeitung)"));
});

test("AssistantHandoff bestätigt die Übergabe und bietet Navigator-Einstieg", () => {
  const session = makeSession({ status: "handedOff", handoffAt: "2026-08-08T07:30:00.000Z" });
  const html = render(<AssistantHandoff session={session} onReset={() => {}} />);
  assert.ok(html.includes("Angaben übernommen"));
  assert.ok(html.includes("Zum Navigator"));
  assert.ok(html.includes("Neue Fallschilderung beginnen"));
});

test("AssistantSessionControls bietet Pausieren, Abbrechen und Zurücksetzen", () => {
  const html = render(
    <AssistantSessionControls
      status="running"
      onPause={() => {}}
      onResume={() => {}}
      onCancel={() => {}}
      onReset={() => {}}
    />,
  );
  assert.ok(html.includes("Pausieren"));
  assert.ok(html.includes("Abbrechen"));
  assert.ok(html.includes("Zurücksetzen"));
});

test("AssistantConversation dokumentiert den Verlauf der Bearbeitung", () => {
  const session = makeSession({});
  const html = render(<AssistantConversation session={session} />);
  assert.ok(html.includes("Verlauf der Bearbeitung"));
  assert.ok(html.includes("Ihre Schilderung"));
});

test("DecisionAssistant zeigt ohne Sitzung die Eingabe der Fallschilderung", () => {
  const html = render(<DecisionAssistant controller={makeController({})} />);
  assert.ok(html.includes("Was ist vorgefallen?"));
});

test("DecisionAssistant zeigt vor der Hydration einen Ladehinweis", () => {
  const html = render(<DecisionAssistant controller={makeController({ hydrated: false })} />);
  assert.ok(html.includes("Bearbeitung wird geladen"));
});

test("DecisionAssistant zeigt nach der Übergabe die Abschlussansicht", () => {
  const session = makeSession({ status: "handedOff", handoffAt: "2026-08-08T07:30:00.000Z" });
  const html = render(<DecisionAssistant controller={makeController({ session })} />);
  assert.ok(html.includes("Angaben übernommen"));
  assert.ok(html.includes("Zum Navigator"));
});

test("DecisionAssistant zeigt Treffer, Rückfragen und Bestätigung im Ablauf", () => {
  const session = makeSession({
    matchResult: makeResult([makeMatch({})]),
    coverage: COVERAGE,
    analysis: {
      wordCount: 12,
      category: "konflikt",
      locationType: "classroom",
      roles: ["student"],
      repeated: true,
      ongoing: null,
      dangerReported: null,
      witnessesPresent: true,
      evidencePresent: null,
      measuresTaken: null,
      leadershipInformed: null,
      parentContact: null,
      findings: [
        { field: "category", label: "Einordnung", display: "Konflikt", evidence: "beleidigt" },
      ],
      openAspects: [],
    },
  });
  const question: AssistantQuestion = {
    questionId: "gefahren.gemeldet",
    title: "Wurde eine akute Gefährdung gemeldet?",
    help: "",
    kind: "boolean",
    reason: "Keine Gefahrenangabe in der Schilderung.",
    priority: 1,
    required: true,
  };
  const html = render(
    <DecisionAssistant controller={makeController({ session, questions: [question] })} />,
  );
  assert.ok(html.includes("Passende Praxisfälle"));
  assert.ok(html.includes("Rückfragen"));
  assert.ok(html.includes("Übergabe prüfen"));
  assert.ok(html.includes("Verlauf der Bearbeitung"));
});

test("Route /assistent trägt vollständige Head-Metadaten", async () => {
  const { Route } = await import("@/routes/assistent");
  const head = (Route.options as { head?: () => { meta: Array<Record<string, string>> } }).head?.();
  assert.ok(head, "head() fehlt");
  const meta = head!.meta;
  const title = meta.find((m) => m.title)?.title ?? "";
  assert.ok(title.length > 0 && title.length <= 60);
  for (const key of ["description", "og:title", "og:description", "og:type", "twitter:card"]) {
    const found = meta.some((m) => m.name === key || m.property === key);
    assert.ok(found, `Meta ${key} fehlt`);
  }
});
