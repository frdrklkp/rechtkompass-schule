import { createFileRoute } from "@tanstack/react-router";
import { engineForSession, withWorkflowApi } from "@/lib/workflowApi.server";
import { WorkflowError } from "@/services/legal-workflows";

export const Route = createFileRoute("/api/workflow-sessions/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withWorkflowApi(request, "GET /api/workflow-sessions/:id", async (ctx) => {
          const { engine } = await engineForSession(ctx, params.id);
          const session = await engine.loadSession(params.id);
          const template = await ctx.templates.getById(session.templateId);
          if (!template) throw new WorkflowError("not_found", "Zugehörige Vorlage nicht gefunden.");
          const progress = engine.progress(params.id);
          const recommendations = engine.recommendations(params.id);
          return { session, template, progress: await progress, recommendations: await recommendations };
        }),

      PATCH: async ({ request, params }) =>
        withWorkflowApi(request, "PATCH /api/workflow-sessions/:id", async (ctx) => {
          let body: { context?: Record<string, unknown> };
          try { body = (await request.json()) as typeof body; }
          catch { throw new WorkflowError("invalid_input", "Ungültiger JSON-Body."); }
          const session = await ctx.sessions.getSession(params.id);
          if (!session) throw new WorkflowError("not_found", "Session nicht gefunden.");
          if (session.userId !== ctx.userId) throw new WorkflowError("forbidden", "Kein Zugriff.");
          const updated = { ...session, context: { ...session.context, ...(body.context ?? {}) } };
          const saved = await ctx.sessions.updateSession(updated);
          return { session: saved };
        }),
    },
  },
});
