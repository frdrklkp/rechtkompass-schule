/**
 * Rechtsprechung zum Schulrecht aus NRWE importieren (20.10.2026).
 *
 * NRWE ist die amtliche Rechtsprechungsdatenbank der Justiz NRW
 * (nrwesuche.justiz.nrw.de / nrwe.justiz.nrw.de). Anders als Open Legal Data
 * (scripts/_import-rechtsprechung.ts, anonym auf ein Tageskontingent
 * gedrosselt) braucht sie kein Konto und liefert zu jedem Treffer die
 * amtlichen Leitsätze, die geprüften Normen und Schlagwörter.
 *
 * Gerichte: OVG NRW, Verwaltungsgerichte in NRW, für Amtshaftung bei
 * Aufsichtsfehlern auch OLG/LG. Je Entscheidung eine Quelle (court_decision)
 * mit Abschnitten Leitsätze / Tenor / Gründe (nach Randnummern gebündelt),
 * Suchabschnitten und Suchvektoren. Höchstens eine Anfrage pro Sekunde.
 *
 * Aufruf: bun run scripts/_import-rechtsprechung-nrwe.ts [--dry-run] [--max N]
 */
import { createClient } from "@supabase/supabase-js";
import { SupabaseChunkRepository, SupabaseEmbeddingRepository } from "../src/services/legal-knowledge/embeddings/repositories/SupabaseRepositories";
import type { PersistedChunk } from "../src/services/legal-knowledge/embeddings/repositories/InMemoryRepositories";
import { buildChunkId, buildStableHash, sha1 } from "../src/services/legal-knowledge/chunks/ChunkHashBuilder";
import { EmbeddingProviderFactory } from "../src/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const MAX = Number(args[args.indexOf("--max") + 1] ?? NaN) || 260;
const SEARCH = "https://nrwesuche.justiz.nrw.de/index.php";
const EMBED_MODEL = "openai/text-embedding-3-small";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const uuid = (seed: string) => { const h = sha1(seed).slice(0, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = { "User-Agent": "RechtKompass-Schule/1.0 (Schulrecht-Orientierung, Berufskolleg Olsberg)" };

const QUERIES: Array<[string, string]> = [
  ["Ordnungsmaßnahmen", "Ordnungsmaßnahme Schule § 53 SchulG"],
  ["Ordnungsmaßnahmen", "Entlassung von der Schule Teilkonferenz"],
  ["Ordnungsmaßnahmen", "Ausschluss vom Unterricht Schüler"],
  ["Leistungsbewertung", "Zeugnisnote Schule Anfechtung"],
  ["Leistungsbewertung", "Nichtversetzung Versetzungskonferenz"],
  ["Leistungsbewertung", "Leistungsbewertung Klassenarbeit Schüler"],
  ["Prüfungen", "Täuschung Prüfung Schule"],
  ["Prüfungen", "Berufskolleg Prüfung APO-BK"],
  ["Prüfungen", "Nachteilsausgleich Legasthenie Schule"],
  ["Prüfungen", "Prüfungsunfähigkeit Attest Schule"],
  ["Fehlzeiten", "Schulpflicht Bußgeld Schulversäumnis"],
  ["Fehlzeiten", "ärztliches Attest Schulversäumnis"],
  ["Aufsicht", "Aufsichtspflicht Lehrer Schulunfall"],
  ["Aufsicht", "Amtshaftung Schule Aufsichtspflicht"],
  ["Klassenfahrten", "Klassenfahrt Schulfahrt"],
  ["Datenschutz", "Datenschutz Schule Schülerdaten"],
  ["Datenschutz", "Auskunft Art. 15 DSGVO Schule"],
  ["Inklusion", "Schulbegleitung Eingliederungshilfe"],
  ["Inklusion", "sonderpädagogischer Unterstützungsbedarf Schule"],
  ["Berufskolleg", "Berufsschulpflicht Berufskolleg"],
  ["Elternrechte", "Elternrecht Schule Information"],
  ["Mobbing", "Mobbing Schule"],
  ["Dienstrecht", "Lehrer Disziplinarverfahren"],
  ["Dienstrecht", "Lehrkraft dienstliche Beurteilung"],
  ["Schulorganisation", "Aufnahme Schule Aufnahmekapazität"],
  ["Religion und Neutralität", "Kopftuch Lehrerin Schule"],
];

const shortCourt = (name: string) => name.trim()
  .replace(/^Oberverwaltungsgericht (NRW|Nordrhein-Westfalen)$/, "OVG NRW")
  .replace(/^Verwaltungsgericht /, "VG ").replace(/^Oberlandesgericht /, "OLG ").replace(/^Landgericht /, "LG ")
  .replace(/^Landesarbeitsgericht /, "LAG ").replace(/^Arbeitsgericht /, "ArbG ");
const decodeEntities = (h: string) => h.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const stripTags = (h: string) => decodeEntities(h.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const head = new TextDecoder("latin1").decode(buf.slice(0, 3000));
        const utf8 = /charset=["']?utf-8/i.test(res.headers.get("content-type") ?? "") || /charset=["']?utf-8/i.test(head);
        return new TextDecoder(utf8 ? "utf-8" : "windows-1252").decode(buf);
      }
    } catch { /* erneut */ }
    await sleep(2000 * attempt);
  }
  return "";
}

// 1) Kandidaten aus der NRWE-Suche
interface Hit { url: string; court: string; type: string; file: string; ecli: string; date: string; normen: string; schlag: string; leitsatz: string; theme: string; score: number }
const hits = new Map<string, Hit>();
for (const [theme, q] of QUERIES) {
  const body = new URLSearchParams({ q, absenden: "Suchen", method: "stem", qSize: "25" });
  const html = await fetchText(SEARCH, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  await sleep(1000);
  let rank = 0;
  for (const block of html.split("<div class='einErgebnis'>").slice(1)) {
    rank++;
    const url = block.match(/href='([^']+\.html)'/)?.[1];
    const field = (k: string) => stripTags(block.match(new RegExp(k + ":\\s*([\\s\\S]*?)<br"))?.[1] ?? "");
    const court = field("Gericht"); const dateDe = field("Entscheidungsdatum");
    if (!url || !court || !dateDe) continue;
    if (!/Verwaltungsgericht|Oberlandesgericht|Landgericht/.test(court)) continue;
    const [dd, mm, yy] = dateDe.split(".").map((x) => x.trim());
    const date = `${yy}-${mm}-${dd}`;
    if (date < "2006-01-01") continue;
    const leitsatz = stripTags(block.match(/Leitsätze:\s*([\s\S]*?)(<br \/>\s*<\/div>|<\/div>)/)?.[1] ?? "");
    const normen = field("Normen"); const schlag = field("Schlagwörter");
    if (/Oberlandesgericht|Landgericht/.test(court) && !/Schul|Lehrer|Schüler/.test(normen + schlag + leitsatz)) continue;
    const score = (/Oberverwaltungsgericht/.test(court) ? 3 : 2) + (leitsatz ? 1 : 0) + (date >= "2015" ? 1 : 0) + Math.max(0, 1.5 - rank / 15);
    const prev = hits.get(url);
    if (!prev || prev.score < score) hits.set(url, { url, court, type: field("Entscheidungsart"), file: field("Aktenzeichen"), ecli: field("ECLI") || (block.match(/ECLI:[^<\s]+/)?.[0] ?? ""), date, normen, schlag, leitsatz, theme, score });
  }
}
const ranked = [...hits.values()].sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
console.log(`Kandidaten: ${ranked.length}`);

// 2) Volltexte
interface Decision { meta: any; theme: string; sections: Array<{ reference: string; title: string; content: string }> }
const decisions: Decision[] = [];
for (const h of ranked) {
  if (decisions.length >= MAX) break;
  const html = await fetchText(h.url);
  await sleep(1000);
  if (!html) continue;
  const tenor = stripTags(html.match(/class="feldinhalt tenor"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
  // Absätze: <span class="absatzRechts">Rn</span><p class="absatzLinks">Text</p>
  const paras: Array<{ rn: number | null; text: string }> = [];
  for (const m of html.matchAll(/<span class="absatzRechts">([\s\S]*?)<\/span>\s*<p class="absatzLinks">([\s\S]*?)<\/p>/g)) {
    const rn = Number(stripTags(m[1])) || null; const text = stripTags(m[2]);
    if (text) paras.push({ rn, text });
  }
  const plain = paras.map((p) => p.text).join(" ");
  if (plain.length < 2500 || !/Schul|Schüler|Lehrer|Lehrkraft/.test(plain + h.normen)) continue;
  const sections: Decision["sections"] = [];
  if (h.leitsatz) sections.push({ reference: "Leitsätze", title: "Leitsätze", content: h.leitsatz + (h.normen ? `\nNormen: ${h.normen}` : "") });
  if (tenor) sections.push({ reference: "Tenor", title: "Tenor", content: tenor });
  let part = "Gründe"; let buf: typeof paras = [];
  const flush = () => {
    if (!buf.length) return;
    const rns = buf.map((b) => b.rn).filter((x): x is number => x !== null);
    const ref = rns.length ? `${part} Rn. ${rns[0]}${rns.length > 1 ? `–${rns[rns.length - 1]}` : ""}` : `${part} Teil ${sections.length}`;
    sections.push({ reference: ref, title: part, content: buf.map((b) => (b.rn ? `${b.rn} ${b.text}` : b.text)).join("\n") });
    buf = [];
  };
  for (const p of paras) {
    const compact = p.text.replace(/\s+/g, "").replace(/:$/, "");
    if (/^(Tatbestand|Gründe|Entscheidungsgründe|I+\.)$/i.test(compact) && /^(Tatbestand|Gründe|Entscheidungsgründe)$/i.test(compact)) { flush(); part = compact === "Tatbestand" ? "Tatbestand" : "Gründe"; continue; }
    buf.push(p);
    if (buf.reduce((n, b) => n + b.text.length, 0) > 1800) flush();
  }
  flush();
  if (sections.length < 2) continue;
  const slug = h.url.split("/").pop()!.replace(/\.html$/, "");
  decisions.push({ meta: { slug, url: h.url, ecli: h.ecli, date: h.date, file_number: h.file, type: h.type, court: shortCourt(h.court) }, theme: h.theme, sections });
  if (decisions.length % 25 === 0) console.log(`  geladen: ${decisions.length}`);
}
const byCourt: Record<string, number> = {}; const byTheme: Record<string, number> = {};
decisions.forEach((d) => { byCourt[d.meta.court] = (byCourt[d.meta.court] ?? 0) + 1; byTheme[d.theme] = (byTheme[d.theme] ?? 0) + 1; });
console.log(`Entscheidungen: ${decisions.length}`, byCourt, byTheme);
if (DRY) { for (const d of decisions.slice(0, 6)) console.log(` - ${d.meta.court} ${d.meta.date} ${d.meta.file_number} | ${d.sections.length} Abschnitte | ${d.sections[0].content.slice(0, 140)}`); process.exit(0); }

// 3) Schreiben
const fmtDate = (iso: string) => { const [y, m, dd] = iso.split("-"); return `${Number(dd)}.${Number(m)}.${y}`; };
const chunkRepo = new SupabaseChunkRepository(db);
const embRepo = new SupabaseEmbeddingRepository(db);
const provider = EmbeddingProviderFactory.forModel(EMBED_MODEL);
let nSrc = 0, nSec = 0, nEmb = 0;
for (const d of decisions) {
  const court = d.meta.court;
  const typ = d.meta.type ?? "Entscheidung";
  const title = `${court}, ${typ} vom ${fmtDate(d.meta.date)} – ${d.meta.file_number}`;
  const key = `court_decision:${d.meta.ecli || d.meta.id}`;
  const sourceId = uuid(`legal_source:${key}`);
  const now = new Date().toISOString();
  const { error: se } = await db.from("legal_sources").upsert({
    id: sourceId, name: title, title, short_name: court, source_type: "court_decision", source_type_v2: "court_decision", status: "active",
    official_url: d.meta.url, jurisdiction: "NRW",
    authority: court, federal_state: "NRW", legal_domain: d.theme, version_label: d.meta.date,
    official_source: true, authority_verified: false, verification_status: "unverified", lifecycle_status: "active", source_language: "de",
    description: `${d.meta.ecli ?? ""} · Volltext aus NRWE (Rechtsprechungsdatenbank der Justiz NRW)`.trim(),
  }, { onConflict: "id" });
  if (se) throw new Error(`legal_sources ${title}: ${se.message}`);
  const rows = d.sections.map((s, i) => ({
    id: uuid(`legal_section:${key}:${s.reference}:${i}`), source_id: sourceId, reference: s.reference, title: s.title, content: s.content, full_text: s.content,
    section_number: s.reference, status: "active", version_label: d.meta.date, metadata: { ecli: d.meta.ecli ?? null, court, file_number: d.meta.file_number },
    parser_method: "nrwe", parser_confidence: 0.9, import_url: d.meta.url, imported_at: now,
    source_hash: sha1(s.content).slice(0, 16), order_index: i + 1,
  }));
  const { error: e2 } = await db.from("legal_sections").upsert(rows, { onConflict: "id" });
  if (e2) throw new Error(`legal_sections ${title}: ${e2.message}`);
  await db.from("legal_chunks").delete().eq("source_id", sourceId);
  const chunks: PersistedChunk[] = rows.map((r, i) => {
    const content = `${title} – ${r.reference}\n${r.content}`;
    const path = `${key}/${r.reference}#${i}`;
    const stableHash = buildStableHash({ sourceId, path, normalizedContent: content });
    return {
      id: uuid(`legal_chunk:${path}`), chunkId: buildChunkId(sourceId, path, i), sourceId, stableHash, contentHash: stableHash, path,
      displayPath: `${title} – ${r.reference}`, title: r.reference, displayTitle: r.reference, content, normalizedContent: content,
      metadata: { sectionNumber: r.reference, primarySectionId: r.id, court, ecli: d.meta.ecli ?? null },
      token: { characterCount: content.length, wordCount: content.split(/\s+/).length, tokenEstimate: Math.ceil(content.length / 4), sentenceCount: (content.match(/[.!?]/g) ?? []).length, averageSentenceLength: 0, referenceCount: 0 },
      active: true, chunkVersion: 1, createdAt: now, updatedAt: now, primarySection: r.id,
    } as PersistedChunk;
  });
  await chunkRepo.upsertMany(chunks);
  const result = await provider.embedMany(chunks.map((c) => c.normalizedContent), { modelId: EMBED_MODEL });
  for (let j = 0; j < chunks.length; j++) {
    const r = result.results[j]; const c = chunks[j];
    if (!r) continue;
    await embRepo.upsert({
      sourceId, chunkId: c.id, chunkStableHash: c.stableHash, chunkPath: c.path, providerId: r.provider, modelId: EMBED_MODEL,
      modelVersion: r.modelVersion, dimensions: r.dimensions, vector: r.vector, status: "embedded", contentHash: c.stableHash, inputFormatVersion: 1,
      tokenCount: r.usage?.totalTokens ?? null, inputCharacterCount: c.normalizedContent.length, usage: r.usage ?? null, cost: null,
      errorCode: null, errorMessage: null, attemptCount: 1, embeddedAt: now, invalidatedAt: null,
    } as any);
    nEmb++;
  }
  nSrc++; nSec += rows.length;
  if (nSrc % 25 === 0) console.log(`${nSrc}/${decisions.length} importiert`);
}
console.log(`Fertig: ${nSrc} Entscheidungen, ${nSec} Abschnitte, ${nEmb} Suchvektoren.`);
