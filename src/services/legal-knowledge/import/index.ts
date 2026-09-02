/** Sprint 4.5C – Barrel-Export des Legal Import Frameworks. */
export * from "./types";
export * from "./hashing";
export { normalizeDocument } from "./LegalImportNormalizer";
export { validateDocument } from "./LegalImportValidator";
export { buildSnapshot, computeDelta } from "./LegalImportVersioner";
export type { LegalImportRepositoryPort } from "./LegalImportRepositoryPort";
export { InMemoryLegalImportRepository } from "./LegalImportRepositoryPort";
export { LegalImportService, LegalImportError } from "./LegalImportService";
export type { LegalImportServiceDeps } from "./LegalImportService";
export { legalImportTelemetry } from "./telemetry";
export type { LegalImportTelemetryEvent, LegalImportTelemetryPayload } from "./telemetry";
export { schulgesetzNrwParser } from "./parsers/schulgesetzNrwParser";
export { bassNrwParser } from "./parsers/bassNrwParser";
export { apoBkNrwParser } from "./parsers/apoBkNrwParser";
export { verwaltungsvorschriftNrwParser } from "./parsers/verwaltungsvorschriftNrwParser";
export { vwvfgNrwParser } from "./parsers/vwvfgNrwParser";
export { grundgesetzParser } from "./parsers/grundgesetzParser";
export { dsgvoParser } from "./parsers/dsgvoParser";
export { lbgNrwParser } from "./parsers/lbgNrwParser";
export { ldgNrwParser } from "./parsers/ldgNrwParser";
export { beamtstgParser } from "./parsers/beamtstgParser";
export { dsgNrwParser } from "./parsers/dsgNrwParser";
export { kunsturhgParser } from "./parsers/kunsturhgParser";
export { sgb8Parser } from "./parsers/sgb8Parser";
export { bbigParser } from "./parsers/bbigParser";
export { jarbschgParser } from "./parsers/jarbschgParser";
export { makeGesetzeImInternetParser, bgbParser, stgbParser, sgb7Parser, juschgParser } from "./parsers/gesetzeImInternetParserFactory";
export { aiActParser } from "./parsers/aiActParser";
export {
  bassParser,
  apoBkParser,
  verwaltungsvorschriftParser,
  erlassParser,
  faqParser,
  courtDecisionParser,
  preparedParsers,
} from "./parsers/stubs";
