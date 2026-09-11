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

/**
 * Guthaben-Wächter (Nutzerauftrag 11.09.2026): Am 08.09. war die
 * Fallgenerierung still ausgefallen, weil das Anthropic-Guthaben leer war -
 * entdeckt nur durch Zufall. Anthropic bietet keine Guthaben-Abfrage per
 * API; stattdessen prüft jeder Runner-Lauf mit einer Minimalanfrage
 * (1 Token, ~0,0002 ct), ob die API die "credit balance is too low"-
 * Meldung liefert, und warnt dann per Mail an REVIEW_NOTIFY_EMAIL.
 * Entprellung: höchstens eine Warnung je 24 h, Marker in
 * case_generation_jobs (requested_by-freier Systemeintrag entfällt wegen
 * NOT NULL - stattdessen Suche nach der jüngsten gesendeten Warnung über
 * das error-Feld).
 */
const CREDIT_WARN_MARKER = "SYSTEM-GUTHABEN-WARNUNG";

async function checkCreditAndWarn(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const notifyTo = process.env.REVIEW_NOTIFY_EMAIL;
  if (!apiKey || !notifyTo || !process.env.RESEND_API_KEY) return;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
    });
    if (res.ok) return; // Guthaben vorhanden - nichts zu tun.
    const text = await res.text();
    if (!/credit balance is too low/i.test(text)) return; // anderer Fehler - nicht unser Thema.

    // Entprellung: schon in den letzten 24 h gewarnt?
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { data: recent } = await (service as any)
      .from("case_generation_jobs")
      .select("id")
      .ilike("error", `%${CREDIT_WARN_MARKER}%`)
      .gt("updated_at", since)
      .limit(1);
    if (recent?.length) return;

    const { sendEmail } = await import("../src/lib/mail/resend.server");
    await sendEmail({
      to: notifyTo,
      subject: "RechtKompass: Anthropic-Guthaben aufgebraucht - Fallgenerierung steht",
      html: [
        `<p style="margin:0 0 12px 0;">Das Anthropic-API-Guthaben ist aufgebraucht. <strong>Fallgenerierung und Fall-schildern-Einschätzung schlagen ab sofort fehl</strong>, bis aufgeladen wird.</p>`,
        `<p style="margin:0 0 12px 0;"><a href="https://console.anthropic.com/settings/billing">Zum Aufladen: console.anthropic.com &rarr; Plans &amp; Billing</a></p>`,
        `<p style="margin:16px 0 0 0;font-size:12px;color:#666;">Automatische Warnung des Fallgenerierungs-Runners (höchstens einmal je 24 Stunden).</p>`,
      ].join("\n"),
    });
    // Marker für die Entprellung hinterlegen (als abgeschlossener Job-Eintrag
    // mit eindeutigem Fehlertext; taucht in keiner Warteschlange auf).
    await (service as any).from("case_generation_jobs").insert({
      requested_by: "85d423d1-cde1-47b2-bc27-f9383621b15a",
      sketch: "SYSTEM: Guthaben-Warnung (automatischer Marker, bitte ignorieren)",
      status: "failed",
      phase: "entwurf",
      error: `${CREDIT_WARN_MARKER}: Warnmail gesendet.`,
    });
    console.log("Guthaben-Warnung versendet.");
  } catch (err) {
    console.error("Guthaben-Check fehlgeschlagen:", err instanceof Error ? err.message : err);
  }
}

async function main() {
  await markStaleJobs();
  await checkCreditAndWarn();

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
