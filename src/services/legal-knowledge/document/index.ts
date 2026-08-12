/** Barrel exports for the document structure domain. */
export * from "./types";
export { buildDocumentTree, parserInfo } from "./DocumentTreeBuilder";
export { parseDocument } from "./parser/DocumentParser";
export { detectLineType, REFERENCE_PATTERNS } from "./parser/Patterns";
export { extractReferences } from "./parser/ReferenceParser";
export { tokenize } from "./parser/Tokenizer";
export { buildHierarchy, buildOutline } from "./HierarchyBuilder";
export { computeStatistics } from "./statistics";
export { validateTree } from "./SectionValidator";
export { DocumentNavigator } from "./DocumentNavigator";
export { resolveInternalReferences } from "./DocumentReferenceResolver";
export { DocumentStructureService } from "./DocumentStructureService";
export { SectionRepository } from "./SectionRepository";
export type {
  ChunkBuilder,
  EmbeddingBuilder,
  CitationEngine,
  Retriever,
  KnowledgeGraph,
  CrossReferenceResolver,
  SimilarityEngine,
} from "./extensions";
