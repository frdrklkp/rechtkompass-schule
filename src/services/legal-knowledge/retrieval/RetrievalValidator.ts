/**
 * Prüft Retrieval-Ergebnisse auf Konsistenz.
 */
import type {
  RetrievalHit,
  RetrievalValidationIssue,
  RetrievalValidationReport,
} from "./types";

export const RetrievalValidator = {
  validate(hits: RetrievalHit[]): RetrievalValidationReport {
    const errors: RetrievalValidationIssue[] = [];
    const warnings: RetrievalValidationIssue[] = [];
    const info: RetrievalValidationIssue[] = [];

    const seen = new Set<string>();
    for (const hit of hits) {
      if (seen.has(hit.chunkId)) {
        errors.push({ level: "error", code: "duplicate_hit", message: `Doppelter Treffer ${hit.chunkId}`, chunkId: hit.chunkId });
      }
      seen.add(hit.chunkId);

      if (!hit.citation || !hit.citation.display) {
        errors.push({ level: "error", code: "missing_citation", message: "Fehlende Fundstelle", chunkId: hit.chunkId });
      }
      if (!hit.citation.sourceId) {
        warnings.push({ level: "warning", code: "missing_source", message: "Quelle fehlt", chunkId: hit.chunkId });
      }
      if (hit.score < 0 || hit.score > 1 || Number.isNaN(hit.score)) {
        errors.push({ level: "error", code: "invalid_score", message: `Score ungültig: ${hit.score}`, chunkId: hit.chunkId });
      }
      const md = hit.metadata ?? {};
      const life = (md.lifecycle ?? "").toString().toLowerCase();
      if (life === "rejected" || life === "archived") {
        errors.push({ level: "error", code: "invalid_source", message: `Ungültige Quelle: Lifecycle=${life}`, chunkId: hit.chunkId });
      }
      const rev = (md.reviewStatus ?? "").toString().toLowerCase();
      if (rev === "" || rev === "unverified") {
        info.push({ level: "info", code: "unverified_source", message: "Quelle noch nicht geprüft", chunkId: hit.chunkId });
      }
    }

    return { errors, warnings, info, ok: errors.length === 0 };
  },
};
