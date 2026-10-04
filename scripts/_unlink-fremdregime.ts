/**
 * Phase 1, Paket C: themenfremde Verknüpfungen aus roten Fällen entfernen
 * (04.10.2026). Entfernt nur Links auf Normwerke eines FREMDEN Regimes, die für
 * Berufskolleg-Alltagsfälle nicht einschlägig sind (Abitur/GOSt/Oberstufen-
 * Kolleg, Unwetterwarnung, Fortbildung, Reisende-Kinder-Erlass). Lässt jedem
 * Fall mindestens einen Link. Aufruf:
 *   IDS_FILE=<json> bun run scripts/_unlink-fremdregime.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const dry = process.argv.includes("--dry-run");
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const FREMD = /Unwetterwarnung|Abiturprüfung|Oberstufen-?Kolleg|13-32 Nr|13-51 Nr|APO-GOSt|beruflich Reisender|Aus- und Fortbildung von Lehr/i;

const ids: string[] = JSON.parse(readFileSync(process.env.IDS_FILE!, "utf8"));
let total = 0;
for (let i = 0; i < ids.length; i += 30) {
  const { data: rows } = await db.from("case_legal_links").select("id,case_id,legal_sections(reference,legal_sources(title))").in("case_id", ids.slice(i, i + 30));
  const byCase = new Map<string, any[]>();
  for (const r of rows ?? []) byCase.set(r.case_id, [...(byCase.get(r.case_id) ?? []), r]);
  for (const [caseId, links] of byCase) {
    const bad = links.filter((l) => FREMD.test(l.legal_sections?.legal_sources?.title ?? ""));
    if (!bad.length || links.length - bad.length < 1) continue;
    total += bad.length;
    console.log(`${caseId.slice(0, 8)}: -${bad.length} (${bad.map((b) => b.legal_sections.legal_sources.title.slice(0, 40)).join("; ")}) verbleibend ${links.length - bad.length}`);
    if (!dry) { const { error } = await db.from("case_legal_links").delete().in("id", bad.map((b) => b.id)); if (error) throw new Error(error.message); }
  }
}
console.log(`${dry ? "Trockenlauf: " : ""}${total} Fremd-Links ${dry ? "würden entfernt" : "entfernt"}.`);
