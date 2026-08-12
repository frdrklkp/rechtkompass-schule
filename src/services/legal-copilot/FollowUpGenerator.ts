/**
 * Deterministischer Follow-Up Generator.
 * Ergänzt LLM-Rückfragen um erwartete Kontextfragen, falls Filter fehlen.
 */
import type { CopilotAskInput, CopilotFollowUp } from "./types";

export const FollowUpGenerator = {
  suggest(input: CopilotAskInput, existing: CopilotFollowUp[]): CopilotFollowUp[] {
    const have = new Set(existing.map((f) => f.code));
    const out: CopilotFollowUp[] = [...existing];
    const push = (f: CopilotFollowUp) => { if (!have.has(f.code)) out.push(f); };

    if (!input.filters?.bundesland) push({ code: "bundesland", question: "In welchem Bundesland befindet sich die Schule?" });
    if (!input.filters?.schulform) push({ code: "schulform", question: "Um welche Schulform handelt es sich (z. B. Grundschule, Gymnasium, Berufsschule)?" });
    if (!input.filters?.klassenstufe) push({ code: "klassenstufe", question: "Welche Klassenstufe ist betroffen?" });

    return out.slice(0, 5);
  },
};
