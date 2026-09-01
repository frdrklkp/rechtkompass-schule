/**
 * Externer Runner für die Fallgenerierungs-Queue (Fund 2026-09-01: die
 * 6-7-minütige Pipeline stirbt auf Cloudflare Workers still - Jobs werden
 * dort nur noch als "pending" eingereiht und HIER abgearbeitet; läuft per
 * GitHub Actions alle 5 Minuten, siehe .github/workflows/
 * case-generation-runner.yml, oder manuell: bun run scripts/_process-generation-queue.ts).
 *
 * Ablauf: eingereihte Jobs (status "pending") atomar claimen (queued ->
 * running, nur wer den Update-Zuschlag bekommt, verarbeitet), dann die
 * bestehende Pipeline processCaseGenerationJob() ausführen - die arbeitet
 * seit dem In-Process-Umbau ohne laufenden HTTP-Server. Zusätzlich werden
 * verwaiste Jobs aufgeräumt: "running" ohne Update seit >20 Minuten sind
 * Leichen gestorbener Worker-Ausführungen und werden als failed markiert.
 */
(globalThis as any).window = globalThis;
const _store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => _store.get(k) ?? null,
  setItem: (k: string, v: string) => { _store.set(k, v); },
  removeItem: (k: string) => { _store.delete(k); },
  clear: () => { _store.clear(); },
  key: (i: number) => [..._store.keys()][i] ?? null,
  get length() { return _store.size; },
};

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STALE_MINUTES = 20;
const MAX_JOBS_PER_RUN = 5;
const API_ORIGIN = process.env.CASE_GENERATION_API_ORIGIN ?? "https://www.rechtkompass-schule.de";

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function markStaleJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data, error } = await (service as any)
    .from("case_generation_jobs")
    .update({
      status: "failed",
      error:
        "Verarbeitung abgebrochen (Zeitüberschreitung) - bitte die Fallgenerierung erneut starten.",
    })
    .eq("status", "running")
    .lt("updated_at", cutoff)
    .select("id");
  if (error) console.error("Stale-Aufräumen fehlgeschlagen:", error.message);
  else if (data?.length) console.log(`Verwaiste Jobs als failed markiert: ${data.length}`);
}

async function main() {
  await markStaleJobs();

  const { data: queued, error } = await (service as any)
    .from("case_generation_jobs")
    .select("id, sketch")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_RUN);
  if (error) throw new Error(`Queue-Abfrage fehlgeschlagen: ${error.message}`);
  if (!queued?.length) {
    console.log("Keine wartenden Jobs.");
    return;
  }
  console.log(`${queued.length} wartende(r) Job(s).`);

  const { processCaseGenerationJob } = await import("../src/lib/server/caseGenerationJob");

  for (const job of queued as Array<{ id: string; sketch: string }>) {
    // Atomarer Claim: nur wer den pending->running-Zuschlag bekommt, arbeitet.
    const { data: claimed } = await (service as any)
      .from("case_generation_jobs")
      .update({ status: "running" })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) {
      console.log(`Job ${job.id}: bereits anderweitig übernommen.`);
      continue;
    }
    console.log(`Job ${job.id}: Verarbeitung startet...`);
    const t0 = Date.now();
    try {
      await processCaseGenerationJob(job.id, job.sketch, API_ORIGIN);
      console.log(`Job ${job.id}: fertig nach ${Math.round((Date.now() - t0) / 1000)}s.`);
    } catch (err) {
      console.error(`Job ${job.id}: fehlgeschlagen -`, err instanceof Error ? err.message : String(err));
    }
  }
}

main();
