/**
 * Offene Rechtsfragen mit Rechtsprechung beantworten (20.10.2026).
 *
 * Je veröffentlichtem Fall: jede offene Rechtsfrage (case_legal_review_flags)
 * per Vektorsuche gegen die importierten Gerichtsentscheidungen
 * (scripts/_import-rechtsprechung.ts) suchen; ein Sprachmodell entscheidet,
 * ob eine Fundstelle die Frage für NRW beantwortet, und formuliert eine kurze
 * Antwort mit Gericht, Datum, Aktenzeichen und Randnummer. Angenommen wird
 * nur, was deterministisch prüfbar stimmt:
 *   - das wörtliche Zitat steht in der Fundstelle,
 *   - die Antwort nennt das Aktenzeichen der Fundstelle,
 *   - die Antwort enthält keine Zahl mit Einheit, die nicht in der Fundstelle steht.
 * Dann: FAQ-Eintrag (Frage + Antwort) ergänzen, Fundstelle als Rechtsgrundlage
 * verknüpfen, offene Frage schließen.
 *
 * Aufruf: bun run scripts/_answer-flags-with-caselaw.ts [--apply] [--limit N] [--only-ids a,b] [--backup datei.json]
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { AIProviderFactory } from "../src/services/editorial/ai/providers/AIProviderFactory";
import { EmbeddingProviderFactory } from "../src/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";
import { extractQuantities } from "../src/lib/citationIntegrity";
import { sentenceStart } from "../src/lib/caseCitationCoverage";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const LIMIT = Number(arg("--limit") ?? Infinity);
const ONLY = arg("--only-ids")?.split(",");
const BACKUP = arg("--backup") ?? "caselaw-answers-backup.json";
const ADMIN = "85d423d1-cde1-47b2-bc27-f9383621b15a";
const EMBED_MODEL = "openai/text-embedding-3-small";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const llm = AIProviderFactory.get("anthropic-native");
const embedder = EmbeddingProviderFactory.forModel(EMBED_MODEL);

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

const courtSources = await all<any>("legal_sources", "id,title,short_name,version_label,official_url", (q) => q.eq("source_type_v2", "court_decision").eq("status", "active"));
const courtById = new Map(courtSources.map((s) => [s.id, s]));
const courtIds = courtSources.map((s) => s.id);
console.log(`Gerichtsentscheidungen im Bestand: ${courtIds.length}`);

let cases = await all<any>("practice_cases", "id,title,short_answer,faq", (q) => q.eq("status", "published"));
if (ONLY) cases = cases.filter((c) => ONLY.includes(c.id));
const flags = await all<any>("case_legal_review_flags", "id,case_id,reason", (q) => q.is("resolved_at", null));
const flagsByCase = new Map<string, any[]>();
for (const f of flags) {
  // interne Kennzeichen wie "[Zitat-Abgleich]" sind keine Fragen an Lehrkräfte
  if (!f.reason || /^\[/.test(f.reason.trim())) continue;
  flagsByCase.set(f.case_id, [...(flagsByCase.get(f.case_id) ?? []), f]);
}
const todo = cases.filter((c) => flagsByCase.has(c.id)).slice(0, LIMIT);
console.log(`Fälle mit offenen Rechtsfragen: ${todo.length}, Fragen: ${todo.reduce((n, c) => n + flagsByCase.get(c.id)!.length, 0)}`);

interface Passage { pid: string; chunkId: string; sectionId: string; sourceId: string; label: string; fileNumber: string; text: string }

async function passagesFor(query: string): Promise<Passage[]> {
  const emb = await embedder.embedMany([query], { modelId: EMBED_MODEL });
  const vec = emb.results[0]?.vector;
  if (!vec) return [];
  const { data, error } = await db.rpc("match_legal_chunk_embeddings", { query_embedding: `[${vec.join(",")}]`, source_ids: courtIds, match_count: 5, min_similarity: 0.4, active_only: true });
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r: any) => r.chunk_id);
  if (!ids.length) return [];
  const { data: chunks } = await db.from("legal_chunks").select("id,source_id,primary_section_id,content,metadata").in("id", ids);
  // Tatbestand gibt Sachverhalt und Vortrag der Beteiligten wieder, nicht die Auffassung des Gerichts
  return (chunks ?? []).filter((c: any) => !/^Tatbestand/i.test(String(c.metadata?.sectionNumber ?? ""))).map((c: any) => {
    const src = courtById.get(c.source_id);
    const fileNumber = String(src?.title ?? "").split("–").pop()!.trim();
    return { pid: "", chunkId: c.id, sectionId: c.primary_section_id, sourceId: c.source_id, label: `${src?.title ?? ""} – ${c.metadata?.sectionNumber ?? ""}`, fileNumber, text: String(c.content ?? "").slice(0, 2200) };
  });
}

const SYSTEM = [
  "Du prüfst für RechtKompass Schule (Schulrecht NRW, Zielgruppe Lehrkräfte), ob Gerichtsentscheidungen offene Rechtsfragen eines Praxisfalls beantworten.",
  "Für jede Frage: Beantwortet eine der übergebenen Fundstellen die Frage inhaltlich und für NRW (SchulG NRW, APO-BK, NRW-Landesrecht oder allgemein geltendes Bundesrecht)? Nur dann answer liefern; sonst passage = null.",
  "Nicht ausreichend: Die Fundstelle streift das Thema nur, betrifft ein anderes Bundesland mit anderem Recht, oder beantwortet nur einen Einzelfall ohne verallgemeinerbaren Rechtssatz.",
  "answer: 2 bis 4 Sätze in klarer Sprache für Lehrkräfte. Beginne mit der Rechtsaussage, nenne dann die Quelle in der Form '(OVG NRW, Beschluss vom 12.3.2020 – 19 B 123/20, Rn. 14)' mit dem Aktenzeichen der Fundstelle. Ist es ein Verwaltungsgericht, schreibe 'nach Auffassung des VG ...'. Keine Zahlen oder Fristen, die nicht in der Fundstelle stehen. Keine eigenen Rechtsbehauptungen über die Fundstelle hinaus.",
  "quote: 10 bis 40 Wörter WÖRTLICH und zusammenhängend aus der Fundstelle kopiert, die die Antwort trägt.",
  "question: die Frage in einer für Lehrkräfte verständlichen Kurzform (eine Zeile, endet mit '?').",
].join(" ");
const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { items: { type: "array", items: { type: "object", additionalProperties: false, properties: {
    n: { type: "integer" }, passage: { type: ["string", "null"] }, question: { type: "string" }, answer: { type: "string" }, quote: { type: "string" },
  }, required: ["n", "passage"] } } },
  required: ["items"],
};
const norm = (s: string) => s.toLowerCase().replace(/[„“"'‚‘’«»]/g, "").replace(/\s+/g, " ").trim();

const backup: any[] = [];
const stats = { cases: 0, questions: 0, answered: 0, rejected: 0, failed: 0 };
const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const c = queue.shift()!;
    const fl = flagsByCase.get(c.id)!;
    try {
      const perQ: Passage[][] = [];
      for (const f of fl) perQ.push(await passagesFor(`${c.title}. ${f.reason}`));
      if (!perQ.some((p) => p.length)) { stats.cases++; stats.questions += fl.length; continue; }
      let k = 0;
      const payload = fl.map((f, i) => ({ n: i + 1, frage: f.reason, fundstellen: perQ[i].map((p) => { p.pid = `P${++k}`; return { id: p.pid, quelle: p.label, text: p.text }; }) }));
      const pidMap = new Map(perQ.flat().map((p) => [p.pid, p]));
      const res = await llm.complete({
        taskId: "answer-flags-caselaw", model: "anthropic/claude-sonnet-5",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ fall: c.title, kurzantwort: c.short_answer, fragen: payload }) }],
        jsonSchema: { name: "caselaw_answers", schema: SCHEMA }, maxTokens: 8000, signal: AbortSignal.timeout(300_000),
      } as any);
      const items = ((res.json as any)?.items ?? []) as any[];
      const accepted: Array<{ flag: any; p: Passage; question: string; answer: string }> = [];
      for (const it of items) {
        const f = fl[it.n - 1];
        const p = it.passage ? pidMap.get(it.passage) : undefined;
        if (!f || !p || !it.answer || !it.quote) continue;
        const okQuote = norm(p.text).includes(norm(it.quote)) && it.quote.split(/\s+/).length >= 8;
        const okFile = p.fileNumber && it.answer.includes(p.fileNumber);
        const pq = new Set(extractQuantities(p.text).map((q) => `${q.value}|${q.unit}`));
        const okNums = extractQuantities(it.answer).every((q) => pq.has(`${q.value}|${q.unit}`));
        const answer = String(it.answer).trim().replace(/^\p{Ll}/u, (ch) => ch.toUpperCase());
        if (okQuote && okFile && okNums) accepted.push({ flag: f, p, question: String(it.question || f.reason).trim(), answer });
        else stats.rejected++;
      }
      stats.cases++; stats.questions += fl.length; stats.answered += accepted.length;
      if (!accepted.length) continue;
      if (!APPLY) {
        console.log(`\n## ${c.id.slice(0, 8)} ${c.title.slice(0, 70)}`);
        for (const a of accepted) console.log(`  F: ${a.question}\n  A: ${a.answer}\n  (${a.p.label})`);
        continue;
      }
      backup.push({ id: c.id, faq: c.faq, flags: accepted.map((a) => a.flag.id) });
      const faq = Array.isArray(c.faq) ? [...c.faq] : [];
      for (const a of accepted) if (!faq.some((x: any) => x.q === a.question)) faq.push({ q: a.question, a: a.answer });
      const { error: e1 } = await db.from("practice_cases").update({ faq, updated_at: new Date().toISOString() }).eq("id", c.id);
      if (e1) throw e1;
      const { data: have } = await db.from("case_legal_links").select("legal_section_id").eq("case_id", c.id);
      const haveIds = new Set((have ?? []).map((l: any) => l.legal_section_id));
      const newSecs = [...new Set(accepted.map((a) => a.p.sectionId))].filter((id) => id && !haveIds.has(id));
      if (newSecs.length) {
        const { data: secs } = await db.from("legal_sections").select("id,content").in("id", newSecs);
        const rows = (secs ?? []).map((s: any) => {
          const a = accepted.find((x) => x.p.sectionId === s.id)!;
          return { case_id: c.id, legal_section_id: s.id, relevance: "medium", explanation: `Rechtsprechung zur Frage: ${a.question}`.slice(0, 300), content_summary: sentenceStart(s.content), content_summary_kind: "wortlaut" };
        });
        const { error: e2 } = await db.from("case_legal_links").insert(rows);
        if (e2) throw e2;
      }
      const { error: e3 } = await db.from("case_legal_review_flags").update({ resolved_at: new Date().toISOString(), resolved_by: ADMIN }).in("id", accepted.map((a) => a.flag.id));
      if (e3) throw e3;
      if (stats.cases % 20 === 0) { writeFileSync(BACKUP, JSON.stringify(backup)); console.log(`${stats.cases}/${todo.length} Fälle, ${stats.answered} beantwortet`); }
    } catch (e: any) { stats.failed++; console.log("FEHLER", c.id.slice(0, 8), String(e.message ?? e).slice(0, 200)); }
  }
}));
if (APPLY) writeFileSync(BACKUP, JSON.stringify(backup));
console.log(APPLY ? "ANGEWENDET" : "VORSCHAU", stats);
