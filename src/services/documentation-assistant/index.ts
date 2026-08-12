/** Sprint 4.6H – Barrel-Export des Dokumentationsassistenten. */
export * from "./types";
export {
  buildDocumentationContext,
  type DocumentationContextInput,
  type DocumentationPracticeCaseRef,
} from "./DocumentationContextBuilder";
export { DocumentationEventBus } from "./DocumentationEventBus";
export {
  checkTemplateReadiness,
  overallReadiness,
} from "./DocumentationReadinessChecker";
export {
  computeDocumentationInputHash,
  isDocumentationStale,
  staleDrafts,
  type DocumentationHashParts,
} from "./DocumentationStaleChecker";
export {
  defaultDocumentationTemplateFetcher,
  resolveDocumentationTemplates,
  type DocumentationTemplateData,
  type DocumentationTemplateFetcher,
  type DocumentationTemplateResolution,
  type DocumentationTemplateRow,
} from "./DocumentationTemplateResolver";
export {
  defaultDocumentationAssistantService,
  DocumentationAssistantService,
  DocumentationError,
  toGeneratedDocument,
  type DocumentationContextParts,
  type DocumentationPrepareInput,
  type DocumentationPrepareResult,
  type DocumentationRestore,
} from "./DocumentationAssistantService";
