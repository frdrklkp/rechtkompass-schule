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

        // Fund 2026-09-01 (Produktionstest): die Pipeline dauert 6-7 Minuten -
        // auf Cloudflare Workers stirbt eine so lange Hintergrundausführung
        // still (Job blieb dauerhaft in "entwurf", weder Fortschritt noch
        // Fehler; waitUntil verlängert die Lebenszeit nicht ausreichend).
        // Der Job wird deshalb nur noch EINGEREIHT (status "pending") und von
        // einem externen Runner abgearbeitet (GitHub-Actions-Workflow
        // case-generation-runner.yml, alle 5 Minuten; Skript
        // scripts/_process-generation-queue.ts). Im lokalen Bun-Dev-Betrieb
        // wird weiterhin sofort in-process verarbeitet - der Claim-Schritt
        // im Runner-Skript verhindert Doppelverarbeitung.
        const { data: jobRow, error: insertError } = await (service as any)
          .from("case_generation_jobs")
          .insert({ requested_by: auth.userId, sketch, status: "pending", phase: "entwurf" })
          .select("id")
          .single();
        if (insertError || !jobRow) {
          console.error("[case-generation-jobs] Job konnte nicht angelegt werden:", insertError?.message);
          return jsonResponse({ error: "Job konnte nicht angelegt werden." }, 500);
        }

        const jobId = jobRow.id as string;
        const isLocalDev = process.env.NODE_ENV !== "production";
        if (isLocalDev) {
          const apiOrigin = new URL(request.url).origin;
          const { data: claimed } = await (service as any)
            .from("case_generation_jobs")
            .update({ status: "running" })
            .eq("id", jobId)
            .eq("status", "pending")
            .select("id");
          if (claimed?.length) {
            processCaseGenerationJob(jobId, sketch, apiOrigin).catch((err) =>
              console.error("[case-generation-jobs] Hintergrundverarbeitung fehlgeschlagen:", err),
            );
          }
        }

        return jsonResponse({ jobId, status: isLocalDev ? "running" : "pending", phase: "entwurf" }, 201);
      },
    },
  },
});
