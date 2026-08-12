/**
 * Sprint 4.3B – gemeinsame Handler-Utils der Workflow-API.
 * Serialisiert WorkflowError konsistent und kapselt Auth + Engine-Konstruktion.
 */
import { authenticateWorkflowRequest, WorkflowApiAuthError } from "@/lib/workflowApiAuth.server";
import {
  SupabaseWorkflowTemplateRepository,
  versionLockedTemplateRepo,
} from "@/services/legal-workflows/SupabaseWorkflowTemplateRepository";
import { SupabaseWorkflowRepository } from "@/services/legal-workflows/SupabaseWorkflowRepository";
import { WorkflowEngine, WorkflowError, workflowTelemetry } from "@/services/legal-workflows";
import type { WorkflowRepositoryPort } from "@/services/legal-workflows";

export interface WorkflowApiContext {
  userId: string;
  templates: SupabaseWorkflowTemplateRepository;
  sessions: WorkflowRepositoryPort;
}

export async function withWorkflowApi<T>(
  request: Request,
  endpoint: string,
  fn: (ctx: WorkflowApiContext) => Promise<T>,
): Promise<Response> {
  const t0 = Date.now();
  try {
    const { supabase, userId } = await authenticateWorkflowRequest(request);
    const templates = new SupabaseWorkflowTemplateRepository(supabase);
    const sessions = new SupabaseWorkflowRepository(supabase);
    const result = await fn({ userId, templates, sessions });
    workflowTelemetry.emit({ event: "workflow_api_completed", durationMs: Date.now() - t0, detail: { endpoint } });
    return Response.json(result ?? { ok: true });
  } catch (err) {
    return handleError(err, endpoint, Date.now() - t0);
  }
}

/** Wie withWorkflowApi, aber der Handler liefert eine fertige Response (z. B. Binär-Export). */
export async function withWorkflowApiRaw(
  request: Request,
  endpoint: string,
  fn: (ctx: WorkflowApiContext) => Promise<Response>,
): Promise<Response> {
  const t0 = Date.now();
  try {
    const { supabase, userId } = await authenticateWorkflowRequest(request);
    const templates = new SupabaseWorkflowTemplateRepository(supabase);
    const sessions = new SupabaseWorkflowRepository(supabase);
    const result = await fn({ userId, templates, sessions });
    workflowTelemetry.emit({ event: "workflow_api_completed", durationMs: Date.now() - t0, detail: { endpoint } });
    return result;
  } catch (err) {
    return handleError(err, endpoint, Date.now() - t0);
  }
}

/** Baut eine Engine mit versionsgepinntem Template-Repo für eine bestehende Session. */
export async function engineForSession(
  ctx: WorkflowApiContext,
  sessionId: string,
): Promise<{ engine: WorkflowEngine }> {
  const session = await ctx.sessions.getSession(sessionId);
  if (!session) throw new WorkflowError("not_found", `Session ${sessionId} nicht gefunden.`);
  if (session.userId !== ctx.userId) throw new WorkflowError("forbidden", "Kein Zugriff auf diese Session.");
  const templates = session.templateVersionId
    ? versionLockedTemplateRepo(ctx.templates, {
        templateId: session.templateId,
        versionId: session.templateVersionId,
      })
    : ctx.templates;
  const engine = new WorkflowEngine({ templates, sessions: ctx.sessions });
  return { engine };
}

function handleError(err: unknown, endpoint: string, durationMs: number): Response {
  workflowTelemetry.emit({
    event: "workflow_api_failed",
    durationMs,
    detail: { endpoint, message: (err as Error)?.message },
  });
  if (err instanceof WorkflowApiAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof WorkflowError) {
    const status = statusForCode(err.code);
    return Response.json({ error: err.message, code: err.code }, { status });
  }
  const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
  return Response.json({ error: msg }, { status: 500 });
}

function statusForCode(code: string): number {
  switch (code) {
    case "not_found": return 404;
    case "forbidden": return 403;
    case "invalid_input":
    case "validation_failed": return 400;
    case "invalid_state":
    case "invalid_transition":
    case "step_blocked": return 409;
    case "disabled": return 503;
    default: return 500;
  }
}
