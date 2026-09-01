/**
 * Sprint 4.6K – Statusabfrage für einen laufenden Fallgenerierungs-Job.
 * Nutzt bewusst einen an den Aufrufer-Token gebundenen Client (nicht
 * service-role): die RLS-Policy "case_generation_jobs: select own or editor"
 * entscheidet über Sichtbarkeit, keine zusätzliche App-Logik nötig.
 */
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";
import { readSupabasePublishableKey, readSupabaseUrl } from "@/lib/server/supabaseEnv";
import type { Database } from "@/integrations/supabase/types";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/case-generation-jobs/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        // Fund 2026-08-30: rohes process.env.VITE_* war im Worker leer -
        // dadurch lieferte diese Route in Produktion dauerhaft 500 und der
        // Fallgenerierungs-Spinner pollte endlos, ohne den Fehler zu sehen.
        const url = readSupabaseUrl();
        const key = readSupabasePublishableKey();
        if (!url || !key) {
          return jsonResponse({ error: "Serverkonfiguration unvollständig" }, 500);
        }
        const token = request.headers.get("authorization")!.slice("Bearer ".length);
        const client = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await (client as any)
          .from("case_generation_jobs")
          .select("id, status, phase, case_id, error, created_at, updated_at")
          .eq("id", params.id)
          .maybeSingle();
        if (error) {
          console.error("[case-generation-jobs.$id] Statusabfrage fehlgeschlagen:", error.message);
          return jsonResponse({ error: "Status konnte nicht geladen werden." }, 500);
        }
        if (!data) {
          return jsonResponse({ error: "Job nicht gefunden." }, 404);
        }

        return jsonResponse(
          {
            id: data.id,
            status: data.status,
            phase: data.phase,
            caseId: data.case_id,
            error: data.error,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          },
          200,
        );
      },
    },
  },
});
