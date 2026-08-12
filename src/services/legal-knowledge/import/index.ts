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
export {
  bassParser,
  apoBkParser,
  verwaltungsvorschriftParser,
  erlassParser,
  faqParser,
  courtDecisionParser,
  preparedParsers,
} from "./parsers/stubs";
