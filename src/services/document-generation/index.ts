/** Sprint 4.5A – Barrel-Export der Document-Generation-Domain. */
export * from "./types";
export { PlaceholderResolver } from "./PlaceholderResolver";
export { buildDocumentContext } from "./ContextBuilder";
export { DocumentGenerationService } from "./DocumentGenerationService";
export type { AiFieldResolver, DocumentGenerationDeps } from "./DocumentGenerationService";
export type {
  WorkflowSessionDocumentRepositoryPort,
  CreateGeneratedDocumentInput,
  UpdateGeneratedDocumentInput,
} from "./WorkflowSessionDocumentRepository";
export { InMemoryWorkflowSessionDocumentRepository } from "./WorkflowSessionDocumentRepository";
export { SupabaseWorkflowSessionDocumentRepository } from "./SupabaseWorkflowSessionDocumentRepository";
export type { DocumentTemplateRepositoryPort } from "./DocumentTemplateRepository";
export {
  InMemoryDocumentTemplateRepository,
  SupabaseDocumentTemplateRepository,
} from "./DocumentTemplateRepository";
export { docGenTelemetry } from "./telemetry";
export type { DocGenTelemetryEvent, DocGenTelemetryPayload } from "./telemetry";
