/**
 * Ampel-Neueinstufung + Zuständigkeits-Korrektur für den kompletten Bestand
 * (Nutzeranforderung 2026-08-14, konkretes Fundament: "Berufskolleg-Schüler
 * nutzt ChatGPT bei Klausur" - Banner behauptet "grün, keine Schulleitung
 * nötig", während der Entscheidungsbaum eine förmliche Anhörung durch die
 * Schulleitung enthält).
 *
 * Ursache war ein fehlendes Einstufungskriterium im Generierungs-Prompt
 * (bereits gefixt, siehe ai-draft-batch-item.ts/ai-draft-case.ts) - dieses
 * Skript korrigiert rückwirkend den kompletten Bestand über
 * /api/ai-reclassify-ampel.
 *
 * Aufruf: bun run scripts/_reclassify-ampel.ts [--dry]
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
const _API_ORIGIN = "http://127.0.0.1:8080";
const _origFetch = globalThis.fetch.bind(globalThis);
(globalThis as any).fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === "string" && input.startsWith("/")) return _origFetch(_API_ORIGIN + input, init);
  return _origFetch(input as any, init);
};

import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "admin@rechtkompass.local";
const DRY = process.argv.includes("--dry");
const sinceArg = process.argv.find((a) => a.startsWith("--since="));
const SINCE = sinceArg ? new Date(sinceArg.split("=")[1]) : null;

async function bootstrapSession(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
  if (error) throw new Error(`generateLink fehlgeschlagen: ${error.message}`);
  const { supabase } = await import("../src/integrations/supabase/client");
  const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "magiclink" });
  if (verifyErr) throw new Error(`verifyOtp fehlgeschlagen: ${verifyErr.message}`);
  const { canWrite } = await import("../src/lib/adminAuth");
  for (let i = 0; i < 25; i++) { if (canWrite()) return; await new Promise((r) => setTimeout(r, 200)); }
  throw new Error("Admin-Session nach 5s nicht bereit");
}

async function main() {
  console.log(`Modus: ${DRY ? "DRY-RUN" : "LIVE"}\n`);
  console.log("Bootstrapping Admin-Session...");
  await bootstrapSession();
  console.log("Session bereit.\n");

  const { supabase } = await import("../src/integrations/supabase/client");
  const { apiFetch } = await import("../src/lib/apiFetch");

  const { data: rows, error } = await supabase
    .from("practice_cases")
    .select("id,title,ampel,category,subcategory,short_description,short_answer,immediate_actions,recommendation,responsibilities,decision_tree,created_at");
  if (error) throw error;
  let cases = (rows ?? []) as any[];
  if (SINCE) cases = cases.filter((c) => new Date(c.created_at) >= SINCE);
  console.log(`${cases.length} Fälle werden neu bewertet.${SINCE ? ` (nur ab ${SINCE.toISOString()})` : ""}\n`);

  const stats = { unchanged: 0, ampelChanged: 0, responsibilitiesFixed: 0, errors: 0 };
  const byAmpel: Record<string, number> = { gruen: 0, gelb: 0, rot: 0 };

  for (let i = 0; i < cases.length; i++) {
    const row = cases[i];
    const label = String(row.title ?? "").slice(0, 55);
    try {
      const questions = Object.values((row.decision_tree as any)?.steps ?? {}).map((s: any) => s.question).filter(Boolean);
      const res = await apiFetch("/api/ai-reclassify-ampel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseRow: { ...row, decision_tree_questions: questions } }),
      });
      if (!res.ok) {
        stats.errors++;
        console.log(`[${i + 1}/${cases.length}] FEHLER (HTTP ${res.status}) bei "${label}"`);
        continue;
      }
      const result = (await res.json()) as { ampel: "gruen" | "gelb" | "rot"; reasoning: string; responsibilities_correction: string | null };
      byAmpel[result.ampel] = (byAmpel[result.ampel] ?? 0) + 1;

      const patch: Record<string, unknown> = {};
      if (result.ampel !== row.ampel) { patch.ampel = result.ampel; stats.ampelChanged++; }
      if (result.responsibilities_correction) { patch.responsibilities = result.responsibilities_correction; stats.responsibilitiesFixed++; }

      if (Object.keys(patch).length === 0) {
        stats.unchanged++;
        console.log(`[${i + 1}/${cases.length}] unverändert (${row.ampel}) :: ${label}`);
      } else {
        console.log(`[${i + 1}/${cases.length}] ${row.ampel}->${result.ampel}${patch.responsibilities ? " +Zuständigkeit korrigiert" : ""} :: ${label}`);
        if (!DRY) {
          const { error: updErr } = await (supabase.from("practice_cases") as any).update(patch).eq("id", row.id);
          if (updErr) { stats.errors++; console.log(`  Speicherfehler: ${updErr.message}`); }
        }
      }
    } catch (e) {
      stats.errors++;
      console.log(`[${i + 1}/${cases.length}] FEHLER bei "${label}": ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`--- Zwischenstand: ${JSON.stringify(stats)}, Verteilung: ${JSON.stringify(byAmpel)} ---`);
    }
  }

  console.log(`\n=== Fertig: ${JSON.stringify(stats)} ===`);
  console.log(`Neue Ampel-Verteilung (nur reklassifizierte): ${JSON.stringify(byAmpel)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
