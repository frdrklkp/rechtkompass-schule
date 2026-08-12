import { createFileRoute } from "@tanstack/react-router";
import { engineForSession, withWorkflowApi } from "@/lib/workflowApi.server";
import { WorkflowError, type WorkflowStepStatus } from "@/services/legal-workflows";

const ALLOWED: WorkflowStepStatus[] = ["open", "active", "waiting", "completed", "skipped", "blocked"];

export const Route = createFileRoute("/api/workflow-sessions/$id/transitions")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withWorkflowApi(request, "POST /api/workflow-sessions/:id/transitions", async (ctx) => {
          let body: { stepId?: string; to?: WorkflowStepStatus; note?: string };
          try { body = (await request.json()) as typeof body; }
          catch { throw new WorkflowError("invalid_input", "Ungültiger JSON-Body."); }
          if (!body.stepId || !body.to) throw new WorkflowError("invalid_input", "stepId und to sind Pflicht.");
          if (!ALLOWED.includes(body.to)) throw new WorkflowError("invalid_input", `Unbekannter Zielstatus: ${body.to}`);
          const { engine } = await engineForSession(ctx, params.id);
          const session = await engine.transitionStep({
            sessionId: params.id, stepId: body.stepId, to: body.to, actor: ctx.userId, note: body.note,
          });
          return { session };
        }),
    },
  },
});
