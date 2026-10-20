/**
 * Bestandsscan mit src/lib/citationIntegrity.ts (20.10.2026): prüft alle
 * veröffentlichten Fälle auf nicht existierende Absätze/Sätze und auf Zahlen
 * mit Einheit, die in keiner verknüpften oder zitierten Norm stehen. Schreibt
 * nur einen Bericht, ändert nichts.
 *
 * Aufruf: bun run scripts/_scan-citation-integrity.ts [--out bericht.json] [--all]
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { checkCaseIntegrity, INTEGRITY_FIELDS } from "../src/lib/citationIntegrity";
import { loadIntegrityContext } from "../src/lib/integrityContext";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : "citation-integrity-report.json";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

async function all<T>(table: string, select: string, filter: (q: any) => any = (q) => q): Promise<T[]> {
  let out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(db.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data);
    if (data.length < 1000) break;
  }
  return out;
}

const ctx = await loadIntegrityContext(db);
const cases = await all<any>("practice_cases", `id,title,status,${INTEGRITY_FIELDS.join(",")}`, (q) => (args.includes("--all") ? q : q.eq("status", "published")));
const links = await all<any>("case_legal_links", "case_id,legal_section_id");
const linked = new Map<string, string[]>();
for (const l of links) linked.set(l.case_id, [...(linked.get(l.case_id) ?? []), l.legal_section_id]);

const report: any[] = [];
let abs = 0, zahl = 0;
for (const c of cases) {
  const r = checkCaseIntegrity(c, ctx.lookup, ctx.evidenceFor(c, linked.get(c.id) ?? []));
  if (!r.absatz.length && !r.zahlen.length) continue;
  abs += r.absatz.length; zahl += r.zahlen.length;
  report.push({ id: c.id, title: c.title, ...r });
}
writeFileSync(OUT, JSON.stringify(report, null, 1));
const byLaw: Record<string, number> = {};
for (const r of report) for (const a of r.absatz) { const k = `${a.lawAbbrev} § ${a.paragraph} Abs. ${a.cited} (vorhanden ${a.vorhanden})`; byLaw[k] = (byLaw[k] ?? 0) + 1; }
console.log(`Fälle geprüft: ${cases.length} | mit Befund: ${report.length} | Absatz/Satz: ${abs} | unbelegte Zahlen: ${zahl}`);
console.log("Häufigste Absatzbefunde:", Object.entries(byLaw).sort((a, b) => b[1] - a[1]).slice(0, 15));
console.log(`Bericht: ${OUT}`);
