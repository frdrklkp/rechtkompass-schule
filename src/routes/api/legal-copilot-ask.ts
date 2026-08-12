/**
 * POST /api/legal-copilot-ask
 * Body: { question, sessionId?, mode?, filters?, debug?, forceMock? }
 */
import { createFileRoute } from "@tanstack/react-router";
import { LegalCopilotService, type CopilotAskInput } from "@/services/legal-copilot";

export const Route = createFileRoute("/api/legal-copilot-ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Partial<CopilotAskInput>;
        try {
          body = (await request.json()) as Partial<CopilotAskInput>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const question = (body.question ?? "").toString().trim();
        if (!question) return Response.json({ error: "question fehlt" }, { status: 400 });

        try {
          const { createServiceSupabase } = await import("@/lib/searchEmbeddings.supabase.server");
          const supabase = createServiceSupabase();
          const { SupabaseRetrievalRepository } = await import(
            "@/services/legal-knowledge/retrieval/repositories/RetrievalRepository"
          );
          const { SupabaseWorkflowTemplateRepository } = await import(
            "@/services/legal-workflows/SupabaseWorkflowTemplateRepository"
          );
          const repo = new SupabaseRetrievalRepository(supabase);
          const workflowTemplateRepo = new SupabaseWorkflowTemplateRepository(supabase);
          const svc = new LegalCopilotService({ retrievalRepo: repo, workflowTemplateRepo });
          const result = await svc.ask({
            question,
            sessionId: body.sessionId ?? null,
            mode: body.mode,
            filters: body.filters,
            debug: body.debug,
            forceMock: body.forceMock,
          });
          return Response.json({ result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          const code = (err as { code?: string }).code ?? "internal";
          return Response.json({ error: message, code, result: null }, { status: 200 });
        }
      },
    },
  },
});
