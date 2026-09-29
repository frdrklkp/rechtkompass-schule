/**
 * POST /api/legal-copilot-ask
 * Body: { question, sessionId?, mode?, filters?, caseContext?, debug?, forceMock? }
 *
 * Auth-Pflicht seit der Konversations-Persistenz (29.09.2026): Sitzungen
 * werden nutzergebunden in copilot_conversations gespeichert, dafür braucht
 * die Route die Identität aus dem Bearer-Token. Einziger Client ist der
 * CaseCopilotDialog hinter dem Pilot-Login.
 */
import { createFileRoute } from "@tanstack/react-router";
import { LegalCopilotService, type CopilotAskInput } from "@/services/legal-copilot";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

export const Route = createFileRoute("/api/legal-copilot-ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

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
          const { SupabaseConversationRepository } = await import(
            "@/services/legal-copilot/SupabaseConversationRepository"
          );
          const repo = new SupabaseRetrievalRepository(supabase);
          const workflowTemplateRepo = new SupabaseWorkflowTemplateRepository(supabase);
          const conversationRepo = new SupabaseConversationRepository(
            supabase,
            auth.userId,
            body.caseContext?.caseId ?? null,
          );
          const svc = new LegalCopilotService({ retrievalRepo: repo, workflowTemplateRepo, conversationRepo });
          const result = await svc.ask({
            question,
            sessionId: body.sessionId ?? null,
            mode: body.mode,
            filters: body.filters,
            caseContext: body.caseContext ?? null,
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
