import type { CopilotAnswer, CopilotConfidence, GroundedChunk } from "./types";

export interface SafetyDecision {
  suppressAnswer: boolean;
  addLowConfidenceWarning: boolean;
  reasons: string[];
}

export const SafetyGuard = {
  evaluate(params: {
    grounded: GroundedChunk[];
    confidence: CopilotConfidence;
    hallucinationOk: boolean;
    answer: CopilotAnswer;
  }): SafetyDecision {
    const reasons: string[] = [];
    let suppress = false;

    if (params.grounded.length === 0) {
      suppress = true;
      reasons.push("no_sources");
    }
    if (!params.hallucinationOk) {
      suppress = true;
      reasons.push("hallucination_detected");
    }
    if (!params.answer.answered) {
      reasons.push("model_declined");
    }
    const low = params.confidence.level === "low";
    return {
      suppressAnswer: suppress,
      addLowConfidenceWarning: low,
      reasons,
    };
  },
};
