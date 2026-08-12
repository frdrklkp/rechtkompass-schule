import { createFileRoute } from "@tanstack/react-router";
import { engineForSession, withWorkflowApi } from "@/lib/workflowApi.server";
import { WorkflowError } from "@/services/legal-workflows";

export const Route = createFileRoute("/api/workflow-sessions/$id/cancel")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withWorkflowApi(request, "POST /api/workflow-sessions/:id/cancel", async (ctx) => {
          let body: { reason?: string } = {};
          try { body = (await request.json()) as typeof body; } catch { /* no body ok */ }
          const { engine } = await engineForSession(ctx, params.id);
          const session = await engine.cancel(params.id, ctx.userId, body?.reason);
          if (!session) throw new WorkflowError("invalid_state", "Cancel fehlgeschlagen.");
          return { session };
        }),
    },
  },
});
