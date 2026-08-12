import { createFileRoute } from "@tanstack/react-router";
import { withWorkflowApi } from "@/lib/workflowApi.server";
import { WorkflowError } from "@/services/legal-workflows";

export const Route = createFileRoute("/api/workflows/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withWorkflowApi(request, "GET /api/workflows/:id", async ({ templates }) => {
          const tpl = await templates.getById(params.id);
          if (!tpl) throw new WorkflowError("not_found", "Template nicht gefunden.");
          return { template: tpl };
        }),
    },
  },
});
