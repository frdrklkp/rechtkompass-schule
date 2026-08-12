import { createFileRoute } from "@tanstack/react-router";
import { withWorkflowApi } from "@/lib/workflowApi.server";
import { WorkflowError } from "@/services/legal-workflows";

export const Route = createFileRoute("/api/workflow-sessions/$id/events")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withWorkflowApi(request, "GET /api/workflow-sessions/:id/events", async (ctx) => {
          const session = await ctx.sessions.getSession(params.id);
          if (!session) throw new WorkflowError("not_found", "Session nicht gefunden.");
          if (session.userId !== ctx.userId) throw new WorkflowError("forbidden", "Kein Zugriff.");
          const events = await ctx.sessions.listEvents(params.id);
          return { events };
        }),
    },
  },
});
