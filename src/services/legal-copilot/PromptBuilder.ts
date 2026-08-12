import { PROMPT_TEMPLATES_VERSION, SYSTEM_PROMPT, buildUserPrompt } from "./PromptTemplates";
import { ExplanationModeSpec } from "./ExplanationMode";
import type { AssembledContext } from "./ContextAssembler";
import type { ExplanationMode } from "./types";

export interface BuiltPrompt {
  version: string;
  system: string;
  user: string;
  mode: ExplanationMode;
}

export const PromptBuilder = {
  build(params: {
    mode: ExplanationMode;
    question: string;
    context: AssembledContext;
  }): BuiltPrompt {
    return {
      version: PROMPT_TEMPLATES_VERSION,
      mode: params.mode,
      system: SYSTEM_PROMPT,
      user: buildUserPrompt({
        mode: ExplanationModeSpec.label(params.mode),
        modeInstruction: ExplanationModeSpec.instruction(params.mode),
        question: params.question,
        grounded: params.context.groundedForPrompt,
        history: params.context.historyForPrompt,
      }),
    };
  },
  version(): string { return PROMPT_TEMPLATES_VERSION; },
};
