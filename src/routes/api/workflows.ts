import { createFileRoute } from "@tanstack/react-router";
import { withWorkflowApi } from "@/lib/workflowApi.server";

export const Route = createFileRoute("/api/workflows")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withWorkflowApi(request, "GET /api/workflows", async ({ templates }) => {
          const list = await templates.listPublished();
          return {
            templates: list.map((t) => ({
              id: t.id,
              slug: t.slug,
              title: t.title,
              subtitle: t.subtitle ?? null,
              description: t.description ?? null,
              publicationTier: t.publicationTier,
              currentVersionId: t.currentVersionId ?? null,
              phaseCount: t.phases.length,
              stepCount: t.phases.reduce((n, p) => n + p.steps.length, 0),
            })),
          };
        }),
    },
  },
});
