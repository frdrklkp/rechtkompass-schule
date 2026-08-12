/**
 * Feature-Flags für die Embedding-Plattform.
 * Werte werden aus import.meta.env oder process.env gelesen (Server & Client).
 */

function envBool(key: string, fallback: boolean): boolean {
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const procEnv = typeof process !== "undefined" ? (process as { env?: Record<string, string | undefined> }).env : undefined;
    const v = viteEnv?.[key] ?? procEnv?.[key];
    if (v === undefined || v === "") return fallback;
    return v === "1" || v === "true" || v === "on";
  } catch {
    return fallback;
  }
}

export const legalEmbeddingFlags = {
  get enabled() { return envBool("VITE_LEGAL_EMBEDDINGS_ENABLED", true); },
  get jobsEnabled() { return envBool("VITE_LEGAL_EMBEDDING_JOBS_ENABLED", true); },
  get persistenceEnabled() { return envBool("VITE_LEGAL_EMBEDDING_PERSISTENCE_ENABLED", true); },
  get adminEnabled() { return envBool("VITE_LEGAL_EMBEDDING_ADMIN_ENABLED", true); },
  /** Externer Provider (Lovable AI Gateway) – standardmäßig AUS für Sicherheit. */
  get externalProviderEnabled() { return envBool("VITE_LEGAL_EMBEDDING_EXTERNAL_PROVIDER_ENABLED", false); },
  get vectorIndexEnabled() { return envBool("VITE_LEGAL_EMBEDDING_VECTOR_INDEX_ENABLED", false); },
  get autoRunEnabled() { return envBool("VITE_LEGAL_EMBEDDING_AUTO_RUN_ENABLED", false); },
};
