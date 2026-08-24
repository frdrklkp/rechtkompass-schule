/**
 * Sprint 4.6K – Automatische Fallgenerierung durch Lehrkräfte.
 * POST legt einen Generierungs-Job an und stößt die Hintergrundverarbeitung
 * an (Entwurf -> anlegen -> vernetzen -> Entscheidungsbaum -> Qualität ->
 * zur Redaktionsprüfung einreichen). Der Fall bleibt bis zur redaktionellen
 * Freigabe unveröffentlicht; die anfragende Lehrkraft sieht ihn währenddessen
 * über die eigene in_review-Sichtbarkeit (Sprint 4.6K.2).
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/integrations/supabase/apiAuthGuard";
import { createServiceSupabase } from "@/lib/searchEmbeddings.supabase.server";
import { processCaseGenerationJob } from "@/lib/server/caseGenerationJob";

const MIN_SKETCH_LENGTH = 20;
const MAX_SKETCH_LENGTH = 4000;
const DAILY_LIMIT_PER_USER = 5;

type RequestBody = { sketch?: string };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/case-generation-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;

        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return jsonResponse({ error: "Ungültiges JSON" }, 400);
        }

        const sketch = (body.sketch ?? "").trim();
        if (sketch.length < MIN_SKETCH_LENGTH) {
          return jsonResponse(
            { error: `Die Schilderung muss mindestens ${MIN_SKETCH_LENGTH} Zeichen umfassen.` },
            400,
          );
        }
        if (sketch.length > MAX_SKETCH_LENGTH) {
          return jsonResponse(
            { error: `Die Schilderung darf höchstens ${MAX_SKETCH_LENGTH} Zeichen umfassen.` },
            400,
          );
        }

        const service = createServiceSupabase();

        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const { count, error: countError } = await (service as any)
          .from("case_generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("requested_by", auth.userId)
          .gte("created_at", startOfDay.toISOString());
        if (countError) {
          console.error("[case-generation-jobs] Tageslimit-Prüfung fehlgeschlagen:", countError.message);
          return jsonResponse({ error: "Anfrage derzeit nicht möglich." }, 500);
        }
        if ((count ?? 0) >= DAILY_LIMIT_PER_USER) {
          return jsonResponse(
            { error: `Tageslimit erreicht (${DAILY_LIMIT_PER_USER} Fallgenerierungen pro Tag).` },
            429,
          );
        }

        const { data: jobRow, error: insertError } = await (service as any)
          .from("case_generation_jobs")
          .insert({ requested_by: auth.userId, sketch, status: "running", phase: "entwurf" })
          .select("id")
          .single();
        if (insertError || !jobRow) {
          console.error("[case-generation-jobs] Job konnte nicht angelegt werden:", insertError?.message);
          return jsonResponse({ error: "Job konnte nicht angelegt werden." }, 500);
        }

        const jobId = jobRow.id as string;
        const apiOrigin = new URL(request.url).origin;
        const jobPromise = processCaseGenerationJob(jobId, sketch, apiOrigin);
        // Sprint 4.6K: auf Cloudflare Workers (nitro-Preset "cloudflare-module")
        // wird die Ausführung nach dem Response i. d. R. beendet, sofern die
        // Zusage nicht per waitUntil verlängert wird. Im aktuell tatsächlich
        // betriebenen Bun-Prozess (nohup bun run dev) läuft die Promise ohnehin
        // unabhängig vom Response weiter; dieser Hook ist eine Absicherung für
        // eine mögliche künftige Cloudflare-Bereitstellung, kein Ersatz dafür.
        const waitUntil = (request as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
        if (typeof waitUntil === "function") {
          waitUntil(jobPromise);
        } else {
          jobPromise.catch((err) => console.error("[case-generation-jobs] Hintergrundverarbeitung fehlgeschlagen:", err));
        }

        return jsonResponse({ jobId, status: "running", phase: "entwurf" }, 201);
      },
    },
  },
});
