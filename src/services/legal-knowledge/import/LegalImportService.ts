/**
 * Sprint 4.5C – Orchestrator des Import Frameworks.
 *
 * Ablauf:
 *   Source (raw input)
 *     → Parser  (LegalImportParser)
 *     → Normalizer (Whitespace, IDs)
 *     → Validator (Pflichtfelder, Duplikate, Versionskonflikt)
 *     → Versioner (Delta-Berechnung gegen Snapshot)
 *     → Repository-Port (applyDelta / saveSnapshot)
 *
 * Der Service kennt weder Supabase noch HTTP – nur Ports und Domänenobjekte.
 */
import type {
  LegalImportInput,
  LegalImportOutcome,
  LegalImportParser,
} from "./types";
import { LegalImportRepositoryPort } from "./LegalImportRepositoryPort";
import { normalizeDocument } from "./LegalImportNormalizer";
import { validateDocument } from "./LegalImportValidator";
import { buildSnapshot, computeDelta } from "./LegalImportVersioner";
import { legalImportTelemetry } from "./telemetry";

export class LegalImportError extends Error {
  constructor(message: string, public readonly code: "no_parser" | "validation_failed" | "parser_error") {
    super(message);
    this.name = "LegalImportError";
  }
}

export interface LegalImportServiceDeps {
  parsers: LegalImportParser[];
  repository: LegalImportRepositoryPort;
  /** Für Tests: fester Zeitstempel. */
  now?: () => number;
}

export class LegalImportService {
  constructor(private readonly deps: LegalImportServiceDeps) {}

  /** Parser explizit anhand der ID auswählen (bevorzugt) oder heuristisch. */
  resolveParser(input: LegalImportInput, parserId?: string): LegalImportParser {
    if (parserId) {
      const p = this.deps.parsers.find((x) => x.id === parserId);
      if (!p) throw new LegalImportError(`Parser nicht gefunden: ${parserId}`, "no_parser");
      return p;
    }
    const match = this.deps.parsers.find((p) => p.canParse(input));
    if (!match) throw new LegalImportError("Kein Parser passt zu dieser Quelle.", "no_parser");
    return match;
  }

  async run(input: LegalImportInput, parserId?: string): Promise<LegalImportOutcome> {
    const parser = this.resolveParser(input, parserId);
    const start = (this.deps.now ?? Date.now)();
    legalImportTelemetry.emit({ event: "legal_import_started", parserId: parser.id });

    let raw;
    try {
      raw = parser.parse(input);
    } catch (err) {
      legalImportTelemetry.emit({
        event: "legal_import_failed",
        parserId: parser.id,
        detail: { message: err instanceof Error ? err.message : "unbekannt" },
      });
      throw new LegalImportError(
        err instanceof Error ? err.message : "Parser-Fehler",
        "parser_error",
      );
    }

    const doc = normalizeDocument(raw);
    const previous = await this.deps.repository.loadSnapshot(doc.source.key);
    const validation = validateDocument(doc, previous);

    if (!validation.ok) {
      legalImportTelemetry.emit({
        event: "legal_import_validation_failed",
        parserId: parser.id,
        sourceKey: doc.source.key,
        versionLabel: doc.version.label,
        detail: { errorCount: validation.errorCount, warningCount: validation.warningCount },
      });
      throw new LegalImportError(
        `Import abgebrochen: ${validation.errorCount} Fehler.`,
        "validation_failed",
      );
    }

    const delta = computeDelta(doc, previous);
    const status: LegalImportOutcome["status"] =
      delta.added + delta.updated + delta.removed === 0 ? "no_change" : "completed";

    await this.deps.repository.applyDelta({ document: doc, delta, previous });
    await this.deps.repository.saveSnapshot(buildSnapshot(doc));

    legalImportTelemetry.emit({
      event: "legal_import_delta",
      parserId: parser.id,
      sourceKey: doc.source.key,
      versionLabel: doc.version.label,
      detail: {
        added: delta.added,
        updated: delta.updated,
        removed: delta.removed,
        unchanged: delta.unchanged,
      },
    });
    legalImportTelemetry.emit({
      event: "legal_import_finished",
      parserId: parser.id,
      sourceKey: doc.source.key,
      versionLabel: doc.version.label,
      durationMs: (this.deps.now ?? Date.now)() - start,
      detail: { status },
    });

    return { sourceKey: doc.source.key, versionLabel: doc.version.label, status, delta, validation, document: doc };
  }
}
