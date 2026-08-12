// Orchestriert Loader → Normalizer → Extractor → Validator → Duplicate.
// Keine Persistenz von Rechtsquellen; nur optional ein Job-Log.

import { LegalSourceRepository } from "../repositories/LegalSourceRepository";
import { LegalIngestionRepository } from "../repositories/LegalIngestionRepository";
import { LegalIngestionFailedError } from "../runtime/ingestionErrors";
import { bumpTelemetry } from "../runtime/ingestionTelemetry";
import { computeChecksum, computeContentStats, normalizeLegalContent } from "./LegalContentNormalizer";
import { extractLegalMetadata } from "./LegalMetadataExtractor";
import { validateIngestion } from "./LegalIngestionValidator";
import { detectDuplicates } from "./LegalDuplicateDetector";
import { loadLegalDocument } from "./LegalDocumentLoader";
import type { LegalIngestionRequest, LegalIngestionResult } from "./LegalIngestionTypes";

export const LegalIngestionService = {
  async run(req: LegalIngestionRequest, persistJob = false): Promise<LegalIngestionResult> {
    bumpTelemetry(`ingestion.${req.inputType}.start`);
    try {
      const loaded = await loadLegalDocument({
        inputType: req.inputType,
        rawInput: req.rawInput,
        inputLocation: req.inputLocation ?? null,
      });
      const normalized = normalizeLegalContent(loaded.rawInput);
      const stats = computeContentStats(normalized);
      const metadata = extractLegalMetadata(normalized);
      const validation = validateIngestion(normalized, stats, metadata);
      const checksum = normalized ? computeChecksum(normalized) : "";

      // Duplikate gegen Bestand prüfen (Registry-Read).
      const candidates = await LegalSourceRepository.list().catch(() => []);
      const duplicates = detectDuplicates(
        {
          title: metadata.detectedTitle,
          officialUrl: req.inputLocation,
          checksum,
          versionLabel: metadata.detectedVersionLabel,
        },
        candidates,
        req.intendedSourceId ?? null,
      );

      const status = validation.readiness === "blocked"
        ? "failed"
        : validation.readiness === "needs_input"
          ? "ready_for_review"
          : "completed";

      let jobId: string | null = null;
      if (persistJob) {
        const job = await LegalIngestionRepository.create(req, {
          status,
          normalized_output: normalized,
          extracted_metadata: metadata,
          content_stats: stats,
          warnings: validation.issues,
          checksum: checksum || null,
          error_code: validation.errorCount > 0 ? "validation" : null,
          error_message: validation.errorCount > 0
            ? validation.issues.find((i) => i.severity === "error")?.message ?? null
            : null,
        });
        jobId = job?.id ?? null;
      }

      bumpTelemetry(`ingestion.${req.inputType}.${status}`);
      return {
        jobId,
        status: status as LegalIngestionResult["status"],
        normalizedContent: normalized,
        originalContent: loaded.rawInput,
        checksum,
        metadata,
        contentStats: stats,
        validation,
        duplicates,
      };
    } catch (err) {
      bumpTelemetry(`ingestion.${req.inputType}.failed`);
      if (err instanceof Error) {
        throw new LegalIngestionFailedError(err.message);
      }
      throw new LegalIngestionFailedError("Unbekannter Fehler beim Import.");
    }
  },
};
