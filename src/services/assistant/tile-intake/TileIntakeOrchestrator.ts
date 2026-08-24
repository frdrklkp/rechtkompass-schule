/**
 * Tier 3 – Deterministischer Controller der Kachel-Erfassung.
 * Treibt SituationAnalyzerService direkt an (keine Freitext-Heuristiken).
 * "Schnelle Einschätzung": Matching-Ergebnis wird angezeigt, nichts wird im
 * Navigator gespeichert. "Fall dokumentieren": Situation wird abgeschlossen
 * und per bestehendem Handoff-Mechanismus auf "Bewertung" übergeben.
 */
import {
  SituationAnalyzerService,
  SITUATION_CONTEXT_KEY,
  type NewEvidence,
  type NewMeasure,
  type NewParticipant,
  type NewWitness,
  type SituationAnswerValue,
  type SituationCase,
  type SituationParticipant,
  type SituationValidationResult,
} from "@/services/situation-analyzer";
import {
  PracticeCaseMatchingEngine,
  PRACTICE_CASE_MATCH_CONTEXT_KEY,
  type PracticeCaseMatchResult,
  type PracticeCaseSource,
} from "@/services/practice-case-matching";
import {
  startNavigatorFromAssistant,
  type AssistantHandoffResult,
} from "../AssistantNavigatorHandoff";
import { ASSISTANT_CONTEXT_KEY, ASSISTANT_SELECTED_CASE_KEY, ASSISTANT_SESSION_REFERENCE_KEY } from "../types";
import type { AssistantSelectedCaseContext, AssistantSessionReference } from "../types";
import {
  resolveVisibleOptionalSequence,
  resolveVisibleSequence,
  type TileSequenceStep,
} from "./tileQuestionSequence";
import {
  LocalStorageTileIntakeSessionStore,
  type TileIntakeSessionStorePort,
} from "./TileIntakeSessionStore";
import {
  TILE_INTAKE_NAVIGATOR_ID,
  TILE_INTAKE_SESSION_VERSION,
  TILE_INTAKE_WORKFLOW_ID,
  type TileIntakeMode,
  type TileIntakeSession,
  type TileIntakeStage,
} from "./types";

export class TileIntakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TileIntakeError";
  }
}

export interface TileIntakeDocumentationResult {
  valid: boolean;
  validation: SituationValidationResult;
  handoff: AssistantHandoffResult | null;
}

export class TileIntakeOrchestrator {
  private service: SituationAnalyzerService;
  private session: TileIntakeSession;
  private readonly store: TileIntakeSessionStorePort;

  constructor(
    private readonly matching: PracticeCaseMatchingEngine,
    store: TileIntakeSessionStorePort = new LocalStorageTileIntakeSessionStore(),
  ) {
    this.store = store;
    this.service = new SituationAnalyzerService({
      navigatorId: TILE_INTAKE_NAVIGATOR_ID,
      workflowId: TILE_INTAKE_WORKFLOW_ID,
    });

    const stored = this.store.load();
    if (stored && stored.stage !== "handedOff") {
      try {
        this.service.loadCase(stored.situation);
        this.session = stored;
        return;
      } catch {
        /* Beschädigte Sitzung - neu beginnen. */
      }
    }
    this.session = this.freshSession();
  }

  private freshSession(): TileIntakeSession {
    const situation = this.service.createCase();
    const now = new Date().toISOString();
    return {
      version: TILE_INTAKE_SESSION_VERSION,
      sessionId: `kachel-${now}`,
      navigatorId: TILE_INTAKE_NAVIGATOR_ID,
      workflowId: TILE_INTAKE_WORKFLOW_ID,
      mode: null,
      stage: "modeChoice",
      situation,
      cursor: 0,
      optionalDetailsStarted: false,
      matchResult: null,
      selectedCaseId: null,
      startedAt: now,
      updatedAt: now,
    };
  }

  getSession(): TileIntakeSession {
    return this.session;
  }

  private touch(patch: Partial<TileIntakeSession>): TileIntakeSession {
    this.session = { ...this.session, ...patch, updatedAt: new Date().toISOString() };
    this.store.save(this.session);
    return this.session;
  }

  /* ------------------------------ Modus/Ablauf ----------------------------- */

  chooseMode(mode: TileIntakeMode): TileIntakeSession {
    return this.touch({ mode, stage: "questions", cursor: 0 });
  }

  visibleSequence(): TileSequenceStep[] {
    if (this.session.stage === "optionalDetails") {
      return resolveVisibleOptionalSequence(this.session.situation);
    }
    return resolveVisibleSequence(this.session.situation);
  }

  currentStep(): TileSequenceStep | null {
    if (this.session.stage === "optionalDetails" && !this.session.optionalDetailsStarted) return null;
    const seq = this.visibleSequence();
    return seq[this.session.cursor] ?? null;
  }

  progress(): { index: number; total: number } {
    const seq = this.visibleSequence();
    return { index: Math.min(this.session.cursor, seq.length), total: seq.length };
  }

  back(): TileIntakeSession {
    if (this.session.stage === "quickResult") {
      const coreLen = resolveVisibleSequence(this.session.situation).length;
      const optionalLen = resolveVisibleOptionalSequence(this.session.situation).length;
      if (optionalLen > 0) {
        return this.touch({
          stage: "optionalDetails",
          optionalDetailsStarted: true,
          cursor: Math.max(0, optionalLen - 1),
        });
      }
      return this.touch({ stage: "questions", cursor: Math.max(0, coreLen - 1) });
    }

    if (this.session.stage === "optionalDetails") {
      if (!this.session.optionalDetailsStarted) {
        const coreLen = resolveVisibleSequence(this.session.situation).length;
        return this.touch({ stage: "questions", cursor: Math.max(0, coreLen - 1) });
      }
      if (this.session.cursor === 0) {
        return this.touch({ optionalDetailsStarted: false });
      }
      return this.touch({ cursor: this.session.cursor - 1 });
    }

    if (this.session.cursor === 0) return this.session;
    return this.touch({ cursor: this.session.cursor - 1 });
  }

  /** Antwort auf eine reguläre (nicht-editor) Frage; schaltet automatisch weiter. */
  answer(value: SituationAnswerValue): TileIntakeSession {
    const step = this.currentStep();
    if (!step) return this.session;
    const situation = this.service.answerQuestion(step.questionId, value);
    return this.advanceAfterAnswer(situation);
  }

  markUnknown(): TileIntakeSession {
    const step = this.currentStep();
    if (!step) return this.session;
    const situation = this.service.markUnknown(step.questionId);
    return this.advanceAfterAnswer(situation);
  }

  private advanceAfterAnswer(situation: SituationCase): TileIntakeSession {
    const nextCursor = this.session.cursor + 1;
    this.touch({ situation, cursor: nextCursor });
    const seq = this.visibleSequence();
    if (nextCursor >= seq.length) {
      return this.session.stage === "optionalDetails" ? this.finishOptionalSequence() : this.finishQuestions();
    }
    return this.session;
  }

  /* --------------------------- Optionale Zusatzfragen ---------------------- */

  startOptionalDetails(): TileIntakeSession {
    const seq = resolveVisibleOptionalSequence(this.session.situation);
    if (seq.length === 0) return this.finishOptionalSequence();
    return this.touch({ optionalDetailsStarted: true, cursor: 0 });
  }

  /**
   * "Nein, fertig" von der Einstiegsfrage. Setzt cursor/optionalDetailsStarted
   * so, als wäre die Folge vollständig durchlaufen worden (leer) - dadurch ist
   * der Zustand identisch zu "alle optionalen Fragen beantwortet" und lässt
   * sich in der UI nicht von einem echten Abschluss unterscheiden.
   */
  skipOptionalDetails(): TileIntakeSession {
    const seq = resolveVisibleOptionalSequence(this.session.situation);
    this.touch({ optionalDetailsStarted: true, cursor: seq.length });
    return this.finishOptionalSequence();
  }

  private finishOptionalSequence(): TileIntakeSession {
    if (this.session.mode === "schnell") {
      return this.runQuickResult();
    }
    return this.runBackgroundMatch();
  }

  /**
   * "Fall dokumentieren": Abgleich läuft im Hintergrund, damit die
   * Rechtsgrundlagen-Phase im Navigator nicht grundsätzlich leer bleibt.
   * Nur bei einem eindeutigen Treffer (level "strong") wird automatisch
   * verknüpft - schwächere Treffer werden nicht stillschweigend übernommen,
   * um keine falsche rechtliche Zuordnung vorzutäuschen. Ein Fehlschlag des
   * Abgleichs darf die Dokumentation des Falls nicht blockieren.
   */
  private runBackgroundMatch(): TileIntakeSession {
    try {
      const result = this.matching.match(this.session.situation);
      const best = result.matches[0];
      const selectedCaseId =
        best && best.level === "strong" ? best.caseId : this.session.selectedCaseId;
      return this.touch({ matchResult: result, selectedCaseId });
    } catch {
      return this.session;
    }
  }

  /* ------------------------------- Beteiligte ------------------------------ */

  addParticipant(input: NewParticipant): TileIntakeSession {
    return this.touch({ situation: this.service.addParticipant(input) });
  }

  updateParticipant(id: string, patch: Partial<Omit<SituationParticipant, "id">>): TileIntakeSession {
    return this.touch({ situation: this.service.updateParticipant(id, patch) });
  }

  removeParticipant(id: string): TileIntakeSession {
    return this.touch({ situation: this.service.removeParticipant(id) });
  }

  /* -------------------------------- Nachweise ------------------------------ */

  addEvidence(input: NewEvidence): TileIntakeSession {
    return this.touch({ situation: this.service.addEvidence(input) });
  }

  removeEvidence(id: string): TileIntakeSession {
    return this.touch({ situation: this.service.removeEvidence(id) });
  }

  /* --------------------------------- Zeugen --------------------------------- */

  addWitness(input: NewWitness): TileIntakeSession {
    return this.touch({ situation: this.service.addWitness(input) });
  }

  removeWitness(id: string): TileIntakeSession {
    return this.touch({ situation: this.service.removeWitness(id) });
  }

  /* ------------------------------- Maßnahmen -------------------------------- */

  addMeasure(input: NewMeasure): TileIntakeSession {
    return this.touch({ situation: this.service.addMeasure(input) });
  }

  removeMeasure(id: string): TileIntakeSession {
    return this.touch({ situation: this.service.removeMeasure(id) });
  }

  /**
   * Editor-Schritt (Beteiligte/Nachweise/Zeugen/Maßnahmen) explizit
   * abschließen und weiter. Markiert die zugehörige Listen-Frage als
   * "erfasst" - bei einigen dieser Fragen (z. B. zeugen.liste,
   * nachweise.liste) macht requiredWhen sie bedingt pflichtig, sobald das
   * zugehörige Gate mit "Ja" beantwortet wurde; ohne diese Markierung würde
   * completeSituation() trotz tatsächlich erfasster Einträge fehlschlagen.
   * Ein leerer Bestand ist dabei ein ebenso gültiges Signal wie ein
   * gefüllter (vgl. Schema-Kommentar zu beteiligte.liste).
   */
  confirmEditorStep(): TileIntakeSession {
    const step = this.currentStep();
    const situation = step
      ? this.service.answerQuestion(step.questionId, "erfasst")
      : this.service.getCase();
    return this.advanceAfterAnswer(situation);
  }

  /* -------------------------------- Abschluss ------------------------------ */

  /** Kernfolge abgeschlossen: Einstieg in die optionale Zusatzfolge. */
  private finishQuestions(): TileIntakeSession {
    return this.touch({ stage: "optionalDetails", cursor: 0, optionalDetailsStarted: false });
  }

  private runQuickResult(): TileIntakeSession {
    const result = this.matching.match(this.session.situation);
    return this.touch({ matchResult: result, stage: "quickResult" });
  }

  selectCase(caseId: string | null): TileIntakeSession {
    return this.touch({ selectedCaseId: caseId });
  }

  /**
   * "Fall dokumentieren": Situation abschließen und per bestehendem
   * Handoff-Mechanismus auf "Bewertung" übergeben. Schlägt kontrolliert fehl
   * (valid:false), statt eine unvollständige Session zu übergeben.
   */
  completeAndHandoff(selectedSource?: PracticeCaseSource | null): TileIntakeDocumentationResult {
    const validation = this.service.completeSituation();
    const situation = this.service.getCase();
    this.touch({ situation });
    if (!validation.valid || !situation.completeness.isComplete) {
      return { valid: false, validation, handoff: null };
    }

    const handedOverAt = new Date().toISOString();
    const match = this.session.selectedCaseId
      ? (this.session.matchResult?.matches.find((m) => m.caseId === this.session.selectedCaseId) ?? null)
      : null;

    const context: Record<string, unknown> = {
      [SITUATION_CONTEXT_KEY]: situation,
      navigatorTitle: situation.title,
      [ASSISTANT_CONTEXT_KEY]: {
        sessionId: this.session.sessionId,
        description: situation.rawDescription,
        coverage: null,
        selectedCaseId: this.session.selectedCaseId,
        handedOverAt,
      },
      [ASSISTANT_SESSION_REFERENCE_KEY]: {
        sessionId: this.session.sessionId,
        startedAt: this.session.startedAt,
        handedOverAt,
        answeredQuestionIds: Object.keys(situation.answers),
        coverageLevel: null,
      } satisfies AssistantSessionReference,
      [ASSISTANT_SELECTED_CASE_KEY]:
        this.session.selectedCaseId && selectedSource
          ? ({
              caseId: selectedSource.id,
              title: selectedSource.title,
              version: selectedSource.updatedAt,
              curated: selectedSource.hasDecisionTree,
              legalSectionIds: [...selectedSource.legalSectionIds],
              templateIds: [...selectedSource.templateIds],
              matchLevel: match?.level ?? null,
              matchScore: match?.score ?? null,
            } satisfies AssistantSelectedCaseContext)
          : null,
    };
    if (this.session.matchResult) context[PRACTICE_CASE_MATCH_CONTEXT_KEY] = this.session.matchResult;

    const handoff = startNavigatorFromAssistant(context, { targetStepId: "bewertung" });
    this.touch({ stage: "handedOff" as TileIntakeStage });
    return { valid: true, validation, handoff };
  }

  /** Wechsel von "Schnelle Einschätzung" zu "Fall dokumentieren" ohne Neueingabe. */
  upgradeToDocumentation(selectedSource?: PracticeCaseSource | null): TileIntakeDocumentationResult {
    this.touch({ mode: "dokumentieren" });
    return this.completeAndHandoff(selectedSource);
  }

  reset(): TileIntakeSession {
    this.service = new SituationAnalyzerService({
      navigatorId: TILE_INTAKE_NAVIGATOR_ID,
      workflowId: TILE_INTAKE_WORKFLOW_ID,
    });
    this.session = this.freshSession();
    this.store.save(this.session);
    return this.session;
  }
}

export function createTileIntakeOrchestrator(
  matching: PracticeCaseMatchingEngine,
  store?: TileIntakeSessionStorePort,
): TileIntakeOrchestrator {
  return new TileIntakeOrchestrator(matching, store);
}
