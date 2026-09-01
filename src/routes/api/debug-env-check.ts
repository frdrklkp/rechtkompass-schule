/**
 * TEMPORÄRE Diagnose-Route (2026-08-30, Fallgenerierungs-Secret): meldet nur
 * die ANWESENHEIT relevanter Laufzeit-Umgebungsvariablen im deployten Worker,
 * niemals Werte. Wird nach der Diagnose wieder entfernt (gleiches Vorgehen
 * wie debug-openai-key-check am 26.08.).
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";

export const Route = createFileRoute("/api/debug-env-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;
        const has = (k: string) => {
          const v = process.env[k];
          return { present: !!v, length: v ? v.length : 0 };
        };
        return new Response(
          JSON.stringify({
            CASE_GENERATION_SERVICE_PASSWORD: has("CASE_GENERATION_SERVICE_PASSWORD"),
            CASE_GENERATION_SERVICE_EMAIL: has("CASE_GENERATION_SERVICE_EMAIL"),
            OPENAI_API_KEY: has("OPENAI_API_KEY"),
            ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
            envKeysWithCase: Object.keys(process.env).filter((k) => k.toUpperCase().includes("CASE")),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
