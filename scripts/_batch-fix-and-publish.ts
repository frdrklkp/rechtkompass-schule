/**
 * Batch-Reparatur + Massen-Veröffentlichung (Nutzeranforderung 2026-08-14).
 *
 * Diagnose: von 288 nicht veröffentlichten Fällen hatten 58% (167) einen
 * Hard Blocker - unabhängig vom Score. Die zwei Hauptursachen:
 *   - 117 Fälle mit weniger als 5 "Do's" (practice_tip)
 *   - 80 Fälle ganz ohne zugeordnete Rechtsgrundlage
 * Der Score selbst war meist kein Problem (Ø 90.3/100, nur 8% unter 80).
 *
 * Statt die App-eigene Veröffentlichungsschwelle abzusenken, werden die
 * Ursachen automatisiert repariert:
 *   Phase 1: Rechtsgrundlagen-Matching erneut laufen lassen für Fälle ohne
 *            jede Zuordnung (evaluateAndMatchLegalSections via
 *            completePracticeCase, source: "batch_fix").
 *   Phase 2: practice_tip per KI auf mindestens 5 konkrete Do's ergänzen
 *            (refineCaseField, gleicher Endpunkt/Prompt wie die manuelle
 *            Redaktions-Nachbesserung im Qualitätsmanager).
 *   Phase 3: alle Fälle neu bewerten und GENAU die als "veröffentlichungsbereit"
 *            markierten (App-eigene Definition: score>=90, 0 Hard-Blocker,
 *            >=5 Do's, >=1 Rechtsgrundlage - siehe evaluateCase() in
 *            qualityEngine.ts) durch submit->approve->publish schieben
 *            (Tier "internal"). Fälle, die auch nach Reparatur keine
 *            Rechtsgrundlage finden, bleiben bewusst im Entwurf.
 *
 * Aufruf: bun run scripts/_batch-fix-and-publish.ts
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
  const { loadCaseForEvaluation } = await import("../src/lib/qualityEngine");
  const { completePracticeCase } = await import("../src/lib/casePipeline.completion");
  const { refineCaseField } = await import("../src/lib/casePipeline");
  const { EditorialWorkflowService } = await import("../src/services/editorial/EditorialWorkflowService");

  const { data: rows, error } = await supabase
    .from("practice_cases")
    .select("id,title,workflow_status")
    .neq("workflow_status", "published");
  if (error) throw error;
  const targets = (rows ?? []) as Array<{ id: string; title: string; workflow_status: string }>;
  console.log(`${targets.length} nicht veröffentlichte Fälle gefunden.\n`);

  console.log("=== Phase 1+2: Bewerten und reparieren ===\n");
  const stats = { legalFixed: 0, legalStillMissing: 0, doFixed: 0, doStillShort: 0, skippedOk: 0, errors: 0 };
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const label = t.title.slice(0, 55);
    try {
      let ev = await loadCaseForEvaluation(t.id);

      if (ev.counts.legalCount === 0) {
        try {
          await completePracticeCase(t.id, {
            runLegalMatching: true,
            runKeywordMatching: false,
            runTemplateMatching: false,
            runSimilarityCheck: false,
            runQualityEvaluation: false,
            source: "batch_fix",
          });
        } catch (e) {
          console.log(`  [${i + 1}/${targets.length}] Rechtsgrundlagen-Matching Fehler bei "${label}": ${e instanceof Error ? e.message : e}`);
        }
      }

      // Nach evtl. Rechtsgrundlagen-Fix neu laden für aktuellen doCount-Stand.
      ev = await loadCaseForEvaluation(t.id);
      if (ev.counts.doCount < 5) {
        const fix = await refineCaseField(
          t.id,
          "practice_tip",
          "Automatisierte Nachbesserung (Batch): mindestens 5 konkrete, fallbezogene Do's ergänzen.",
        );
        if (!fix.ok) console.log(`  [${i + 1}/${targets.length}] Do's-Nachbesserung Fehler bei "${label}": ${fix.message}`);
      }

      // Finale Kontrolle nach beiden möglichen Fixes.
      ev = await loadCaseForEvaluation(t.id);
      const legalOk = ev.counts.legalCount > 0;
      const doOk = ev.counts.doCount >= 5;
      if (legalOk && doOk) stats.skippedOk++;
      if (!legalOk) stats.legalStillMissing++; else if (ev.counts.legalCount > 0) stats.legalFixed++;
      if (!doOk) stats.doStillShort++; else stats.doFixed++;

      console.log(`[${i + 1}/${targets.length}] score=${ev.score} legal=${ev.counts.legalCount} dos=${ev.counts.doCount} blocker=${ev.hardBlockers.length} bereit=${ev.publicationReady} :: ${label}`);
    } catch (e) {
      stats.errors++;
      console.log(`  [${i + 1}/${targets.length}] FEHLER bei "${label}": ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`--- Zwischenstand: ${JSON.stringify(stats)} ---`);
    }
  }
  console.log(`\n=== Phase 1+2 abgeschlossen: ${JSON.stringify(stats)} ===\n`);

  console.log("=== Phase 3: Veröffentlichungsbereite Fälle durch den Workflow schieben ===\n");
  const { data: freshRows } = await supabase
    .from("practice_cases")
    .select("id,title,workflow_status,decision_tree")
    .neq("workflow_status", "published");
  const stats3 = { published: 0, notReady: 0, error: 0 };
  const fresh = (freshRows ?? []) as any[];
  for (let i = 0; i < fresh.length; i++) {
    const row = fresh[i];
    const label = String(row.title ?? "").slice(0, 55);
    try {
      const ev = await loadCaseForEvaluation(row.id);
      if (!ev.publicationReady) { stats3.notReady++; continue; }

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
          comment: "Automatisierte Freigabe (Batch): Score/Blocker-Kriterien der App erfüllt (score>=90, keine Hard-Blocker, >=5 Do's, >=1 Rechtsgrundlage).",
        });
      }
      await EditorialWorkflowService.publish({ caseId: row.id, publicationTier: "internal" });
      stats3.published++;
      console.log(`[${i + 1}/${fresh.length}] veröffentlicht: "${label}"`);
    } catch (e) {
      stats3.error++;
      console.log(`[${i + 1}/${fresh.length}] FEHLER bei "${label}": ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`--- Zwischenstand Phase 3: ${JSON.stringify(stats3)} ---`);
    }
  }
  console.log(`\n=== Phase 3 abgeschlossen: ${JSON.stringify(stats3)} ===`);
  console.log("\n=== GESAMT-ZUSAMMENFASSUNG ===");
  console.log(`Reparatur: ${JSON.stringify(stats)}`);
  console.log(`Veröffentlichung: ${JSON.stringify(stats3)}`);
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
