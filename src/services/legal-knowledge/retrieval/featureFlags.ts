/**
 * Feature-Flags für Hybrid-Retrieval.
 * Werte werden aus import.meta.env oder process.env gelesen.
 */
function envBool(key: string, fallback: boolean): boolean {
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const procEnv = typeof process !== "undefined" ? (process as { env?: Record<string, string | undefined> }).env : undefined;
    const v = viteEnv?.[key] ?? procEnv?.[key];
    if (v === undefined || v === "") return fallback;
    return v === "1" || v === "true" || v === "on";
  } catch { return fallback; }
}

export const legalRetrievalFlags = {
  get enabled() { return envBool("VITE_LEGAL_RETRIEVAL_ENABLED", true); },
  get hybridSearchEnabled() { return envBool("VITE_LEGAL_HYBRID_SEARCH_ENABLED", true); },
  get keywordSearchEnabled() { return envBool("VITE_LEGAL_KEYWORD_SEARCH_ENABLED", true); },
  get citationEnabled() { return envBool("VITE_LEGAL_CITATION_ENABLED", true); },
  get debug() { return envBool("VITE_LEGAL_RETRIEVAL_DEBUG", false); },
};
