import { createFileRoute } from "@tanstack/react-router";
import { withWorkflowApi } from "@/lib/workflowApi.server";
import { buildDocGenBundle, loadRuntimeForSession } from "@/lib/documentGeneration.server";
import { WorkflowError } from "@/services/legal-workflows";

/**
 * GET  /api/workflow-sessions/:id/documents          → { documents, templates }
 * POST /api/workflow-sessions/:id/documents { templateSlug, school? } → { document }
 */
export const Route = createFileRoute("/api/workflow-sessions/$id/documents")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withWorkflowApi(request, "GET /api/workflow-sessions/:id/documents", async (ctx) => {
          // Auth über withWorkflowApi hat userId; wir brauchen supabase-Client → aus ctx.templates
          const supabase = (ctx.templates as unknown as { db: unknown }).db as never;
          const bundle = buildDocGenBundle(supabase);
          const { runtime, session } = await loadRuntimeForSession({
            sessionId: params.id,
            userId: ctx.userId,
            sessions: ctx.sessions,
            templateRepo: ctx.templates,
          });
          const [documents, templates] = await Promise.all([
            bundle.documents.listBySession(session.id),
            bundle.templates.listForRuntime(runtime),
          ]);
          return { documents, templates };
        }),

      POST: async ({ request, params }) =>
        withWorkflowApi(request, "POST /api/workflow-sessions/:id/documents", async (ctx) => {
          const body = (await safeJson(request)) as {
            templateSlug?: string;
            school?: string | null;
            actorDisplayName?: string | null;
          };
          if (!body.templateSlug) throw new WorkflowError("invalid_input", "templateSlug fehlt.");
          const supabase = (ctx.templates as unknown as { db: unknown }).db as never;
          const bundle = buildDocGenBundle(supabase);
          const { session, runtime } = await loadRuntimeForSession({
            sessionId: params.id,
            userId: ctx.userId,
            sessions: ctx.sessions,
            templateRepo: ctx.templates,
          });
          const templates = await bundle.templates.listForRuntime(runtime);
          const template = templates.find((t) => t.slug === body.templateSlug);
          if (!template) throw new WorkflowError("not_found", `Vorlage ${body.templateSlug} nicht gefunden.`);
          const document = await bundle.service.generate({
            session, runtime, template,
            actor: ctx.userId,
            actorDisplayName: body.actorDisplayName ?? null,
            school: body.school ?? null,
          });
          return { document };
        }),
    },
  },
});

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown>; } catch { return {}; }
}
