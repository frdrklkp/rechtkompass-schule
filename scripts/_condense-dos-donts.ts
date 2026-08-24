/**
 * Kürzt Do's (practice_tip) und Don'ts (common_mistakes) aller
 * veröffentlichten Praxisfälle auf knappe Bulletpoints, über
 * /api/ai-condense-case (siehe dort für Hintergrund/Ursache).
 *
 * Aufruf:
 *   bun run scripts/_condense-dos-donts.ts --pilot=6   (nur Vorschau, kein Schreiben)
 *   bun run scripts/_condense-dos-donts.ts --dry        (alle Fälle, kein Schreiben)
 *   bun run scripts/_condense-dos-donts.ts              (alle Fälle, LIVE)
 *   bun run scripts/_condense-dos-donts.ts --since=2026-08-15  (nur Fälle ab Datum)
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
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ADMIN_EMAIL = "admin@rechtkompass.local";
const DRY = process.argv.includes("--dry");
const pilotArg = process.argv.find((a) => a.startsWith("--pilot="));
const PILOT = pilotArg ? parseInt(pilotArg.split("=")[1], 10) : 0;
const sinceArg = process.argv.find((a) => a.startsWith("--since="));
const SINCE = sinceArg ? new Date(sinceArg.split("=")[1]) : null;

// Fortschrittsdatei: bereits erfolgreich verarbeitete IDs überspringen, damit
// ein Wiederanlauf nach einem Fehler nicht bereits gekürzte Fälle erneut kürzt.
const PROGRESS_FILE = "/private/tmp/claude-501/-Users-frederik-Downloads-A-Fresh-Start/05ab1dc5-2718-4ee1-97a7-493f09297f00/scratchpad/condense-progress.json";
function loadProgress(): Set<string> {
  if (!existsSync(PROGRESS_FILE)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(PROGRESS_FILE, "utf8")));
  } catch {
    return new Set();
  }
}
function saveProgress(done: Set<string>): void {
  writeFileSync(PROGRESS_FILE, JSON.stringify([...done]));
}

/** Erwartet ein Array von Strings; versucht, einen fälschlich als String
 * zurückgegebenen JSON-Array-Text zu reparieren. Gibt null zurück, wenn das
 * Ergebnis nicht sicher als String-Array interpretierbar ist. */
function coerceStringArray(v: unknown): string[] | null {
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
    } catch {
      /* fällt durch zu null */
    }
  }
  return null;
}

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

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function pickPilotSample(cases: any[], n: number): any[] {
  const crammed = cases.filter((c) => (c.common_mistakes?.length ?? 0) === 1);
  const empty = cases.filter((c) => (c.common_mistakes?.length ?? 0) === 0);
  const healthyOld = cases.filter((c) => (c.common_mistakes?.length ?? 0) >= 2 && new Date(c.created_at) < new Date("2026-08-15"));
  const pool = [...crammed.slice(0, Math.ceil(n * 0.5)), ...empty.slice(0, Math.ceil(n * 0.2)), ...healthyOld.slice(0, Math.ceil(n * 0.3))];
  return pool.slice(0, n);
}

async function main() {
  console.log(`Modus: ${PILOT > 0 ? `PILOT (${PILOT} Fälle, kein Schreiben)` : DRY ? "DRY-RUN" : "LIVE"}\n`);
  console.log("Bootstrapping Admin-Session...");
  await bootstrapSession();
  console.log("Session bereit.\n");

  const { supabase } = await import("../src/integrations/supabase/client");
  const { apiFetch } = await import("../src/lib/apiFetch");

  let query = supabase
    .from("practice_cases")
    .select("id,title,category,short_description,practice_tip,common_mistakes,created_at")
    .eq("status", "published")
    .order("id", { ascending: true });
  const { data: rows, error } = await query;
  if (error) throw error;
  let cases = (rows ?? []) as any[];
  if (SINCE) cases = cases.filter((c) => new Date(c.created_at) >= SINCE);

  if (PILOT > 0) cases = pickPilotSample(cases, PILOT);

  const done = PILOT > 0 ? new Set<string>() : loadProgress();
  const skipped = cases.filter((c) => done.has(c.id)).length;
  cases = cases.filter((c) => !done.has(c.id));

  console.log(`${cases.length} Fälle werden verarbeitet (${skipped} bereits erledigt, übersprungen).\n`);

  const stats = { changed: 0, unchanged: 0, errors: 0 };

  for (let i = 0; i < cases.length; i++) {
    const row = cases[i];
    const label = String(row.title ?? "").slice(0, 60);
    try {
      const res = await apiFetch("/api/ai-condense-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseRow: row }),
      });
      if (!res.ok) {
        stats.errors++;
        const errText = await res.text();
        console.log(`[${i + 1}/${cases.length}] FEHLER (HTTP ${res.status}) bei "${label}": ${errText.slice(0, 200)}`);
        continue;
      }
      const rawResult = (await res.json()) as { practice_tip: unknown; common_mistakes: unknown };
      const commonMistakes = coerceStringArray(rawResult.common_mistakes);
      const practiceTip = typeof rawResult.practice_tip === "string" ? rawResult.practice_tip : null;

      if (commonMistakes === null || practiceTip === null) {
        stats.errors++;
        console.log(`[${i + 1}/${cases.length}] FEHLER (unerwartetes Antwortformat, übersprungen) bei "${label}"`);
        continue;
      }
      const result = { practice_tip: practiceTip, common_mistakes: commonMistakes };

      if (PILOT > 0) {
        console.log(`\n=== [${i + 1}/${cases.length}] ${label} ===`);
        console.log(`--- VORHER Do's (${wordCount(String(row.practice_tip ?? ""))} Wörter gesamt) ---`);
        console.log(row.practice_tip);
        console.log(`--- NACHHER Do's ---`);
        console.log(result.practice_tip);
        console.log(`--- VORHER Don'ts (${(row.common_mistakes ?? []).length} Einträge) ---`);
        console.log(JSON.stringify(row.common_mistakes, null, 2));
        console.log(`--- NACHHER Don'ts (${result.common_mistakes.length} Einträge) ---`);
        console.log(JSON.stringify(result.common_mistakes, null, 2));
        continue;
      }

      const patch = { practice_tip: result.practice_tip, common_mistakes: result.common_mistakes };
      console.log(`[${i + 1}/${cases.length}] gekürzt (Do's, Don'ts: ${(row.common_mistakes ?? []).length}->${result.common_mistakes.length}) :: ${label}`);
      if (!DRY) {
        const { error: updErr } = await (supabase.from("practice_cases") as any).update(patch).eq("id", row.id);
        if (updErr) {
          stats.errors++;
          console.log(`  Speicherfehler: ${updErr.message}`);
        } else {
          stats.changed++;
          done.add(row.id);
          saveProgress(done);
        }
      } else {
        stats.changed++;
      }
    } catch (e) {
      stats.errors++;
      console.log(`[${i + 1}/${cases.length}] FEHLER bei "${label}": ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`--- Zwischenstand: ${JSON.stringify(stats)} ---`);
    }
  }

  console.log(`\n=== Fertig: ${JSON.stringify(stats)} ===`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
