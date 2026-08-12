/**
 * Sprint 4.6B – Zentraler Service des Situation Analyzers.
 * Alle Zustandsänderungen laufen ausschließlich über diesen Service.
 */
import { SituationAnalyzerEventBus } from "./SituationAnalyzerEventBus";
import { SituationCaseMapper, createSituationId } from "./SituationCaseMapper";
import { SituationCompletenessCalculator } from "./SituationCompletenessCalculator";
import { SituationQuestionResolver } from "./SituationQuestionResolver";
import { SituationSchemaRegistry, defaultSituationSchemaRegistry } from "./SituationSchemaRegistry";
import { SituationValidator } from "./SituationValidator";
import type {
  AnswerSource,
  SituationAnswer,
  SituationAnswerValue,
  SituationCase,
  SituationCompleteness,
  SituationEventListener,
  SituationEventName,
  SituationEvidence,
  SituationMeasure,
  SituationParticipant,
  SituationSchemaDefinition,
  SituationValidationResult,
  SituationWitness,
} from "./types";

export interface SituationAnalyzerServiceOptions {
  navigatorId: string;
  workflowId: string;
  schemaId?: string;
  registry?: SituationSchemaRegistry;
  now?: () => Date;
}

export type NewParticipant = Partial<Omit<SituationParticipant, "id">> & { displayName: string };
export type NewWitness = Partial<Omit<SituationWitness, "id">> & { displayName: string };
export type NewEvidence = Partial<Omit<SituationEvidence, "id">>;
export type NewMeasure = Partial<Omit<SituationMeasure, "id">>;

export class SituationAnalyzerService {
  private readonly bus = new SituationAnalyzerEventBus();
  private readonly registry: SituationSchemaRegistry;
  private readonly schema: SituationSchemaDefinition;
  private readonly resolver: SituationQuestionResolver;
  private readonly validator: SituationValidator;
  private readonly completeness: SituationCompletenessCalculator;
  private readonly now: () => Date;
  private situationCase: SituationCase;

  constructor(options: SituationAnalyzerServiceOptions) {
    this.registry = options.registry ?? defaultSituationSchemaRegistry;
    this.schema = options.schemaId
      ? this.registry.require(options.schemaId)
      : this.registry.getStandard();
    this.resolver = new SituationQuestionResolver(this.schema);
    this.validator = new SituationValidator(this.schema);
    this.completeness = new SituationCompletenessCalculator(this.schema);
    this.now = options.now ?? (() => new Date());
    this.situationCase = SituationCaseMapper.createEmpty({
      navigatorId: options.navigatorId,
      workflowId: options.workflowId,
      schemaId: this.schema.id,
      now: this.now,
    });
  }

  /* --------------------------------- Lesen -------------------------------- */

  getSchema(): SituationSchemaDefinition {
    return this.schema;
  }

  getResolver(): SituationQuestionResolver {
    return this.resolver;
  }

  getCase(): SituationCase {
    return JSON.parse(JSON.stringify(this.situationCase)) as SituationCase;
  }

  on(listener: SituationEventListener): () => void {
    return this.bus.on(listener);
  }

  getEvents() {
    return this.bus.history();
  }

  /* ------------------------------- Lebenszyklus --------------------------- */

  createCase(): SituationCase {
    this.situationCase = SituationCaseMapper.createEmpty({
      navigatorId: this.situationCase.navigatorId,
      workflowId: this.situationCase.workflowId,
      schemaId: this.schema.id,
      now: this.now,
    });
    this.applyDefaults();
    this.emit("SituationAnalysisStarted");
    return this.commit();
  }

  loadCase(input: SituationCase | string | unknown): SituationCase {
    const loaded =
      typeof input === "string"
        ? SituationCaseMapper.deserialize(input)
        : SituationCaseMapper.fromUnknown(input);
    this.situationCase = loaded;
    return this.commit();
  }

  serialize(): string {
    return SituationCaseMapper.serialize(this.getCase());
  }

  deserialize(raw: string): SituationCase {
    return this.loadCase(raw);
  }

  resetSituation(): SituationCase {
    const navigatorId = this.situationCase.navigatorId;
    const workflowId = this.situationCase.workflowId;
    this.bus.clear();
    this.situationCase = SituationCaseMapper.createEmpty({
      navigatorId,
      workflowId,
      schemaId: this.schema.id,
      now: this.now,
    });
    this.applyDefaults();
    this.emit("SituationReset");
    return this.commit();
  }

  /* --------------------------------- Inhalte ------------------------------ */

  updateRawDescription(description: string): SituationCase {
    this.situationCase.rawDescription = description;
    this.markProgress();
    this.emit("SituationDescriptionUpdated");
    return this.commit();
  }

  answerQuestion(
    questionId: string,
    value: SituationAnswerValue,
    source: AnswerSource = "user",
    notes?: string,
  ): SituationCase {
    return this.setAnswer(questionId, value, "answered", source, notes);
  }

  markUnknown(questionId: string, notes?: string): SituationCase {
    return this.setAnswer(questionId, null, "unknown", "user", notes);
  }

  markNotApplicable(questionId: string, notes?: string): SituationCase {
    return this.setAnswer(questionId, null, "notApplicable", "user", notes);
  }

  clearAnswer(questionId: string): SituationCase {
    this.requireQuestion(questionId);
    delete this.situationCase.answers[questionId];
    this.markProgress();
    this.emit("SituationAnswerChanged", { questionId, cleared: true });
    return this.commit();
  }

  /* ------------------------------- Beteiligte ----------------------------- */

  addParticipant(input: NewParticipant): SituationCase {
    const participant: SituationParticipant = {
      id: createSituationId("prt"),
      displayName: input.displayName,
      role: input.role ?? "unknown",
      ageGroup: input.ageGroup ?? "unknown",
      schoolRelation: input.schoolRelation ?? "",
      isAffected: input.isAffected ?? false,
      isAccused: input.isAccused ?? false,
      isWitness: input.isWitness ?? false,
      isResponsiblePerson: input.isResponsiblePerson ?? false,
      additionalInformation: input.additionalInformation ?? "",
    };
    this.situationCase.participants.push(participant);
    this.markProgress();
    this.emit("SituationParticipantAdded", { participantId: participant.id });
    return this.commit();
  }

  updateParticipant(id: string, patch: Partial<Omit<SituationParticipant, "id">>): SituationCase {
    const index = this.situationCase.participants.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Beteiligte Person "${id}" existiert nicht.`);
    this.situationCase.participants[index] = {
      ...this.situationCase.participants[index],
      ...patch,
      id,
    };
    this.markProgress();
    return this.commit();
  }

  removeParticipant(id: string): SituationCase {
    this.situationCase.participants = this.situationCase.participants.filter((p) => p.id !== id);
    this.situationCase.witnesses = this.situationCase.witnesses.map((w) =>
      w.participantId === id ? { ...w, participantId: null } : w,
    );
    this.markProgress();
    this.emit("SituationParticipantRemoved", { participantId: id });
    return this.commit();
  }

  addWitness(input: NewWitness): SituationCase {
    if (input.participantId && !this.situationCase.participants.some((p) => p.id === input.participantId)) {
      throw new Error("Der Zeuge verweist auf eine nicht vorhandene beteiligte Person.");
    }
    const witness: SituationWitness = {
      id: createSituationId("wit"),
      participantId: input.participantId ?? null,
      displayName: input.displayName,
      role: input.role ?? "unknown",
      statementAvailable: input.statementAvailable ?? false,
      statementDocumented: input.statementDocumented ?? false,
      notes: input.notes ?? "",
    };
    this.situationCase.witnesses.push(witness);
    this.markProgress();
    this.emit("SituationWitnessAdded", { witnessId: witness.id });
    return this.commit();
  }

  removeWitness(id: string): SituationCase {
    this.situationCase.witnesses = this.situationCase.witnesses.filter((w) => w.id !== id);
    this.markProgress();
    this.emit("SituationWitnessRemoved", { witnessId: id });
    return this.commit();
  }

  addEvidence(input: NewEvidence): SituationCase {
    const evidence: SituationEvidence = {
      id: createSituationId("evd"),
      type: input.type ?? "other",
      description: input.description ?? "",
      available: input.available ?? false,
      secured: input.secured ?? false,
      storageLocation: input.storageLocation ?? "",
      createdAt: input.createdAt ?? this.now().toISOString(),
      notes: input.notes ?? "",
    };
    this.situationCase.evidence.push(evidence);
    this.markProgress();
    this.emit("SituationEvidenceAdded", { evidenceId: evidence.id });
    return this.commit();
  }

  removeEvidence(id: string): SituationCase {
    this.situationCase.evidence = this.situationCase.evidence.filter((e) => e.id !== id);
    this.markProgress();
    this.emit("SituationEvidenceRemoved", { evidenceId: id });
    return this.commit();
  }

  addMeasure(input: NewMeasure): SituationCase {
    const measure: SituationMeasure = {
      id: createSituationId("msr"),
      type: input.type ?? "other",
      description: input.description ?? "",
      performedAt: input.performedAt ?? "",
      performedBy: input.performedBy ?? "",
      documented: input.documented ?? false,
      result: input.result ?? "",
    };
    this.situationCase.measuresTaken.push(measure);
    this.markProgress();
    this.emit("SituationMeasureAdded", { measureId: measure.id });
    return this.commit();
  }

  removeMeasure(id: string): SituationCase {
    this.situationCase.measuresTaken = this.situationCase.measuresTaken.filter((m) => m.id !== id);
    this.markProgress();
    this.emit("SituationMeasureRemoved", { measureId: id });
    return this.commit();
  }

  /* ------------------------- Prüfung und Abschluss ------------------------ */

  validate(): SituationValidationResult {
    return this.validator.validate(this.getCase());
  }

  calculateCompleteness(): SituationCompleteness {
    return this.completeness.calculate(this.situationCase.answers);
  }

  completeSituation(): SituationValidationResult {
    const result = this.validate();
    const completeness = this.calculateCompleteness();
    if (!result.valid || !completeness.isComplete) {
      this.emit("SituationValidationFailed", { issues: result.issues.length });
      this.commit();
      return result;
    }
    this.situationCase.status = "complete";
    this.emit("SituationCompleted");
    this.commit();
    return result;
  }

  pause(): SituationCase {
    if (this.situationCase.status === "inProgress") this.situationCase.status = "paused";
    return this.commit();
  }

  cancel(): SituationCase {
    this.situationCase.status = "cancelled";
    return this.commit();
  }

  /* --------------------------------- Intern ------------------------------- */

  private applyDefaults(): void {
    const ts = this.now().toISOString();
    for (const question of this.schema.questions) {
      if (question.defaultValue === undefined) continue;
      this.situationCase.answers[question.id] = {
        questionId: question.id,
        value: question.defaultValue,
        answerStatus: "answered",
        answeredAt: ts,
        updatedAt: ts,
        source: "systemDefault",
      };
    }
  }

  private requireQuestion(questionId: string) {
    const question = this.schema.questions.find((q) => q.id === questionId);
    if (!question) throw new Error(`Frage "${questionId}" existiert im Schema nicht.`);
    return question;
  }

  private setAnswer(
    questionId: string,
    value: SituationAnswerValue,
    answerStatus: SituationAnswer["answerStatus"],
    source: AnswerSource,
    notes?: string,
  ): SituationCase {
    this.requireQuestion(questionId);
    const ts = this.now().toISOString();
    const previous = this.situationCase.answers[questionId];
    this.situationCase.answers[questionId] = {
      questionId,
      value,
      answerStatus,
      answeredAt: answerStatus === "notAnswered" ? null : (previous?.answeredAt ?? ts),
      updatedAt: ts,
      source,
      notes,
    };
    this.markProgress();
    this.emit("SituationAnswerChanged", { questionId, answerStatus });
    return this.commit();
  }

  private markProgress(): void {
    if (this.situationCase.status === "notStarted" || this.situationCase.status === "paused") {
      this.situationCase.status = "inProgress";
    }
    if (this.situationCase.status === "complete") this.situationCase.status = "inProgress";
  }

  private emit(name: SituationEventName, detail?: Record<string, unknown>): void {
    this.bus.emit({ name, caseId: this.situationCase.caseId, at: this.now().toISOString(), detail });
  }

  private commit(): SituationCase {
    this.situationCase = SituationCaseMapper.applyStandardProjection(this.situationCase);
    this.situationCase.completeness = this.completeness.calculate(this.situationCase.answers);
    this.situationCase.uncertainties = this.completeness.uncertainties(this.situationCase.answers);
    this.situationCase.updatedAt = this.now().toISOString();
    return this.getCase();
  }
}
