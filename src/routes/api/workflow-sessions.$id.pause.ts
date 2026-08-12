import { createFileRoute } from "@tanstack/react-router";
import { engineForSession, withWorkflowApi } from "@/lib/workflowApi.server";

export const Route = createFileRoute("/api/workflow-sessions/$id/pause")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withWorkflowApi(request, "POST /api/workflow-sessions/:id/pause", async (ctx) => {
          const { engine } = await engineForSession(ctx, params.id);
          const session = await engine.pause(params.id, ctx.userId);
          return { session };
        }),
    },
  },
});
