/**
 * Entscheidungsbäume einzelner Fälle neu erzeugen (über /api/ai-draft-decision-tree
 * des laufenden Dev-Servers) und nur übernehmen, wenn der neue Baum strukturell
 * vollständig ist; sonst bleibt der alte Baum.
 *
 * Aufruf: bun run scripts/_regen-decision-trees.ts <fall-id> [<fall-id> ...]
 */
import { createClient } from "@supabase/supabase-js";
import { parseCuratedTree, validateCuratedTree } from "../src/lib/decisionTree";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8080";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
for (const id of process.argv.slice(2)) {
  const { data: caseRow } = await db.from("practice_cases").select("*").eq("id", id).single();
  const res = await fetch(`${API}/api/ai-draft-decision-tree`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseRow: { ...caseRow, decision_tree: null } }) });
  if (!res.ok) { console.log(id.slice(0, 8), "FEHLER", res.status, (await res.text()).slice(0, 200)); continue; }
  const { tree } = (await res.json()) as { tree: any };
  const parsed = parseCuratedTree(tree);
  const ok = !!parsed && Object.keys(parsed.steps).length > 0 && Object.keys(parsed.results).length > 0 && validateCuratedTree(parsed).valid;
  if (!ok) { console.log(id.slice(0, 8), "Baum unvollständig - alter Baum bleibt"); continue; }
  const meta = tree.meta ?? {};
  const { error } = await db.from("practice_cases").update({ decision_tree: { ...tree, meta: { ...meta, status: "approved", version: (caseRow.decision_tree?.meta?.version ?? 1) + 1 } } }).eq("id", id);
  if (error) throw error;
  console.log(id.slice(0, 8), `${Object.keys(tree.steps).length} Fragen, ${Object.keys(tree.results).length} Ergebnisse`);
}
