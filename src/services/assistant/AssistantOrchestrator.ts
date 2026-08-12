/**
 * Sprint 4.6F – Fassade des Entscheidungsassistenten.
 *
 * Der Orchestrator verbindet die bestehenden Bausteine:
 *   freie Schilderung → Situation Analyzer → Practice Case Matching →
 *   Rückfragen → Übergabe an den Decision Navigator.
 *
 * Es entsteht keine zweite Fachlogik: Strukturierung, Abgleich und
 * Navigation verbleiben in den jeweiligen Engines. Keine KI, keine
 * Rechtsauslegung, keine erfundenen Tatsachen.
 */
import {
  PracticeCaseMatchingEngine,
  PRACTICE_CASE_MATCH_CONTEXT_KEY,
  type PracticeCaseMatchResult,
  type PracticeCaseSource,
} from "@/services/practice-case-matching";
import {
  SITUATION_CONTEXT_KEY,
  SituationAnalyzerService,
  type SituationAnswerValue,
  type SituationCase,
} from "@/services/situation-analyzer";
import { AssistantCoverageCalculator, defaultCoverageCalculator } from "./AssistantCoverage";
import { AssistantEventBus } from "./AssistantEventBus";
import { AssistantQuestionPlanner, defaultQuestionPlanner } from "./AssistantQuestionPlanner";
import {
  InMemoryAssistantSessionStore,
  type AssistantSessionStorePort,
} from "./AssistantSessionStore";
import { AssistantSituationBuilder, defaultSituationBuilder } from "./AssistantSituationBuilder";
import {
  AssistantDescriptionAnalyzer,
  defaultDescriptionAnalyzer,
} from "./descriptionAnalysis";
import {
  ASSISTANT_CONTEXT_KEY,
  ASSISTANT_NAVIGATOR_ID,
  ASSISTANT_SELECTED_CASE_KEY,
  ASSISTANT_SESSION_REFERENCE_KEY,
  ASSISTANT_SESSION_VERSION,
  ASSISTANT_WORKFLOW_ID,
  type AssistantQuestion,
  type AssistantSelectedCaseContext,
  type AssistantSession,
  type AssistantSessionReference,
  type AssistantStaleReason,
} from "./types";


export class AssistantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantError";
  }
}

/** Mindestlänge einer auswertbaren Schilderung (Zeichen). */
export const MIN_DESCRIPTION_LENGTH = 40;

export interface AssistantOrchestratorOptions {
  matching: PracticeCaseMatchingEngine;
  store?: AssistantSessionStorePort;
  events?: AssistantEventBus;
  analyzer?: AssistantDescriptionAnalyzer;
  builder?: AssistantSituationBuilder;
  planner?: AssistantQuestionPlanner;
  coverage?: AssistantCoverageCalculator;
  navigatorId?: string;
  workflowId?: string;
}

export class AssistantOrchestrator {
  readonly events: AssistantEventBus;
  private readonly matching: PracticeCaseMatchingEngine;
  private readonly store: AssistantSessionStorePort;
  private readonly analyzer: AssistantDescriptionAnalyzer;
  private readonly builder: AssistantSituationBuilder;
  private readonly planner: AssistantQuestionPlanner;
  private readonly coverage: AssistantCoverageCalculator;
  private readonly navigatorId: string;
  private readonly workflowId: string;
  /** Aktive Situationsinstanz zur Rückfragenbeantwortung. */
  private situationService: SituationAnalyzerService | null = null;

  constructor(options: AssistantOrchestratorOptions) {
    this.matching = options.matching;
    this.store = options.store ?? new InMemoryAssistantSessionStore();
    this.events = options.events ?? new AssistantEventBus();
    this.analyzer = options.analyzer ?? defaultDescriptionAnalyzer;
    this.builder = options.builder ?? defaultSituationBuilder;
    this.planner = options.planner ?? defaultQuestionPlanner;
    this.coverage = options.coverage ?? defaultCoverageCalculator;
    this.navigatorId = options.navigatorId ?? ASSISTANT_NAVIGATOR_ID;
    this.workflowId = options.workflowId ?? ASSISTANT_WORKFLOW_ID;
  }

  /** Index aus dem Fallbestand aufbauen (Voraussetzung des Abgleichs). */
  prepareIndex(sources: PracticeCaseSource[]) {
    return this.matching.rebuildIndex(sources);
  }

  getSession(): AssistantSession | null {
    const session = this.store.load();
    if (session && session.situation && !this.situationService) {
      /* Nach einem Neuladen die Situationsinstanz wiederherstellen. */
      const service = new SituationAnalyzerService({
        navigatorId: session.navigatorId,
        workflowId: session.workflowId,
      });
      try {
        service.loadCase(session.situation);
        this.situationService = service;
      } catch {
        this.situationService = null;
      }
    }
    return session;
  }

  private persist(session: AssistantSession): AssistantSession {
    const next = { ...session, updatedAt: new Date().toISOString() };
    this.store.save(next);
    return next;
  }

  private require(): AssistantSession {
    const session = this.getSession();
    if (!session) throw new AssistantError("Es liegt keine Assistenten-Sitzung vor.");
    return session;
  }

  /** Schilderung strukturieren und Sitzung anlegen beziehungsweise ersetzen. */
  structure(description: string): AssistantSession {
    const text = description.trim();
    if (text.length < MIN_DESCRIPTION_LENGTH) {
      throw new AssistantError(
        `Bitte schildern Sie den Fall mit mindestens ${MIN_DESCRIPTION_LENGTH} Zeichen, damit die Angaben strukturiert werden können.`,
      );
    }

    const analysis = this.analyzer.analyze(text);
    const built = this.builder.build(text, analysis, this.navigatorId, this.workflowId);
    this.situationService = built.service;

    const now = new Date().toISOString();
    const previous = this.store.load();
    const session: AssistantSession = {
      version: ASSISTANT_SESSION_VERSION,
      sessionId: previous?.sessionId ?? `assistent-${now}`,
      navigatorId: this.navigatorId,
      workflowId: this.workflowId,
      status: "running",
      phase: "struktur",
      description: text,
      analysis,
      situation: built.situation,
      matchResult: null,
      coverage: null,
      answeredQuestionIds: [],
      selectedCaseId: null,
      startedAt: previous?.startedAt ?? now,
      updatedAt: now,
      handoffAt: null,
    };
    this.events.emit("DescriptionStructured", session.sessionId, {
      findings: analysis.findings.length,
      open: analysis.openAspects.length,
    });
    return this.persist(session);
  }

  /** Abgleich mit dem Matching-Index ausführen. */
  runMatching(): AssistantSession {
    const session = this.require();
    if (!session.situation) throw new AssistantError("Der Sachverhalt ist noch nicht strukturiert.");

    const result: PracticeCaseMatchResult = this.matching.match(session.situation);
    const coverage = this.coverage.calculate(result, session.situation);
    this.events.emit("MatchingRequested", session.sessionId, {
      matches: result.matches.length,
      coverage: coverage.level,
    });
    return this.persist({
      ...session,
      phase: result.matches.length > 0 ? "treffer" : "rueckfragen",
      matchResult: result,
      coverage,
    });
  }

  /** Offene Rückfragen zum aktuellen Stand. */
  questions(): AssistantQuestion[] {
    const session = this.getSession();
    if (!session?.situation) return [];
    return this.planner.plan(session.situation, session.matchResult, session.answeredQuestionIds);
  }

  /** Eine Rückfrage beantworten; die Antwort fließt in den Sachverhalt. */
  answerQuestion(questionId: string, value: SituationAnswerValue): AssistantSession {
    const session = this.require();
    const service = this.situationService;
    if (!service) throw new AssistantError("Der Sachverhalt ist nicht geladen.");

    const isMulti = questionId === "informierte.stellen";
    const situation = service.answerQuestion(
      questionId,
      isMulti && !Array.isArray(value) ? [value] : value,
    );
    this.events.emit("FollowUpAnswered", session.sessionId, { questionId });

    return this.persist({
      ...session,
      phase: "rueckfragen",
      situation,
      answeredQuestionIds: [...new Set([...session.answeredQuestionIds, questionId])],
    });
  }

  /** Eine Rückfrage ausdrücklich als unbekannt kennzeichnen. */
  markQuestionUnknown(questionId: string): AssistantSession {
    const session = this.require();
    const service = this.situationService;
    if (!service) throw new AssistantError("Der Sachverhalt ist nicht geladen.");
    const situation = service.markUnknown(questionId);
    this.events.emit("FollowUpAnswered", session.sessionId, { questionId, unknown: true });
    return this.persist({
      ...session,
      situation,
      answeredQuestionIds: [...new Set([...session.answeredQuestionIds, questionId])],
    });
  }

  selectCase(caseId: string | null): AssistantSession {
    return this.persist({ ...this.require(), selectedCaseId: caseId });
  }

  /** Bearbeitung pausieren – die Sitzung bleibt vollständig erhalten. */
  pause(): AssistantSession {
    const session = this.require();
    if (session.status !== "running") {
      throw new AssistantError("Nur eine laufende Bearbeitung kann pausiert werden.");
    }
    return this.persist({ ...session, status: "paused" });
  }

  /** Pausierte Bearbeitung fortsetzen. */
  resume(): AssistantSession {
    const session = this.require();
    if (session.status !== "paused") {
      throw new AssistantError("Nur eine pausierte Bearbeitung kann fortgesetzt werden.");
    }
    return this.persist({ ...session, status: "running" });
  }

  /** Bearbeitung abbrechen; die Angaben bleiben zur Nachvollziehbarkeit erhalten. */
  cancel(): AssistantSession {
    const session = this.require();
    if (session.status === "handedOff") {
      throw new AssistantError("Die Bearbeitung wurde bereits übergeben.");
    }
    return this.persist({ ...session, status: "cancelled" });
  }


  /** Prüft, ob der Abgleich gegenüber Index oder Sachverhalt veraltet ist. */
  staleReason(): AssistantStaleReason {
    const session = this.getSession();
    if (!session?.matchResult || !session.situation) return "no_result";
    const index = this.matching.getIndex();
    if (!index || index.indexHash !== session.matchResult.indexHash) return "index_changed";
    return this.matching.isStale(session.matchResult, session.situation) ? "situation_changed" : "none";
  }

  /**
   * Übergabekontext für den Decision Navigator. Der Sachverhalt wird
   * unverändert übernommen, damit keine Angabe doppelt erfasst werden muss.
   *
   * `selected` ist der Quelldatensatz des bestätigten Praxisfalls. Es werden
   * ausschließlich vorhandene Falldaten übernommen (Version, Rechts- und
   * Vorlagenverknüpfungen, kuratierte Bearbeitung).
   */
  buildHandoffContext(selected?: PracticeCaseSource | null): Record<string, unknown> {
    const session = this.require();
    if (!session.situation) throw new AssistantError("Der Sachverhalt ist noch nicht strukturiert.");

    const handedOverAt = new Date().toISOString();
    const match = session.selectedCaseId
      ? (session.matchResult?.matches.find((m) => m.caseId === session.selectedCaseId) ?? null)
      : null;

    const context: Record<string, unknown> = {
      [SITUATION_CONTEXT_KEY]: session.situation satisfies SituationCase,
      navigatorTitle: session.situation.title,
      [ASSISTANT_CONTEXT_KEY]: {
        sessionId: session.sessionId,
        description: session.description,
        coverage: session.coverage,
        selectedCaseId: session.selectedCaseId,
        handedOverAt,
      },
      [ASSISTANT_SESSION_REFERENCE_KEY]: {
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        handedOverAt,
        answeredQuestionIds: [...session.answeredQuestionIds],
        coverageLevel: session.coverage?.level ?? null,
      } satisfies AssistantSessionReference,
      [ASSISTANT_SELECTED_CASE_KEY]:
        session.selectedCaseId && selected
          ? ({
              caseId: selected.id,
              title: selected.title,
              version: selected.updatedAt,
              curated: selected.hasDecisionTree,
              legalSectionIds: [...selected.legalSectionIds],
              templateIds: [...selected.templateIds],
              matchLevel: match?.level ?? null,
              matchScore: match?.score ?? null,
            } satisfies AssistantSelectedCaseContext)
          : null,
    };
    if (session.matchResult) context[PRACTICE_CASE_MATCH_CONTEXT_KEY] = session.matchResult;
    return context;
  }


  /** Übergabe abschließen (Sitzung bleibt zur Nachvollziehbarkeit erhalten). */
  completeHandoff(): AssistantSession {
    const session = this.require();
    this.events.emit("HandoffPrepared", session.sessionId, {
      selectedCaseId: session.selectedCaseId,
    });
    return this.persist({
      ...session,
      status: "handedOff",
      phase: "uebergabe",
      handoffAt: new Date().toISOString(),
    });
  }

  reset(): void {
    const session = this.store.load();
    if (session) this.events.emit("AssistantReset", session.sessionId);
    this.situationService = null;
    this.store.clear();
  }
}
