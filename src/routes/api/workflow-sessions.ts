import { createFileRoute } from "@tanstack/react-router";
import { withWorkflowApi } from "@/lib/workflowApi.server";
import { WorkflowEngine, WorkflowError } from "@/services/legal-workflows";

export const Route = createFileRoute("/api/workflow-sessions")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withWorkflowApi(request, "GET /api/workflow-sessions", async (ctx) => {
          const sessions = await ctx.sessions.listSessionsForUser(ctx.userId);
          return { sessions };
        }),

      POST: async ({ request }) =>
        withWorkflowApi(request, "POST /api/workflow-sessions", async (ctx) => {
          let body: { templateId?: string; templateSlug?: string; context?: Record<string, unknown> };
          try { body = (await request.json()) as typeof body; }
          catch { throw new WorkflowError("invalid_input", "Ungültiger JSON-Body."); }
          if (!body.templateId && !body.templateSlug) {
            throw new WorkflowError("invalid_input", "templateId oder templateSlug erforderlich.");
          }
          const engine = new WorkflowEngine({ templates: ctx.templates, sessions: ctx.sessions });
          const { session } = await engine.startSession({
            templateId: body.templateId,
            templateSlug: body.templateSlug,
            userId: ctx.userId,
            context: body.context ?? {},
          });
          return { session };
        }),
    },
  },
});
