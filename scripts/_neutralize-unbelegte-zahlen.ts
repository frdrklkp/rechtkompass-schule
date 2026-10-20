/**
 * Unbelegte Zahlen/Fristen im Bestand neutral umformulieren (20.10.2026).
 * Nutzt citationIntegrity (Befund) und quantityNeutralizer (Neufassung mit
 * deterministischer Abnahme). Ohne --apply nur Vorschau.
 *
 * Aufruf: bun run scripts/_neutralize-unbelegte-zahlen.ts [--apply] [--limit N] [--only-ids a,b] [--backup datei.json]
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { checkCaseIntegrity, INTEGRITY_FIELDS } from "../src/lib/citationIntegrity";
import { loadIntegrityContext } from "../src/lib/integrityContext";
import { neutralizeQuantities, NEUTRALIZE_SCHEMA, NEUTRALIZE_SYSTEM, type Rewriter } from "../src/lib/quantityNeutralizer";
import { AIProviderFactory } from "../src/services/editorial/ai/providers/AIProviderFactory";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const LIMIT = Number(arg("--limit") ?? Infinity);
const ONLY = arg("--only-ids")?.split(",");
const BACKUP = arg("--backup") ?? "zahlen-backup.json";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const provider = AIProviderFactory.get("anthropic-native");

const rewrite: Rewriter = async (items) => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await provider.complete({
        taskId: "neutralize-quantities", model: "anthropic/claude-sonnet-5",
        messages: [{ role: "system", content: NEUTRALIZE_SYSTEM }, { role: "user", content: JSON.stringify({ items }) }],
        jsonSchema: { name: "neutralized_sentences", schema: NEUTRALIZE_SCHEMA }, maxTokens: 8000, signal: AbortSignal.timeout(240_000),
      } as any);
      return ((res.json as any)?.items ?? []) as Array<{ i: number; text: string }>;
    } catch (e: any) { if (attempt === 2) throw e; }
  }
  return [];
};

const ctx = await loadIntegrityContext(db);
let q = db.from("practice_cases").select(`id,title,${INTEGRITY_FIELDS.join(",")}`).eq("status", "published");
if (ONLY) q = q.in("id", ONLY);
const { data: cases, error } = await q;
if (error) throw error;
const { data: links } = await db.from("case_legal_links").select("case_id,legal_section_id").in("case_id", cases.map((c: any) => c.id));
const linked = new Map<string, string[]>();
for (const l of links ?? []) linked.set(l.case_id, [...(linked.get(l.case_id) ?? []), l.legal_section_id]);

const todo = cases.map((c: any) => ({ c, r: checkCaseIntegrity(c, ctx.lookup, ctx.evidenceFor(c, linked.get(c.id) ?? [])) }))
  .filter((x: any) => x.r.zahlen.length).slice(0, LIMIT);
console.log(`${todo.length} Fälle mit unbelegten Zahlen`);

const backup: any[] = [];
const stats = { cases: 0, replaced: 0, rejected: 0, failed: 0 };
const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const { c, r } = queue.shift()!;
    const unbelegt = new Set<string>(r.zahlen.map((z: any) => `${z.value}|${z.unit}`));
    try {
      const res = await neutralizeQuantities(c, unbelegt, rewrite);
      stats.cases++; stats.replaced += res.replaced; stats.rejected += res.rejected.length;
      if (!APPLY) {
        console.log(`\n## ${c.id.slice(0, 8)} ${c.title.slice(0, 60)} | ersetzt ${res.replaced}, verworfen ${res.rejected.length}`);
        for (const f of Object.keys(res.patch)) {
          const before = JSON.stringify(c[f]); const after = JSON.stringify(res.patch[f]);
          if (before === after) continue;
          // erste Abweichung zeigen
          let i = 0; while (i < before.length && before[i] === after[i]) i++;
          console.log(`  [${f}] vorher: …${before.slice(Math.max(0, i - 60), i + 120)}…\n  [${f}] nachher: …${after.slice(Math.max(0, i - 60), i + 120)}…`);
        }
        for (const x of res.rejected.slice(0, 2)) console.log(`  verworfen: "${x.sentence.slice(0, 120)}" -> "${x.rewritten.slice(0, 120)}"`);
        continue;
      }
      if (!Object.keys(res.patch).length) continue;
      backup.push({ id: c.id, ...Object.fromEntries(Object.keys(res.patch).map((f) => [f, c[f]])) });
      const { error: e2 } = await db.from("practice_cases").update({ ...res.patch, updated_at: new Date().toISOString() }).eq("id", c.id);
      if (e2) throw e2;
      if (stats.cases % 20 === 0) { writeFileSync(BACKUP, JSON.stringify(backup)); console.log(`${stats.cases}/${todo.length}`); }
    } catch (e: any) { stats.failed++; console.log("FEHLER", c.id.slice(0, 8), e.message?.slice(0, 200)); }
  }
}));
if (APPLY) writeFileSync(BACKUP, JSON.stringify(backup));
console.log(APPLY ? "ANGEWENDET" : "VORSCHAU", stats);
