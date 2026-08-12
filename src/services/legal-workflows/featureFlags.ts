/** Feature Flags der Workflow-Plattform. */
function envBool(key: string, fallback: boolean): boolean {
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const procEnv = typeof process !== "undefined" ? (process as { env?: Record<string, string | undefined> }).env : undefined;
    const v = viteEnv?.[key] ?? procEnv?.[key];
    if (v === undefined || v === "") return fallback;
    return v === "1" || v === "true" || v === "on";
  } catch { return fallback; }
}

export const workflowFlags = {
  get workflowEngineEnabled()          { return envBool("VITE_WORKFLOW_ENGINE_ENABLED", true); },
  get workflowDesignerEnabled()        { return envBool("VITE_WORKFLOW_DESIGNER_ENABLED", false); },
  get workflowRecommendationsEnabled() { return envBool("VITE_WORKFLOW_RECOMMENDATIONS_ENABLED", true); },
  get workflowExecutionEnabled()       { return envBool("VITE_WORKFLOW_EXECUTION_ENABLED", true); },
  get workflowDebugEnabled()           { return envBool("VITE_WORKFLOW_DEBUG_ENABLED", false); },
};
