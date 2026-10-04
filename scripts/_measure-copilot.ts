/**
 * Latenzmessung Copilot (Phase 1, Abnahmekriterium "Copilot < 10 s").
 * Fragt den lokalen Dev-Server (127.0.0.1:8080) wie der CaseCopilotDialog:
 * Bearer-Token einer Admin-Session, caseContext + sourceIds aus den Fall-Links.
 * Aufruf: bun run scripts/_measure-copilot.ts [--cases N]
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = "admin@rechtkompass.local";
const BASE = process.env.COPILOT_BASE ?? "http://127.0.0.1:8080";
const n = Number(process.argv[process.argv.indexOf("--cases") + 1]) || 6;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } }) as any;
const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
if (error) throw new Error(error.message);
const { supabase } = await import("../src/integrations/supabase/client");
const { data: sess, error: vErr } = await supabase.auth.verifyOtp({ token_hash: link.properties!.hashed_token, type: "magiclink" });
if (vErr) throw new Error(vErr.message);
const token = sess.session!.access_token;

const { data: greens } = await admin.from("practice_cases").select("id,title,category,short_answer,legal_explanation").eq("workflow_status", "published").eq("legal_review_status", "gruen");
const seen = new Set<string>(); const cases: any[] = [];
for (const c of greens) { if (seen.has(c.category)) continue; seen.add(c.category); cases.push(c); if (cases.length >= n) break; }

// Realistische Rückfragen je Fall (Titel-Präfix → Frage); sonst generische Frage.
const FRAGEN: Array<[string, string]> = [
  ["Schülerin bricht schriftliche Prüfung", "Zählt der Abbruch als nicht bestandener Versuch, und wer entscheidet über eine Wiederholung?"],
  ["Klassenfahrt mit Gebärdensprachdolmets", "Wer trägt die Kosten für die Dolmetscherin, und darf die Teilnahme davon abhängig gemacht werden?"],
  ["Videoaufnahmen von Schülern ohne Elter", "Müssen die Aufnahmen gelöscht werden, und wer ist dafür verantwortlich?"],
  ["Elternbrief mit Leistungskritik vor Ze", "Dürfen Eltern vor der Zeugniskonferenz schriftlich über drohende Minderleistungen informiert werden?"],
  ["Mobbing-Hinweis anonym eingereicht", "Darf die Schule einem anonymen Hinweis nachgehen, und muss der beschuldigte Schüler angehört werden?"],
  ["Eltern fordern Transparenz über Bewert", "Haben Eltern einen Anspruch darauf, die Bewertungskriterien einer Klassenarbeit zu erfahren?"],
  ["Mobbing durch Lehrkraft", "Muss die Lehrkraft vor einem Gespräch mit der Schulleitung angehört werden, und wer führt das Gespräch?"],
];
const frageFuer = (t: string) => FRAGEN.find(([prefix]) => t.startsWith(prefix))?.[1];
const generic = (t: string) => `Welche Pflichten hat die Schulleitung bei „${t.slice(0, 60)}", und wer ist zuständig?`;

async function ask(c: any, scoped: boolean) {
  const { data: links } = await admin.from("case_legal_links").select("legal_sections(source_id)").eq("case_id", c.id);
  const sourceIds = Array.from(new Set((links ?? []).map((r: any) => r.legal_sections?.source_id).filter(Boolean)));
  const body = {
    question: frageFuer(c.title) ?? generic(c.title),
    caseContext: { caseId: c.id, title: c.title, category: c.category, shortAnswer: c.short_answer, legalExplanation: c.legal_explanation },
    filters: scoped && sourceIds.length ? { sourceIds } : undefined,
  };
  const t = Date.now();
  const res = await fetch(`${BASE}/api/legal-copilot-ask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const wall = Date.now() - t;
  const payload = (await res.json()) as any;
  const r = payload.result;
  if (!r) return { wall, error: payload.error ?? `HTTP ${res.status}` };
  const s = r.statistics ?? {};
  const unanswered = r.answer?.answered ? "" : (r.answer?.reasonUnanswered ?? "").slice(0, 90);
  return { wall, answered: r.answer?.answered, retrievalMs: s.retrievalMs, llmMs: s.llmMs, totalMs: s.totalMs, hits: s.hits, used: s.usedHits, cites: r.answer?.citations?.length, outTok: s.tokens?.completionTokens ?? s.tokens?.output ?? null, sources: sourceIds.length, grund: unanswered };
}

const rows: any[] = [];
for (const c of cases) {
  const a = await ask(c, true);
  rows.push({ fall: c.title.slice(0, 38), kat: c.category.slice(0, 14), modus: "eingegrenzt", ...a });
  console.log(rows.at(-1));
}
for (const c of cases.slice(0, 2)) {
  const a = await ask(c, false);
  rows.push({ fall: c.title.slice(0, 38), kat: c.category.slice(0, 14), modus: "offen", ...a });
  console.log(rows.at(-1));
}
const ok = rows.filter((r) => !r.error);
const med = (k: string) => { const v = ok.map((r) => r[k]).filter((x) => typeof x === "number").sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
console.log("\n=== Zusammenfassung ===");
console.log(`Aufrufe: ${rows.length}, Fehler: ${rows.length - ok.length}, beantwortet: ${ok.filter((r) => r.answered).length}`);
console.log(`Median Gesamt (Browser-Sicht): ${med("wall")} ms | Retrieval: ${med("retrievalMs")} ms | KI-Antwort: ${med("llmMs")} ms | max Gesamt: ${Math.max(...ok.map((r) => r.wall))} ms`);
await supabase.auth.signOut();
