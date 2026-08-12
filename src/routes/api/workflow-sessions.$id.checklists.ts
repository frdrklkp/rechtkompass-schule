import { createFileRoute } from "@tanstack/react-router";
import { engineForSession, withWorkflowApi } from "@/lib/workflowApi.server";
import { WorkflowError } from "@/services/legal-workflows";

export const Route = createFileRoute("/api/workflow-sessions/$id/checklists")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withWorkflowApi(request, "POST /api/workflow-sessions/:id/checklists", async (ctx) => {
          let body: { stepId?: string; itemId?: string; done?: boolean; note?: string };
          try { body = (await request.json()) as typeof body; }
          catch { throw new WorkflowError("invalid_input", "Ungültiger JSON-Body."); }
          if (!body.stepId || !body.itemId || typeof body.done !== "boolean") {
            throw new WorkflowError("invalid_input", "stepId, itemId und done sind Pflicht.");
          }
          const { engine } = await engineForSession(ctx, params.id);
          const session = await engine.toggleChecklistItem({
            sessionId: params.id, stepId: body.stepId, itemId: body.itemId,
            done: body.done, actor: ctx.userId, note: body.note,
          });
          return { session };
        }),
    },
  },
});
