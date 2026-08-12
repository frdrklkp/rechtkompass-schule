/**
 * Sprint 4.6C – Zentrale Assessment Engine.
 * Deterministische, regelbasierte Bewertung strukturierter Situationsangaben.
 * Keine KI, keine Freitextinterpretation, keine Handlungsempfehlungen.
 */
import type { SituationCase } from "@/services/situation-analyzer";
import { AssessmentConfidenceCalculator } from "./AssessmentConfidenceCalculator";
import { AssessmentConflictResolver } from "./AssessmentConflictResolver";
import { AssessmentEventBus } from "./AssessmentEventBus";
import { AssessmentResultAggregator, affectsTrafficLight } from "./AssessmentResultAggregator";
import { AssessmentRuleEvaluator, type RuleEvaluation } from "./AssessmentRuleEvaluator";
import { AssessmentRuleRegistry } from "./AssessmentRuleRegistry";
import { AssessmentValidator } from "./AssessmentValidator";
import { computeInputHash } from "./inputHash";
import { STANDARD_ASSESSMENT_RULES } from "./standardAssessmentRules";
import {
  ASSESSMENT_SCHEMA_VERSION,
  STANDARD_LIMITATIONS,
  type AssessmentConflict,
  type AssessmentContextEntry,
  type AssessmentInput,
  type AssessmentMatchedRule,
  type AssessmentMissingInformation,
  type AssessmentReason,
  type AssessmentResult,
  type AssessmentRule,
  type AssessmentStatus,
  type AssessmentUnresolvedQuestion,
  type AssessmentValidationResult,
} from "./types";

export class AssessmentError extends Error {
  constructor(
    public readonly code:
      | "situation_missing"
      | "situation_invalid"
      | "situation_incompatible"
      | "rule_definition_invalid"
      | "evaluation_failed",
    message: string,
  ) {
    super(message);
    this.name = "AssessmentError";
  }
}

export interface AssessmentEngineOptions {
  navigatorId: string;
  workflowId: string;
  rules?: AssessmentRule[];
  now?: () => Date;
  idFactory?: () => string;
}

function defaultId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `asm_${crypto.randomUUID()}`;
    }
  } catch {
    /* Fallback unten */
  }
  return `asm_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export class AssessmentEngine {
  private readonly registry: AssessmentRuleRegistry;
  private readonly evaluator = new AssessmentRuleEvaluator();
  private readonly aggregator = new AssessmentResultAggregator();
  private readonly confidenceCalculator = new AssessmentConfidenceCalculator();
  private readonly conflictResolver = new AssessmentConflictResolver();
  private readonly validator = new AssessmentValidator();
  readonly events = new AssessmentEventBus();

  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(private readonly options: AssessmentEngineOptions) {
    this.registry = new AssessmentRuleRegistry(options.rules ?? STANDARD_ASSESSMENT_RULES);
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultId;
  }

  getRegistry(): AssessmentRuleRegistry {
    return this.registry;
  }

  /* ------------------------------ Service API ----------------------------- */

  /** Leeres Ergebnis im Status `notStarted`. */
  createAssessment(caseId: string): AssessmentResult {
    const ts = this.now().toISOString();
    return {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      assessmentId: this.idFactory(),
      caseId,
      navigatorId: this.options.navigatorId,
      workflowId: this.options.workflowId,
      status: "notStarted",
      trafficLight: "unknown",
      severity: "unknown",
      confidence: {
        score: 0,
        level: "unknown",
        reasons: ["Es wurde noch keine Bewertung ausgeführt."],
        dataCompleteness: 0,
        ruleCoverage: 0,
        uncertaintyCount: 0,
      },
      summary: "Es wurde noch keine Bewertung ausgeführt.",
      reasons: [],
      matchedRules: [],
      unresolvedQuestions: [],
      missingInformation: [],
      conflicts: [],
      limitations: [...STANDARD_LIMITATIONS],
      inputHash: "",
      evaluatedInputHash: "",
      evaluatedAt: ts,
      updatedAt: ts,
    };
  }

  validateInput(situation: unknown): AssessmentValidationResult {
    const situationResult = this.validator.validateSituation(situation);
    const ruleResult = this.validator.validateRules(this.registry);
    return {
      valid: situationResult.valid && ruleResult.valid,
      issues: [...situationResult.issues, ...ruleResult.issues],
    };
  }

  getApplicableRules(): AssessmentRule[] {
    return this.registry.listEnabled();
  }

  evaluateRule(situation: SituationCase, rule: AssessmentRule): RuleEvaluation {
    return this.evaluator.evaluate(situation, rule);
  }

  aggregateResults(
    matched: RuleEvaluation[],
    conflicts: AssessmentConflict[],
    dataCompleteness: number,
  ) {
    return this.aggregator.aggregate({ matched, conflicts, dataCompleteness });
  }

  calculateConfidence(
    matched: RuleEvaluation[],
    situation: SituationCase,
    missingInformation: AssessmentMissingInformation[],
  ) {
    return this.confidenceCalculator.calculate({
      matched,
      enabledRuleCount: this.registry.listEnabled().length,
      dataCompleteness: situation.completeness.completionPercentage,
      uncertaintyCount: situation.uncertainties.length,
      missingInformation,
    });
  }

  detectConflicts(situation: SituationCase, matched: RuleEvaluation[]): AssessmentConflict[] {
    return this.conflictResolver.detect(situation, matched);
  }

  getMissingInformation(
    situation: SituationCase,
    matched: RuleEvaluation[],
  ): AssessmentMissingInformation[] {
    const items: AssessmentMissingInformation[] = [];
    const seen = new Set<string>();
    for (const evaluation of matched) {
      for (const missing of evaluation.rule.result.missingInformation ?? []) {
        if (seen.has(missing.field)) continue;
        seen.add(missing.field);
        items.push(missing);
      }
    }
    for (const questionId of situation.completeness.missingRequiredQuestions) {
      if (seen.has(questionId)) continue;
      seen.add(questionId);
      items.push({
        field: questionId,
        label: questionId,
        reason: "Eine als verpflichtend gekennzeichnete Angabe wurde noch nicht beantwortet.",
        requiredFor: "Vollständigkeit der Erfassung",
        answerStatus: "notAnswered",
        severity: "relevant",
      });
    }
    return items;
  }

  /** Führt die vollständige Bewertung aus. */
  evaluate(input: AssessmentInput): AssessmentResult {
    const validation = this.validateInput(input.situation);
    if (!validation.valid) {
      const first = validation.issues[0];
      this.events.emit("AssessmentFailed", input.caseId, { issues: validation.issues });
      throw new AssessmentError(first.code, first.message);
    }

    const situation = input.situation;
    this.events.emit("AssessmentStarted", input.caseId, { navigatorId: input.navigatorId });

    const matched: RuleEvaluation[] = [];
    for (const rule of this.registry.listEnabled()) {
      const evaluation = this.evaluator.evaluate(situation, rule);
      if (evaluation.matched) {
        matched.push(evaluation);
        this.events.emit("AssessmentRuleMatched", input.caseId, { ruleId: rule.id });
        if (rule.stopProcessing) break;
      } else {
        this.events.emit("AssessmentRuleSkipped", input.caseId, {
          ruleId: rule.id,
          reason: evaluation.skippedReason,
        });
      }
    }

    const conflicts = this.detectConflicts(situation, matched);
    for (const conflict of conflicts) {
      this.events.emit("AssessmentConflictDetected", input.caseId, { conflictId: conflict.id });
    }

    const missingInformation = this.getMissingInformation(situation, matched);
    const aggregation = this.aggregateResults(
      matched,
      conflicts,
      situation.completeness.completionPercentage,
    );
    const confidence = this.calculateConfidence(matched, situation, missingInformation);

    const reasons: AssessmentReason[] = matched.map((evaluation) =>
      this.evaluator.buildReason(evaluation),
    );
    const matchedRules: AssessmentMatchedRule[] = matched.map((evaluation) => ({
      ruleId: evaluation.rule.id,
      version: evaluation.rule.version,
      title: evaluation.rule.title,
      priority: evaluation.rule.priority,
      trafficLightContribution: affectsTrafficLight(evaluation)
        ? evaluation.rule.result.trafficLightContribution
        : "unknown",
      severityContribution: evaluation.rule.result.severityContribution,
      confidenceImpact: evaluation.rule.result.confidenceImpact,
    }));

    const unresolvedQuestions: AssessmentUnresolvedQuestion[] = situation.uncertainties.map((u) => ({
      field: u.questionId,
      question: u.title,
    }));

    const limitations = [...STANDARD_LIMITATIONS];
    for (const evaluation of matched) {
      const limitation = evaluation.rule.result.limitation;
      if (limitation && !limitations.includes(limitation)) limitations.push(limitation);
    }
    if (matched.length === 0) {
      limitations.push(
        "Auf die erfassten Angaben hat keine registrierte Bewertungsregel zugetroffen.",
      );
    }

    const status: AssessmentStatus = conflicts.some((c) => c.blocksAssessment)
      ? "conflicted"
      : aggregation.trafficLight === "unknown"
        ? "incomplete"
        : "completed";

    const hash = computeInputHash(situation);
    const ts = this.now().toISOString();

    const result: AssessmentResult = {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      assessmentId: this.idFactory(),
      caseId: input.caseId,
      navigatorId: input.navigatorId,
      workflowId: input.workflowId,
      status,
      trafficLight: aggregation.trafficLight,
      severity: aggregation.severity,
      confidence,
      summary: aggregation.explanation,
      reasons,
      matchedRules,
      unresolvedQuestions,
      missingInformation,
      conflicts,
      limitations,
      inputHash: hash,
      evaluatedInputHash: hash,
      evaluatedAt: input.evaluatedAt || ts,
      updatedAt: ts,
    };

    if (status === "completed") this.events.emit("AssessmentCompleted", input.caseId, { trafficLight: result.trafficLight });
    else if (status === "incomplete") this.events.emit("AssessmentIncomplete", input.caseId, {});

    return result;
  }

  resetAssessment(caseId: string): AssessmentResult {
    this.events.emit("AssessmentReset", caseId, {});
    return this.createAssessment(caseId);
  }

  /* ------------------------------ Serialisierung --------------------------- */

  serialize(result: AssessmentResult): string {
    return JSON.stringify(result);
  }

  deserialize(raw: string): AssessmentResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AssessmentError(
        "situation_invalid",
        "Das gespeicherte Bewertungsergebnis konnte nicht gelesen werden.",
      );
    }
    return AssessmentEngine.resultFromUnknown(parsed);
  }

  /** Kontrollierte Prüfung eines gespeicherten Ergebnisses. */
  static resultFromUnknown(input: unknown): AssessmentResult {
    if (typeof input !== "object" || input === null) {
      throw new AssessmentError(
        "situation_invalid",
        "Das gespeicherte Bewertungsergebnis hat ein unerwartetes Format.",
      );
    }
    const candidate = input as Partial<AssessmentResult>;
    if (candidate.schemaVersion !== ASSESSMENT_SCHEMA_VERSION) {
      throw new AssessmentError(
        "situation_incompatible",
        `Das gespeicherte Bewertungsergebnis stammt aus einer anderen Version (${String(candidate.schemaVersion)}).`,
      );
    }
    if (!candidate.trafficLight || !Array.isArray(candidate.reasons)) {
      throw new AssessmentError(
        "situation_invalid",
        "Das gespeicherte Bewertungsergebnis ist unvollständig.",
      );
    }
    return candidate as AssessmentResult;
  }

  /* --------------------------- Navigator-Kontext --------------------------- */

  buildContextEntry(situation: SituationCase, result: AssessmentResult | null): AssessmentContextEntry {
    const hash = computeInputHash(situation);
    return {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      inputSnapshotReference: situation.caseId,
      inputHash: hash,
      result,
      status: result?.status ?? "notStarted",
      evaluatedAt: result?.evaluatedAt ?? null,
      isStale: result ? result.evaluatedInputHash !== hash : false,
    };
  }

  static isStale(entry: AssessmentContextEntry | null, situation: SituationCase): boolean {
    if (!entry || !entry.result) return false;
    return entry.result.evaluatedInputHash !== computeInputHash(situation);
  }
}
