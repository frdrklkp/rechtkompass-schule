import { createFileRoute } from "@tanstack/react-router";
import { withWorkflowApi } from "@/lib/workflowApi.server";
import { buildDocGenBundle, loadRuntimeForSession } from "@/lib/documentGeneration.server";
import { WorkflowError } from "@/services/legal-workflows";

/**
 * GET   /api/workflow-sessions/:id/documents/:docId               → { document }
 * PUT   /api/workflow-sessions/:id/documents/:docId { markdown, title? } → { document }
 * POST  /api/workflow-sessions/:id/documents/:docId/regenerate    → über action=regenerate im body
 */
export const Route = createFileRoute("/api/workflow-sessions/$id/documents/$docId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withWorkflowApi(request, "GET /api/workflow-sessions/:id/documents/:docId", async (ctx) => {
          const supabase = (ctx.templates as unknown as { db: unknown }).db as never;
          const bundle = buildDocGenBundle(supabase);
          await loadRuntimeForSession({
            sessionId: params.id,
            userId: ctx.userId,
            sessions: ctx.sessions,
            templateRepo: ctx.templates,
          });
          const document = await bundle.documents.getById(params.docId);
          if (!document || document.sessionId !== params.id) {
            throw new WorkflowError("not_found", "Dokument nicht gefunden.");
          }
          return { document };
        }),

      PUT: async ({ request, params }) =>
        withWorkflowApi(request, "PUT /api/workflow-sessions/:id/documents/:docId", async (ctx) => {
          const body = (await safeJson(request)) as { markdown?: string; title?: string; status?: string };
          const supabase = (ctx.templates as unknown as { db: unknown }).db as never;
          const bundle = buildDocGenBundle(supabase);
          const existing = await bundle.documents.getById(params.docId);
          if (!existing || existing.sessionId !== params.id) {
            throw new WorkflowError("not_found", "Dokument nicht gefunden.");
          }
          // Ownership zusätzlich absichern
          await loadRuntimeForSession({
            sessionId: params.id, userId: ctx.userId,
            sessions: ctx.sessions, templateRepo: ctx.templates,
          });
          const document = await bundle.documents.update(params.docId, {
            markdown: body.markdown,
            title: body.title,
            status: body.status === "manual" ? "manual" : undefined,
          });
          return { document };
        }),

      POST: async ({ request, params }) =>
        withWorkflowApi(request, "POST /api/workflow-sessions/:id/documents/:docId (regenerate)", async (ctx) => {
          const supabase = (ctx.templates as unknown as { db: unknown }).db as never;
          const bundle = buildDocGenBundle(supabase);
          const existing = await bundle.documents.getById(params.docId);
          if (!existing || existing.sessionId !== params.id) {
            throw new WorkflowError("not_found", "Dokument nicht gefunden.");
          }
          const { session, runtime } = await loadRuntimeForSession({
            sessionId: params.id, userId: ctx.userId,
            sessions: ctx.sessions, templateRepo: ctx.templates,
          });
          const templates = await bundle.templates.listForRuntime(runtime);
          const template = templates.find((t) => t.slug === existing.templateSlug);
          if (!template) throw new WorkflowError("not_found", "Vorlage nicht mehr im Workflow verlinkt.");
          const body = (await safeJson(request)) as { school?: string | null; actorDisplayName?: string | null };
          const document = await bundle.service.regenerate({
            session, runtime, template,
            actor: ctx.userId,
            actorDisplayName: body.actorDisplayName ?? null,
            school: body.school ?? null,
            existingDocumentId: existing.id,
          });
          return { document };
        }),

      DELETE: async ({ request, params }) =>
        withWorkflowApi(request, "DELETE /api/workflow-sessions/:id/documents/:docId", async (ctx) => {
          const supabase = (ctx.templates as unknown as { db: unknown }).db as never;
          const bundle = buildDocGenBundle(supabase);
          const existing = await bundle.documents.getById(params.docId);
          if (!existing || existing.sessionId !== params.id) {
            throw new WorkflowError("not_found", "Dokument nicht gefunden.");
          }
          await loadRuntimeForSession({
            sessionId: params.id, userId: ctx.userId,
            sessions: ctx.sessions, templateRepo: ctx.templates,
          });
          await bundle.documents.delete(existing.id);
          return { ok: true };
        }),
    },
  },
});

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown>; } catch { return {}; }
}
