/**
 * Gegenprüfung der Rechtsprechungs-Antworten (20.10.2026).
 *
 * _answer-flags-with-caselaw.ts prüft Zitat, Aktenzeichen und Zahlen
 * deterministisch, nicht aber, ob die Antwort GENAU die gestellte Frage
 * beantwortet (Fund: Frage nach Rückfrage beim Arzt, Antwort zur Nachfrage
 * bei den Eltern). Hier beurteilt ein zweiter, unabhängiger Aufruf je
 * FAQ-Paar nur diese eine Frage. Fällt die Antwort durch: FAQ-Eintrag und
 * Verknüpfung entfernen, die zugehörige offene Rechtsfrage wieder öffnen.
 *
 * Aufruf: bun run scripts/_check-caselaw-answers.ts [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { AIProviderFactory } from "../src/services/editorial/ai/providers/AIProviderFactory";

const APPLY = process.argv.includes("--apply");
const ADMIN = "85d423d1-cde1-47b2-bc27-f9383621b15a";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const llm = AIProviderFactory.get("anthropic-native");
const FILE = /\b\d{1,3} [A-Z][A-Za-z]{0,3} \d{1,6}\/\d{2}\b/g;

const { data: links } = await db.from("case_legal_links").select("id,case_id,legal_section_id,explanation").like("explanation", "Rechtsprechung zur Frage:%");
const caseIds = [...new Set(links.map((l: any) => l.case_id))] as string[];
const { data: cases } = await db.from("practice_cases").select("id,title,faq").in("id", caseIds);
const pairs: Array<{ caseId: string; q: string; a: string }> = [];
for (const c of cases) for (const f of Array.isArray(c.faq) ? c.faq : []) if (String(f.a ?? "").match(FILE)) pairs.push({ caseId: c.id, q: f.q, a: f.a });
console.log(`Antworten mit Gerichtszitat: ${pairs.length} in ${cases.length} Fällen`);

const SYSTEM = "Du prüfst Frage-Antwort-Paare aus Praxisfällen für Lehrkräfte. Entscheide je Paar nur: Beantwortet die Antwort GENAU die gestellte Frage (nicht nur das Thema, nicht eine verwandte andere Frage)? fits=true oder false, Grund in höchstens 15 Wörtern.";
const SCHEMA = { type: "object", additionalProperties: false, properties: { items: { type: "array", items: { type: "object", additionalProperties: false, properties: { i: { type: "integer" }, fits: { type: "boolean" }, why: { type: "string" } }, required: ["i", "fits", "why"] } } }, required: ["items"] };
const verdict = new Map<number, { fits: boolean; why: string }>();
for (let k = 0; k < pairs.length; k += 20) {
  const batch = pairs.slice(k, k + 20).map((p, j) => ({ i: k + j, frage: p.q, antwort: p.a }));
  const res = await llm.complete({ taskId: "check-caselaw-answers", model: "anthropic/claude-sonnet-5", messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ items: batch }) }], jsonSchema: { name: "fit_check", schema: SCHEMA }, maxTokens: 4000, signal: AbortSignal.timeout(180_000) } as any);
  for (const it of ((res.json as any)?.items ?? [])) verdict.set(it.i, { fits: !!it.fits, why: String(it.why ?? "") });
}
const bad = pairs.map((p, i) => ({ ...p, v: verdict.get(i) })).filter((p) => p.v && !p.v.fits);
console.log(`passt nicht: ${bad.length}`);
for (const b of bad) console.log(`  ${b.caseId.slice(0, 8)} | ${b.q.slice(0, 90)} | ${b.v!.why}`);
if (!APPLY) process.exit(0);

const words = (s: string) => new Set(s.toLowerCase().match(/[a-zäöüß]{5,}/g) ?? []);
let reopened = 0;
for (const b of bad) {
  const c = cases.find((x: any) => x.id === b.caseId);
  c.faq = c.faq.filter((f: any) => !(f.q === b.q && f.a === b.a));
  await db.from("practice_cases").update({ faq: c.faq }).eq("id", c.id);
  const files = b.a.match(FILE) ?? [];
  const link = links.find((l: any) => l.case_id === c.id && l.explanation.includes(b.q.slice(0, 60)));
  if (link) {
    // Verknüpfung nur entfernen, wenn keine andere verbliebene Antwort dieselbe Entscheidung zitiert
    const stillUsed = c.faq.some((f: any) => files.some((fno: string) => String(f.a).includes(fno)));
    if (!stillUsed) await db.from("case_legal_links").delete().eq("id", link.id);
  }
  const { data: fl } = await db.from("case_legal_review_flags").select("id,reason").eq("case_id", c.id).eq("resolved_by", ADMIN).gte("resolved_at", "2026-10-20T14:00:00Z");
  const W = words(b.q); let best: any = null, bs = 0;
  for (const f of fl ?? []) { const F = words(f.reason); let n = 0; for (const w of W) if (F.has(w)) n++; const s = n / Math.max(1, W.size); if (s > bs) { bs = s; best = f; } }
  if (best && bs >= 0.4) { await db.from("case_legal_review_flags").update({ resolved_at: null, resolved_by: null }).eq("id", best.id); reopened++; }
}
console.log("ANGEWENDET", { entfernt: bad.length, wiederGeoeffnet: reopened });
