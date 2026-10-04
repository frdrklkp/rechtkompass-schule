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
          // Redaktionell am Fall verknüpfte Normen haben Vorrang: ihre Chunks
          // werden immer als Kandidaten mitgegeben (pinnedChunkIds) und ihre
          // Quellen ergänzen die Eingrenzung. Serverseitig ermittelt, damit der
          // Client keine beliebigen Chunks "anpinnen" kann.
          let filters = body.filters;
          const caseId = body.caseContext?.caseId;
          if (caseId) {
            // Tabellen fehlen in den generierten Supabase-Typen - bewusster Cast (wie in faelle.$id.tsx).
            const db = supabase as unknown as { from: (table: string) => any };
            const { data: links } = await db
              .from("case_legal_links")
              .select("legal_section_id, legal_sections(source_id)")
              .eq("case_id", caseId);
            const rows = (links ?? []) as Array<{ legal_section_id: string | null; legal_sections: { source_id: string | null } | null }>;
            const sectionIds = rows.map((r) => r.legal_section_id).filter((s): s is string => !!s);
            const linkedSourceIds = rows.map((r) => r.legal_sections?.source_id).filter((s): s is string => !!s);
            let pinnedChunkIds: string[] = [];
            if (sectionIds.length > 0) {
              const { data: chunks } = await db
                .from("legal_chunks")
                .select("id")
                .in("primary_section_id", sectionIds)
                .eq("active", true);
              pinnedChunkIds = ((chunks ?? []) as Array<{ id: string }>).map((c) => c.id);
            }
            filters = {
              ...(body.filters ?? {}),
              sourceIds: Array.from(new Set([...(body.filters?.sourceIds ?? []), ...linkedSourceIds])),
              pinnedChunkIds,
            };
          }
          const svc = new LegalCopilotService({ retrievalRepo: repo, workflowTemplateRepo, conversationRepo });
          const askInput: CopilotAskInput = {
            question,
            sessionId: body.sessionId ?? null,
            mode: body.mode,
            filters,
            caseContext: body.caseContext ?? null,
            debug: body.debug,
            forceMock: body.forceMock,
          };

          // Gestufte Rückmeldung (04.10.2026): Mit "Accept: text/event-stream"
          // bekommt der Client Phasen-Ereignisse (Suche fertig, Antwort wird
          // formuliert, Antwort wird geprüft) und am Ende das vollständige,
          // geprüfte Ergebnis. Es wird KEIN Antworttext vor der Prüfung
          // gesendet. Ohne den Header bleibt die bisherige JSON-Antwort.
          if ((request.headers.get("accept") ?? "").includes("text/event-stream")) {
            const encoder = new TextEncoder();
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                const send = (event: string, data: unknown) => {
                  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                };
                svc
                  .ask(askInput, { onProgress: (e) => send("progress", e) })
                  .then((result) => send("result", { result }))
                  .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : "unknown error";
                    const code = (err as { code?: string }).code ?? "internal";
                    send("result", { error: message, code, result: null });
                  })
                  .finally(() => controller.close());
              },
            });
            return new Response(stream, {
              status: 200,
              headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
            });
          }

          const result = await svc.ask(askInput);
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
