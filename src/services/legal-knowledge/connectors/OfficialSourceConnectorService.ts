/**
 * Sprint 4.5G – Official Source Connector Service.
 *
 * Orchestriert ausschließlich die neue Schicht:
 *   Connector → Downloader → HTML Extractor → (bestehendes Framework)
 * Parser, Normalizer, Validator, Delta und Repository stammen unverändert
 * aus dem Import-Framework von Sprint 4.5C.
 */
import {
  computeDelta,
  normalizeDocument,
  validateDocument,
  legalImportTelemetry,
} from "../import";
import type {
  LegalImportDelta,
  LegalImportInput,
  LegalImportParser,
  LegalImportValidationResult,
  LegalNode,
  NormalizedLegalDocument,
} from "../import";
import type { LegalImportRepositoryPort } from "../import";
import { Downloader } from "./Downloader";
import { crawlOfficialSource } from "./OfficialSourceCrawler";
import { getConnector, getOfficialSource, resolveParserIdForUrl } from "./registry";
import { validateOfficialUrl } from "./whitelist";
import type { CrawlProgress, CrawlResult, ExtractedDocument, OfficialSourceDefinition } from "./types";

export interface ConnectorPreviewStats {
  documents: number;
  paragraphs: number;
  attachments: number;
  references: number;
  duplicates: number;
  errors: number;
  durationMs: number;
  truncated: boolean;
}

export interface ConnectorPreview {
  definition: OfficialSourceDefinition;
  startUrl: string;
  parser: LegalImportParser;
  document: NormalizedLegalDocument;
  validation: LegalImportValidationResult;
  delta: LegalImportDelta;
  crawl: CrawlResult;
  stats: ConnectorPreviewStats;
  versionConflict: boolean;
}

export class OfficialSourceConnectorError extends Error {
  constructor(message: string, public readonly code:
    | "unknown_source"
    | "url_rejected"
    | "no_documents"
    | "no_parser"
    | "parser_error") {
    super(message);
    this.name = "OfficialSourceConnectorError";
  }
}

export interface ConnectorServiceDeps {
  parsers: LegalImportParser[];
  repository: LegalImportRepositoryPort;
  downloader?: Downloader;
}

function countNodes(node: LegalNode, predicate: (n: LegalNode) => boolean): number {
  let n = predicate(node) ? 1 : 0;
  for (const c of node.children) n += countNodes(c, predicate);
  return n;
}

function countReferences(node: LegalNode): number {
  const refs = (node.metadata?.references as unknown[] | undefined)?.length ?? 0;
  return node.children.reduce((sum, c) => sum + countReferences(c), refs);
}

/** Fügt alle geladenen Dokumente zu einem Rohtext für die Parser zusammen. */
export function mergeDocuments(documents: ExtractedDocument[]): string {
  return documents
    .map((d) => (d.title ? `${d.title}\n\n${d.text}` : d.text))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class OfficialSourceConnectorService {
  constructor(private readonly deps: ConnectorServiceDeps) {}

  resolveParser(parserId: string, input: LegalImportInput): LegalImportParser {
    const explicit = this.deps.parsers.find((p) => p.id === parserId);
    if (explicit) return explicit;
    const auto = this.deps.parsers.find((p) => p.canParse(input));
    if (!auto) throw new OfficialSourceConnectorError("Kein Parser passt zu dieser Quelle.", "no_parser");
    return auto;
  }

  async preview(opts: {
    sourceId: string;
    url?: string;
    maxPages?: number;
    maxDepth?: number;
    onProgress?: (p: CrawlProgress) => void;
    /** Optional: bereits geladene Dokumente (z. B. serverseitig gecrawlt). */
    crawl?: CrawlResult;
  }): Promise<ConnectorPreview> {
    const definition = getOfficialSource(opts.sourceId);
    if (!definition || definition.planned) {
      throw new OfficialSourceConnectorError(
        `Unbekannte oder nicht freigeschaltete Quelle: ${opts.sourceId}`,
        "unknown_source",
      );
    }
    const startUrl = (opts.url ?? "").trim() || definition.defaultUrl;
    const check = validateOfficialUrl(startUrl, definition.hosts);
    if (!check.ok) throw new OfficialSourceConnectorError(check.message, "url_rejected");

    legalImportTelemetry.emit({
      event: "legal_import_started",
      sourceKey: definition.id,
      detail: { connector: definition.id, url: startUrl, mode: "official_source" },
    });

    const crawl =
      opts.crawl ??
      (await crawlOfficialSource({
        definition,
        startUrl,
        downloader: this.deps.downloader ?? new Downloader({ allowedHosts: definition.hosts }),
        maxPages: opts.maxPages,
        maxDepth: opts.maxDepth,
        onProgress: opts.onProgress,
      }));

    if (crawl.documents.length === 0) {
      throw new OfficialSourceConnectorError(
        "Keine verwertbaren Dokumente gefunden. Bitte Start-URL prüfen.",
        "no_documents",
      );
    }

    const connector = getConnector(definition.id);
    const parserId = connector
      ? connector.resolveParserId(startUrl)
      : resolveParserIdForUrl(startUrl, definition.parserId);

    const raw = mergeDocuments(crawl.documents);
    const input: LegalImportInput = {
      raw,
      hint: {
        officialUrl: startUrl,
        detectedTitle: crawl.documents[0]?.title ?? null,
        detectedVersion: crawl.documents.find((d) => d.versionHint)?.versionHint ?? null,
      },
    };

    const parser = this.resolveParser(parserId, input);
    opts.onProgress?.({
      phase: "parsing", found: crawl.visited.length, downloaded: crawl.documents.length,
      processed: crawl.documents.length, validated: 0, deltaReady: false, ratio: 1,
    });

    let parsed: NormalizedLegalDocument;
    try {
      parsed = parser.parse(input);
    } catch (err) {
      legalImportTelemetry.emit({
        event: "legal_import_failed",
        parserId: parser.id,
        sourceKey: definition.id,
        detail: { message: (err as Error)?.message ?? "Parser-Fehler", connector: definition.id },
      });
      throw new OfficialSourceConnectorError((err as Error)?.message ?? "Parser-Fehler", "parser_error");
    }

    const document = normalizeDocument(parsed);
    const previous = await this.deps.repository.loadSnapshot(document.source.key);

    opts.onProgress?.({
      phase: "validating", found: crawl.visited.length, downloaded: crawl.documents.length,
      processed: crawl.documents.length, validated: 0, deltaReady: false, ratio: 1,
    });
    const validation = validateDocument(document, previous);

    opts.onProgress?.({
      phase: "delta", found: crawl.visited.length, downloaded: crawl.documents.length,
      processed: crawl.documents.length, validated: 1, deltaReady: false, ratio: 1,
    });
    const delta = computeDelta(document, previous);

    const stats: ConnectorPreviewStats = {
      documents: crawl.documents.length,
      paragraphs: countNodes(document.root, (n) => n.kind === "paragraph" || n.kind === "article"),
      attachments:
        crawl.documents.filter((d) => d.attachment).length +
        countNodes(document.root, (n) => (n.metadata?.role as string | undefined) === "anlage"),
      references: countReferences(document.root),
      duplicates: crawl.duplicates,
      errors: crawl.errors.length,
      durationMs: crawl.durationMs,
      truncated: crawl.truncated,
    };

    const versionConflict = validation.issues.some(
      (i) => i.code === "version_conflict" && i.severity === "error",
    );

    legalImportTelemetry.emit({
      event: "legal_import_delta",
      parserId: parser.id,
      sourceKey: document.source.key,
      versionLabel: document.version.label,
      detail: { ...stats, connector: definition.id, added: delta.added, updated: delta.updated, removed: delta.removed },
    });

    opts.onProgress?.({
      phase: "ready", found: crawl.visited.length, downloaded: crawl.documents.length,
      processed: crawl.documents.length, validated: 1, deltaReady: true, ratio: 1,
    });

    return { definition, startUrl, parser, document, validation, delta, crawl, stats, versionConflict };
  }
}
