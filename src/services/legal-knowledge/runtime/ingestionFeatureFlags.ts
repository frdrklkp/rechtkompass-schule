// Feature Flags für Legal Knowledge. Werte werden zur Laufzeit gelesen.

function envBool(key: string, fallback: boolean): boolean {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key];
    if (v === undefined || v === "") return fallback;
    return v === "1" || v === "true" || v === "on";
  } catch {
    return fallback;
  }
}

export const legalKnowledgeFlags = {
  get registryEnabled() { return envBool("VITE_LEGAL_KNOWLEDGE_REGISTRY_ENABLED", true); },
  get ingestionEnabled() { return envBool("VITE_LEGAL_KNOWLEDGE_INGESTION_ENABLED", true); },
  get duplicateDetectionEnabled() { return envBool("VITE_LEGAL_KNOWLEDGE_DUPLICATES_ENABLED", true); },
  get versioningEnabled() { return envBool("VITE_LEGAL_KNOWLEDGE_VERSIONING_ENABLED", true); },
  get urlSourcesEnabled() { return envBool("VITE_LEGAL_KNOWLEDGE_URL_SOURCES_ENABLED", false); },
};
