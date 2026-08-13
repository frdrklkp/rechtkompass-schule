/**
 * Zweiphasiges Backfill für Entscheidungsbäume (Fund 2026-08-13):
 *
 * Phase 1: Für jeden Fall mit unvollständigem decision_tree (fehlendes
 *   "results" und/oder "meta", oder strukturell ungültig) wird der Baum
 *   über /api/ai-draft-decision-tree neu generiert (jetzt mit maxTokens:8192
 *   statt des zu knappen Standards von 4096, der das Abschneiden verursacht
 *   hatte) und gespeichert.
 * Phase 2: Für jeden Fall mit strukturell validem Baum (parseCuratedTree +
 *   validateCuratedTree bestehen), der noch nicht freigegeben ist, wird
 *   meta.status von "draft" auf "approved" gesetzt - explizit vom Nutzer
 *   autorisiert (2026-08-13), ersetzt die sonst manuelle Redaktionsfreigabe
 *   im DecisionTreeAdminEditor.
 *
 * Aufruf: bun run scripts/_backfill-decision-trees.ts
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
  const { updateCase } = await import("../src/lib/coreBuilder");
  const { parseCuratedTree, validateCuratedTree } = await import("../src/lib/decisionTree");

  const { data: rows, error } = await supabase
    .from("practice_cases")
    .select("id,title,category,short_description,short_answer,immediate_actions,recommendation,responsibilities,practice_tip,common_mistakes,checklist,documentation,legal_explanation,faq,decision_tree");
  if (error) throw error;

  function isComplete(tree: unknown): boolean {
    const parsed = parseCuratedTree(tree);
    if (!parsed) return false;
    if (Object.keys(parsed.results).length === 0) return false;
    return validateCuratedTree(parsed).valid;
  }

  const incomplete = (rows ?? []).filter((r: any) => !isComplete(r.decision_tree));
  console.log(`=== Phase 1: ${incomplete.length} von ${rows?.length ?? 0} Faellen mit unvollstaendigem Baum ===\n`);

  const stats1 = { regenerated: 0, stillIncomplete: 0, error: 0 };
  for (let i = 0; i < incomplete.length; i++) {
    const caseRow = incomplete[i] as any;
    const label = String(caseRow.title ?? "").slice(0, 60);
    try {
      const treeRes = await fetch(`${_API_ORIGIN}/api/ai-draft-decision-tree`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseRow }),
      });
      if (!treeRes.ok) throw new Error(await treeRes.text());
      const { tree } = (await treeRes.json()) as { tree: unknown };
      if (!tree) throw new Error("kein Baum in Antwort");
      await updateCase(caseRow.id, { decision_tree: tree } as any);
      const ok = isComplete(tree);
      if (ok) stats1.regenerated++; else stats1.stillIncomplete++;
      console.log(`[${i + 1}/${incomplete.length}] ${ok ? "OK" : "WEITERHIN UNVOLLSTAENDIG"}: ${label}`);
    } catch (e) {
      stats1.error++;
      console.log(`[${i + 1}/${incomplete.length}] FEHLER: ${label}: ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`--- Zwischenstand Phase 1: ${stats1.regenerated} ok, ${stats1.stillIncomplete} weiterhin unvollstaendig, ${stats1.error} Fehler ---`);
    }
  }
  console.log(`\n=== Phase 1 abgeschlossen: ${JSON.stringify(stats1)} ===\n`);

  console.log("=== Phase 2: Freigabe aller strukturell validen Baeume ===\n");
  const { data: freshRows, error: freshErr } = await supabase
    .from("practice_cases")
    .select("id,title,decision_tree");
  if (freshErr) throw freshErr;

  const stats2 = { approved: 0, alreadyApproved: 0, skippedInvalid: 0, error: 0 };
  for (const row of (freshRows ?? []) as any[]) {
    const parsed = parseCuratedTree(row.decision_tree);
    if (!parsed || Object.keys(parsed.results).length === 0 || !validateCuratedTree(parsed).valid) {
      stats2.skippedInvalid++;
      continue;
    }
    const currentMeta = (row.decision_tree as any)?.meta ?? {};
    if (currentMeta.status === "approved") {
      stats2.alreadyApproved++;
      continue;
    }
    try {
      const nextTree = {
        ...(row.decision_tree as Record<string, unknown>),
        meta: { ...currentMeta, status: "approved", version: currentMeta.version ?? 1 },
      };
      await updateCase(row.id, { decision_tree: nextTree } as any);
      stats2.approved++;
    } catch (e) {
      stats2.error++;
      console.log(`FEHLER bei Freigabe von "${String(row.title).slice(0, 50)}": ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n=== Phase 2 abgeschlossen: ${JSON.stringify(stats2)} ===`);
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
