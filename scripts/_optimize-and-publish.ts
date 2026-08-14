/**
 * Vollautomatisierte Qualitäts-Optimierung + Massen-Veröffentlichung
 * (Nutzeranforderung 2026-08-14): alle Praxisfälle auf Score >= 95 bringen
 * und automatisch veröffentlichen, ohne manuelle Einzelfall-Arbeit.
 *
 * Nutzt bewusst die BEREITS VORHANDENE Fix-Engine (qualityFixManager.ts /
 * fixCaseQualityTasks) statt eigener Nachbauten - dieselbe Logik, die auch
 * der "Qualitätsmanager" in der Admin-UI verwendet:
 *   - ai_content-Aufgaben (fehlende Do's, FAQ, Checkliste, Doku, Don'ts,
 *     Rechtserläuterung...) -> refineCaseField() (KI-Feld-Nachbesserung)
 *   - alle anderen fixbaren Aufgaben (Rechtsgrundlagen/Schlagwörter/
 *     Vorlagen/Ähnlichkeitsprüfung) -> EIN completePracticeCase()-Lauf
 *
 * Ablauf pro Runde: für jeden Fall unter dem Ziel-Score die aktuell
 * fixbaren Quality-Tasks ermitteln, fixCaseQualityTasks() ausführen, neu
 * bewerten. Bis zu MAX_ROUNDS Runden oder bis keine fixbaren Aufgaben mehr
 * offen sind. Fälle, die den Score trotzdem nicht erreichen (z.B. weil nur
 * "manual"-Aufgaben offen sind, die redaktionelle Prüfung erfordern),
 * bleiben bewusst im Entwurf - keine Erzwingung.
 *
 * Danach: alle Fälle mit score>=TARGET_SCORE UND 0 Hard-Blockern durch den
 * Redaktions-Workflow schieben (submit -> approve -> publish, Tier
 * "internal").
 *
 * Aufruf: bun run scripts/_optimize-and-publish.ts
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
const TARGET_SCORE = 95;
const MAX_ROUNDS = 5;

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
  console.log("Bootstrapping Admin-Session...");
  await bootstrapSession();
  console.log("Session bereit.\n");

  const { supabase } = await import("../src/integrations/supabase/client");
  const { loadCaseForEvaluation, deriveQualityTasks } = await import("../src/lib/qualityEngine");
  const { fixCaseQualityTasks } = await import("../src/lib/qualityFixManager");
  const { EditorialWorkflowService } = await import("../src/services/editorial/EditorialWorkflowService");

  const { data: rows, error } = await supabase
    .from("practice_cases")
    .select("id,title,workflow_status")
    .neq("workflow_status", "published");
  if (error) throw error;
  let caseIds = (rows ?? []).map((r: any) => r.id as string);
  console.log(`${caseIds.length} nicht veröffentlichte Fälle als Ausgangsmenge.\n`);

  console.log(`=== Optimierung auf Score >= ${TARGET_SCORE} (max. ${MAX_ROUNDS} Runden) ===\n`);
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    console.log(`--- Runde ${round}/${MAX_ROUNDS}: bewerte ${caseIds.length} Fälle ---`);
    const tasks: any[] = [];
    const stillOpen: string[] = [];
    let alreadyGood = 0;

    for (let i = 0; i < caseIds.length; i += 10) {
      const batch = caseIds.slice(i, i + 10);
      const evals = await Promise.all(batch.map((id) => loadCaseForEvaluation(id).catch(() => null)));
      for (const ev of evals) {
        if (!ev) continue;
        if (ev.score >= TARGET_SCORE && ev.hardBlockers.length === 0) { alreadyGood++; continue; }
        const fixable = deriveQualityTasks(ev).filter((t) => t.fixable);
        if (fixable.length > 0) {
          tasks.push(...fixable);
          stillOpen.push(ev.caseId);
        }
      }
    }

    console.log(`  bereits >= ${TARGET_SCORE} & 0 Blocker: ${alreadyGood} | fixbare Aufgaben offen bei ${stillOpen.length} Fällen (${tasks.length} Aufgaben gesamt)`);
    if (tasks.length === 0) {
      console.log("  Keine fixbaren Aufgaben mehr - Optimierung abgeschlossen.\n");
      break;
    }

    let lastLog = Date.now();
    const report = await fixCaseQualityTasks(tasks, {
      onProgress: (p) => {
        if (Date.now() - lastLog > 15000) {
          console.log(`  Fortschritt Runde ${round}: ${p.processed}/${p.total} (✓${p.succeeded} ✗${p.failed} ⚠${p.needsReview})`);
          lastLog = Date.now();
        }
      },
    });
    console.log(`  Runde ${round} fertig: ${JSON.stringify(report.summary)}\n`);

    // Nur Faelle, die noch nicht am Ziel sind, in die naechste Runde nehmen.
    caseIds = stillOpen;
  }

  console.log("=== Finale Bewertung + Veröffentlichung ===\n");
  const { data: freshRows } = await supabase
    .from("practice_cases")
    .select("id,title,workflow_status")
    .neq("workflow_status", "published");
  const fresh = (freshRows ?? []) as any[];

  const stats = { published: 0, notReady: 0, error: 0 };
  const remaining: Array<{ title: string; score: number; blockers: string[] }> = [];

  for (let i = 0; i < fresh.length; i++) {
    const row = fresh[i];
    const label = String(row.title ?? "").slice(0, 55);
    try {
      const ev = await loadCaseForEvaluation(row.id);
      if (ev.score < TARGET_SCORE || ev.hardBlockers.length > 0) {
        stats.notReady++;
        remaining.push({ title: row.title, score: ev.score, blockers: ev.hardBlockers });
        continue;
      }

      if (row.workflow_status === "draft") {
        await EditorialWorkflowService.submitForReview({ caseId: row.id });
      }
      const { data: reviewRows } = await (supabase.from("case_reviews") as any)
        .select("id")
        .eq("case_id", row.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      const reviewId = (reviewRows ?? [])[0]?.id;
      if (reviewId) {
        await EditorialWorkflowService.decideReview({
          reviewId,
          decision: "approved",
          comment: `Automatisierte Freigabe (Batch): Score ${ev.score}/100, keine Hard-Blocker.`,
        });
      }
      await EditorialWorkflowService.publish({ caseId: row.id, publicationTier: "internal" });
      stats.published++;
      console.log(`[${i + 1}/${fresh.length}] veröffentlicht (Score ${ev.score}): "${label}"`);
    } catch (e) {
      stats.error++;
      console.log(`[${i + 1}/${fresh.length}] FEHLER bei "${label}": ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 20 === 0) console.log(`--- Zwischenstand Veröffentlichung: ${JSON.stringify(stats)} ---`);
  }

  console.log(`\n=== GESAMT-ZUSAMMENFASSUNG ===`);
  console.log(JSON.stringify(stats));
  console.log(`\n${remaining.length} Fälle erreichen Score ${TARGET_SCORE} nicht (bleiben im Entwurf):`);
  remaining
    .sort((a, b) => a.score - b.score)
    .slice(0, 40)
    .forEach((r) => console.log(`  Score ${r.score} | Blocker: ${r.blockers.join("; ") || "-"} | ${r.title.slice(0, 55)}`));
  if (remaining.length > 40) console.log(`  ... und ${remaining.length - 40} weitere.`);

  process.exit(0);
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
