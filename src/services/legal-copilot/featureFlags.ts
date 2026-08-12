/** Feature Flags des Grounded Legal Copilot. */
function envBool(key: string, fallback: boolean): boolean {
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const procEnv = typeof process !== "undefined" ? (process as { env?: Record<string, string | undefined> }).env : undefined;
    const v = viteEnv?.[key] ?? procEnv?.[key];
    if (v === undefined || v === "") return fallback;
    return v === "1" || v === "true" || v === "on";
  } catch { return fallback; }
}

function envStr(key: string, fallback: string): string {
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const procEnv = typeof process !== "undefined" ? (process as { env?: Record<string, string | undefined> }).env : undefined;
    const v = viteEnv?.[key] ?? procEnv?.[key];
    return v && v.length > 0 ? v : fallback;
  } catch { return fallback; }
}

export const legalCopilotFlags = {
  get legalCopilotEnabled() { return envBool("VITE_LEGAL_COPILOT_ENABLED", true); },
  get legalGroundingEnabled() { return envBool("VITE_LEGAL_GROUNDING_ENABLED", true); },
  get legalConversationEnabled() { return envBool("VITE_LEGAL_CONVERSATION_ENABLED", true); },
  get legalExplanationMode() { return envStr("VITE_LEGAL_EXPLANATION_MODE", "standard"); },
  get legalCopilotDebug() { return envBool("VITE_LEGAL_COPILOT_DEBUG", false); },
};
