/**
 * LegalCopilotService – Orchestrator der Grounded Copilot-Pipeline.
 *
 *  1. Session öffnen
 *  2. Retrieval (HybridRetrievalService)
 *  3. Grounding (nur Retrieval-Treffer)
 *  4. Kontext + Prompt bauen (versioniert)
 *  5. LLM aufrufen (nur strukturierte JSON-Antwort)
 *  6. Halluzinationsprüfung
 *  7. Konfidenz berechnen
 *  8. Antwort formatieren + Zitate injizieren
 *  9. Safety-Check
 * 10. Telemetrie + Statistiken
 *
 * Keine freie Rechtsberatung. Keine Änderung am Editorial Workflow.
 */
import { HybridRetrievalService } from "@/services/legal-knowledge/retrieval";
import type { RetrievalRepositoryPort } from "@/services/legal-knowledge/retrieval/repositories/RetrievalRepository";
import type { RetrievalFilters, RetrievalResult } from "@/services/legal-knowledge/retrieval/types";
import type { WorkflowTemplateRepositoryPort } from "@/services/legal-workflows";

import { AnswerFormatter } from "./AnswerFormatter";
import { AnswerGenerator } from "./AnswerGenerator";
import { AnswerValidator } from "./AnswerValidator";
import { ConfidenceCalculator } from "./ConfidenceCalculator";
import { ContextAssembler } from "./ContextAssembler";
import { ConversationService } from "./ConversationService";
import { InMemoryConversationRepository, type ConversationRepositoryPort } from "./ConversationRepository";
import { CopilotStatisticsBuilder } from "./CopilotStatistics";
import { DocumentTemplateSuggester } from "./DocumentTemplateSuggester";
import { TrustIndicatorBuilder } from "./TrustIndicator";
import { WorkflowRecommender, type CopilotWorkflowRecommendation } from "./WorkflowRecommender";
import { CopilotDisabledError, CopilotError } from "./errors";
import { ExplanationModeSpec } from "./ExplanationMode";
import { FollowUpGenerator } from "./FollowUpGenerator";
import { GroundingEngine } from "./GroundingEngine";
import { HallucinationGuard } from "./HallucinationGuard";
import { PromptBuilder } from "./PromptBuilder";
import { SafetyGuard } from "./SafetyGuard";
import { copilotTelemetry } from "./telemetry";
import { legalCopilotFlags } from "./featureFlags";
import type {
  CopilotAskInput,
  CopilotDebugPayload,
  CopilotResponse,
} from "./types";
import { COPILOT_DOMAIN_VERSION } from "./types";

export interface LegalCopilotDeps {
  retrievalRepo: RetrievalRepositoryPort;
  conversationRepo?: ConversationRepositoryPort;
  retrievalService?: HybridRetrievalService;
  workflowTemplateRepo?: WorkflowTemplateRepositoryPort;
}

export class LegalCopilotService {
  private retrieval: HybridRetrievalService;
  private conversations: ConversationService;
  private workflowTemplateRepo: WorkflowTemplateRepositoryPort | null;

  constructor(deps: LegalCopilotDeps) {
    this.retrieval = deps.retrievalService ?? new HybridRetrievalService(deps.retrievalRepo);
    this.conversations = new ConversationService(deps.conversationRepo ?? new InMemoryConversationRepository());
    this.workflowTemplateRepo = deps.workflowTemplateRepo ?? null;
  }

  async ask(input: CopilotAskInput): Promise<CopilotResponse> {
    if (!legalCopilotFlags.legalCopilotEnabled) throw new CopilotDisabledError();
    const question = (input.question ?? "").toString().trim();
    if (!question) throw new CopilotError("invalid_input", "Frage fehlt.");

    const started = Date.now();
    const mode = ExplanationModeSpec.normalize(input.mode ?? legalCopilotFlags.legalExplanationMode);
    const session = await this.conversations.openOrResume(input.sessionId);
    await this.conversations.recordUser(session.sessionId, question);

    copilotTelemetry.emit({ event: "copilot_started", sessionId: session.sessionId, mode });

    // 1. Retrieval (nur EIN Aufruf pro Anfrage)
    const filters: RetrievalFilters = {
      activeOnly: true,
      sourceIds: input.filters?.sourceIds,
    };
    const retrievalStart = Date.now();
    let retrieval: RetrievalResult;
    try {
      retrieval = await this.retrieval.search({
        query: question,
        filters,
        limit: 12,
        searchType: "hybrid",
        debug: input.debug,
        forceMock: input.forceMock,
      });
    } catch (err) {
      copilotTelemetry.emit({ event: "copilot_failed", sessionId: session.sessionId, errorCode: "retrieval_failed" });
      throw new CopilotError("retrieval_failed", err instanceof Error ? err.message : "Retrieval fehlgeschlagen.", err);
    }
    const retrievalMs = Date.now() - retrievalStart;

    // 2. Grounding
    const { grounded, droppedChunkIds, reasonings } = GroundingEngine.ground(retrieval);

    // 3. Wenn keine Grundlagen: sofort abgesicherte Nicht-Antwort
    if (grounded.length === 0) {
      const answer = AnswerFormatter.buildUnanswered(mode);
      await this.conversations.recordAnswer(session.sessionId, answer, []);
      const totalMs = Date.now() - started;
      copilotTelemetry.emit({
        event: "copilot_no_sources",
        sessionId: session.sessionId,
        mode,
        totalMs,
        retrievalMs,
        hits: retrieval.hits.length,
        usedHits: 0,
      });
      return {
        sessionId: session.sessionId,
        question,
        mode,
        answer,
        templates: [],
        workflows: [],
        trust: TrustIndicatorBuilder.build({ answer, grounded: [], confidence: answer.confidence }),
        retrieval: {
          query: retrieval.query.normalizedQuery,
          totalHits: retrieval.hits.length,
          topScore: retrieval.hits[0]?.score ?? 0,
          latencyMs: retrievalMs,
        },
        statistics: CopilotStatisticsBuilder.build({
          retrievalMs,
          llmMs: 0,
          totalMs,
          candidates: retrieval.statistics.totalCandidates,
          hits: retrieval.hits.length,
          usedHits: 0,
          providerId: "none",
          model: "none",
          usage: null,
        }),
        debug: input.debug
          ? this.buildDebug({ prompt: null, retrieval, allowed: [], dropped: droppedChunkIds, reasonings, hallucinationOk: true, hallucinationViolations: [] })
          : null,
        createdAt: new Date().toISOString(),
        domainVersion: COPILOT_DOMAIN_VERSION,
      };
    }

    // 4. Prompt aufbauen
    const context = ContextAssembler.assemble(session, grounded);
    const prompt = PromptBuilder.build({ mode, question, context });

    // 5. LLM (oder synthetische Antwort im Testmodus)
    const llmStart = Date.now();
    const generated = input.forceMock
      ? {
          raw: {
            answered: true,
            reason: null,
            sections: {
              kurzantwort: `MOCK: Zur Frage wurden ${grounded.length} Rechtsgrundlage(n) gefunden.`,
              einordnung: `Die Frage betrifft ${grounded[0]?.hit.citation.law ?? "das Schulrecht"} [${grounded[0]?.refId ?? "R1"}].`,
              empfohleneHandlung: ["Sachverhalt dokumentieren", "Zuständige Stelle informieren"],
              begruendung: grounded.map((g) => `[${g.refId}] regelt den Sachverhalt.`).join(" "),
              hinweise: ["Konkrete Umsetzung landesspezifisch prüfen."],
              unsicherheiten: [],
              typischeFehler: ["Unvollständige Dokumentation."],
              naechsteSchritte: ["Ergebnis mit Schulleitung besprechen."],
            },
            citationRefs: grounded.map((g) => g.refId),
            checklist: [
              { label: "Sachverhalt schriftlich festhalten", role: "Lehrkraft" },
              { label: "Schulleitung informieren", role: "Lehrkraft" },
            ],
            followUps: [],
          },
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
          meta: { providerId: "mock" as const, model: "mock/copilot", latencyMs: 5 },
          latencyMs: 5,
          llmConfidence: 0.7,
        }
      : await AnswerGenerator.generate(prompt, { forceMock: false });
    const llmMs = Date.now() - llmStart;

    // 6. Halluzinationsprüfung
    const rawTextForCheck = JSON.stringify(generated.raw?.sections ?? {});
    const hallu = HallucinationGuard.check(rawTextForCheck, grounded);

    // 7. Konfidenz
    const confidence = ConfidenceCalculator.compute({
      retrieval,
      grounded,
      llmSelfConfidence: generated.llmConfidence,
      answered: Boolean(generated.raw?.answered),
    });

    // 8. Antwort formatieren
    let answer = AnswerFormatter.format({ raw: generated.raw ?? {}, grounded, confidence, mode });

    // Deterministische Follow-Ups ergänzen (falls Filter fehlen)
    answer = { ...answer, followUps: FollowUpGenerator.suggest(input, answer.followUps) };

    // 9. Validierung
    const validation = AnswerValidator.validate(answer, grounded);
    // 10. Safety
    const safety = SafetyGuard.evaluate({ grounded, confidence, hallucinationOk: hallu.ok, answer });
    if (safety.suppressAnswer || !validation.ok) {
      copilotTelemetry.emit({
        event: hallu.ok ? "copilot_failed" : "copilot_hallucination_blocked",
        sessionId: session.sessionId,
        errorCode: hallu.ok ? "answer_invalid" : "hallucination_detected",
        detail: { violations: hallu.violations, validationErrors: validation.errors },
      });
      answer = AnswerFormatter.buildUnanswered(mode,
        hallu.ok
          ? "Die Antwort konnte nicht sicher aus den Rechtsgrundlagen abgeleitet werden."
          : "Sicherheitsprüfung hat die Antwort blockiert (mögliche Halluzination).");
      answer = { ...answer, confidence, followUps: FollowUpGenerator.suggest(input, []) };
    }

    // 11. Session-Verlauf schreiben
    await this.conversations.recordAnswer(
      session.sessionId,
      answer,
      grounded.map((g) => g.hit.citation.chunkId),
    );

    const totalMs = Date.now() - started;
    const stats = CopilotStatisticsBuilder.build({
      retrievalMs,
      llmMs,
      totalMs,
      candidates: retrieval.statistics.totalCandidates,
      hits: retrieval.hits.length,
      usedHits: grounded.length,
      providerId: generated.meta.providerId,
      model: generated.meta.model,
      usage: generated.usage ?? null,
    });

    copilotTelemetry.emit({
      event: "copilot_completed",
      sessionId: session.sessionId,
      mode,
      totalMs,
      retrievalMs,
      llmMs,
      hits: retrieval.hits.length,
      usedHits: grounded.length,
      confidence: confidence.overall,
      tokens: stats.tokens?.totalTokens,
      costUsd: stats.tokens?.estimatedCostUsd,
      providerId: generated.meta.providerId,
    });

    const templates = DocumentTemplateSuggester.suggest({ question, answer, grounded });
    const trust = TrustIndicatorBuilder.build({ answer, grounded, confidence });
    const workflows = await this.recommendWorkflows({
      sessionId: session.sessionId,
      question,
      answer,
      grounded,
      filters: input.filters,
    });

    return {
      sessionId: session.sessionId,
      question,
      mode,
      answer,
      templates,
      workflows,
      trust,
      retrieval: {
        query: retrieval.query.normalizedQuery,
        totalHits: retrieval.hits.length,
        topScore: retrieval.hits[0]?.score ?? 0,
        latencyMs: retrievalMs,
      },
      statistics: stats,
      debug: input.debug
        ? this.buildDebug({
            prompt,
            retrieval,
            allowed: grounded.map((g) => g.hit.chunkId),
            dropped: droppedChunkIds,
            reasonings,
            hallucinationOk: hallu.ok,
            hallucinationViolations: hallu.violations,
          })
        : null,
      createdAt: new Date().toISOString(),
      domainVersion: COPILOT_DOMAIN_VERSION,
    };
  }

  private async recommendWorkflows(args: {
    sessionId: string;
    question: string;
    answer: import("./types").CopilotAnswer;
    grounded: import("./types").GroundedChunk[];
    filters?: import("./types").CopilotFilters;
  }): Promise<CopilotWorkflowRecommendation[]> {
    if (!this.workflowTemplateRepo) return [];
    if (!args.answer.answered) return [];
    try {
      const templates = await this.workflowTemplateRepo.listPublished();
      const recs = WorkflowRecommender.recommend({
        question: args.question,
        answer: args.answer,
        grounded: args.grounded,
        templates,
        filters: args.filters,
      });
      if (recs.length > 0) {
        copilotTelemetry.emit({
          event: "workflow_recommended",
          sessionId: args.sessionId,
          detail: {
            count: recs.length,
            templateIds: recs.map((r) => r.templateId),
            topRelevance: recs[0].relevance,
          },
        });
      }
      return recs;
    } catch (err) {
      copilotTelemetry.emit({
        event: "workflow_recommended",
        sessionId: args.sessionId,
        errorCode: "workflow_recommend_failed",
        detail: { message: err instanceof Error ? err.message : "unknown" },
      });
      return [];
    }
  }

  private buildDebug(args: {
    prompt: { system: string; user: string } | null;
    retrieval: RetrievalResult;
    allowed: string[];
    dropped: string[];
    reasonings: string[];
    hallucinationOk: boolean;
    hallucinationViolations: string[];
  }): CopilotDebugPayload {
    return {
      systemPrompt: args.prompt?.system ?? "(kein Prompt – keine Quellen)",
      userPrompt: args.prompt?.user ?? "(kein Prompt – keine Quellen)",
      retrievalHits: args.retrieval.hits.map((h) => ({
        chunkId: h.chunkId,
        score: h.score,
        confidence: h.confidence,
        citation: h.citation.display,
        excerpt: (h.excerpt ?? h.content ?? "").slice(0, 240),
      })),
      scoreWeights: args.retrieval.hits[0]?.scoreBreakdown.weights ?? null,
      grounding: {
        allowedChunkIds: args.allowed,
        droppedChunkIds: args.dropped,
        reasonings: args.reasonings,
      },
      hallucinationReport: { ok: args.hallucinationOk, violations: args.hallucinationViolations },
    };
  }
}
