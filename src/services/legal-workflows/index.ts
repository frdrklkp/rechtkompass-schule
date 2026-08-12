/** Barrel-Export der Workflow-Plattform. */
export * from "./types";
export * from "./errors";
export { workflowFlags } from "./featureFlags";
export { workflowTelemetry } from "./telemetry";
export type { WorkflowTelemetryEvent, WorkflowTelemetryPayload } from "./telemetry";
export { WorkflowStateMachine } from "./WorkflowStateMachine";
export { WorkflowValidator } from "./WorkflowValidator";
export { WorkflowRuleEngine } from "./WorkflowRuleEngine";
export type { WorkflowRuleAction } from "./WorkflowRuleEngine";
export { WorkflowNavigator } from "./WorkflowNavigator";
export { WorkflowProgressCalculator } from "./WorkflowProgressCalculator";
export { WorkflowRecommendationService } from "./WorkflowRecommendationService";
export { WorkflowStatistics } from "./WorkflowStatistics";
export { WorkflowBuilder, PhaseBuilder } from "./WorkflowBuilder";
export { InMemoryWorkflowRepository } from "./WorkflowRepository";
export type { WorkflowRepositoryPort } from "./WorkflowRepository";
export { InMemoryTemplateRepository } from "./WorkflowTemplateRepository";
export type { WorkflowTemplateRepositoryPort } from "./WorkflowTemplateRepository";
export {
  SupabaseWorkflowTemplateRepository,
  versionLockedTemplateRepo,
} from "./SupabaseWorkflowTemplateRepository";
export { SupabaseWorkflowRepository } from "./SupabaseWorkflowRepository";
export { WorkflowTemplateService } from "./WorkflowTemplateService";
export { WorkflowContextBuilder } from "./WorkflowContextBuilder";
export type { WorkflowRuntimeContext } from "./WorkflowContextBuilder";
export { WorkflowMapper } from "./WorkflowMapper";
export type { FlatTemplateRows } from "./WorkflowMapper";
export { WorkflowExportService } from "./WorkflowExportService";
export { WorkflowEngine } from "./WorkflowEngine";
export type { WorkflowEngineDeps } from "./WorkflowEngine";
export { WorkflowRunner } from "./WorkflowRunner";
export { buildPilotWorkflow } from "./pilotWorkflow";
