/**
 * Rechtsprechung zum Schulrecht importieren (20.10.2026).
 *
 * Anlass: Viele offene Rechtsfragen der Fälle (Noten als Verwaltungsakt,
 * Haftung bei Aufsichtsfehlern, Ordnungsmaßnahmen, Täuschung, Nachteils-
 * ausgleich ...) hat die Verwaltungsrechtsprechung in NRW längst entschieden;
 * der Korpus enthielt bisher keine einzige Gerichtsentscheidung.
 *
 * Quelle: Open Legal Data (de.openlegaldata.io, freie API, Volltexte aus den
 * amtlichen Rechtsprechungsdatenbanken der Länder und des Bundes). Gerichte:
 * OVG NRW, die sieben VG in NRW, BVerwG, BGH. Je Entscheidung eine Quelle
 * (source_type court_decision) mit Abschnitten Leitsätze/Tenor/Gründe (nach
 * Randnummern gebündelt), Suchabschnitten und Suchvektoren.
 *
 * Aufruf: bun run scripts/_import-rechtsprechung.ts [--dry-run] [--max N]
 */
import { createClient } from "@supabase/supabase-js";
import { SupabaseChunkRepository, SupabaseEmbeddingRepository } from "../src/services/legal-knowledge/embeddings/repositories/SupabaseRepositories";
import type { PersistedChunk } from "../src/services/legal-knowledge/embeddings/repositories/InMemoryRepositories";
import { buildChunkId, buildStableHash, sha1 } from "../src/services/legal-knowledge/chunks/ChunkHashBuilder";
import { EmbeddingProviderFactory } from "../src/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const MAX = Number(args[args.indexOf("--max") + 1] ?? NaN) || 260;
const API = "https://de.openlegaldata.io/api";
const EMBED_MODEL = "openai/text-embedding-3-small";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const uuid = (seed: string) => { const h = sha1(seed).slice(0, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COURTS: Record<string, string> = {
  OVGNRW: "OVG NRW", VGAC: "VG Aachen", VGAR: "VG Arnsberg", VGD: "VG Düsseldorf", VGGE: "VG Gelsenkirchen",
  VGK: "VG Köln", VGMI: "VG Minden", VGMS: "VG Münster", BVerwG: "BVerwG", BGH: "BGH",
};

// Themen der Fälle -> Suchanfragen (Thema landet in legal_domain)
const QUERIES: Array<[string, string]> = [
  ["Ordnungsmaßnahmen", "Ordnungsmaßnahme § 53 SchulG Schule"],
  ["Ordnungsmaßnahmen", "Entlassung von der Schule Teilkonferenz"],
  ["Ordnungsmaßnahmen", "Ausschluss vom Unterricht Schüler Anhörung"],
  ["Leistungsbewertung", "Zeugnisnote Anfechtung Schule"],
  ["Leistungsbewertung", "Nichtversetzung Versetzungskonferenz"],
  ["Leistungsbewertung", "Leistungsbewertung Klassenarbeit Note Schüler"],
  ["Prüfungen", "Täuschungsversuch Prüfung Schule"],
  ["Prüfungen", "Abschlussprüfung Berufskolleg"],
  ["Prüfungen", "Nachteilsausgleich Legasthenie Prüfung Schule"],
  ["Prüfungen", "Prüfungsunfähigkeit Attest Prüfung Rücktritt"],
  ["Fehlzeiten", "Schulpflicht Bußgeld Schulversäumnis"],
  ["Fehlzeiten", "ärztliches Attest Schule Unterrichtsversäumnis"],
  ["Aufsicht", "Aufsichtspflicht Lehrer Schulunfall"],
  ["Aufsicht", "Amtshaftung Lehrer Aufsicht Schüler verletzt"],
  ["Klassenfahrten", "Klassenfahrt Schulfahrt Teilnahme"],
  ["Datenschutz", "Datenschutz Schule Schülerdaten"],
  ["Datenschutz", "Auskunft personenbezogene Daten Schule Art. 15 DSGVO"],
  ["Inklusion", "Schulbegleitung Eingliederungshilfe Schule"],
  ["Inklusion", "sonderpädagogischer Unterstützungsbedarf Förderort"],
  ["Berufskolleg", "Berufsschulpflicht Ausbildung Berufskolleg"],
  ["Elternrechte", "Elternrecht Information Schule volljährig"],
  ["Mobbing", "Mobbing Schule Schüler"],
  ["Dienstrecht", "Lehrer Disziplinarverfahren Schule"],
  ["Dienstrecht", "Lehrkraft dienstliche Beurteilung Schule"],
  ["Schulorganisation", "Schulaufnahme Aufnahmekapazität Schule"],
  ["Religion und Neutralität", "Kopftuch Lehrerin Schule Neutralität"],
];

const CACHE = process.env.RSPR_CACHE ?? "";
async function getJson(url: string): Promise<any> {
  if (CACHE) {
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(CACHE, { recursive: true });
    const f = `${CACHE}/${sha1(url).slice(0, 20)}.json`;
    if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
    const d = await fetchJson(url);
    if (d) writeFileSync(f, JSON.stringify(d));
    return d;
  }
  return fetchJson(url);
}
// Anonyme Abrufe sind auf ein Tageskontingent begrenzt (Fund 20.10.2026: nach ~80 Abrufen
// "throttled", Freigabe erst nach ~22 h). Mit kostenlosem Konto: OPENLEGALDATA_API_KEY in .env.
const AUTH: Record<string, string> = process.env.OPENLEGALDATA_API_KEY ? { Authorization: `Token ${process.env.OPENLEGALDATA_API_KEY}` } : {};
async function fetchJson(url: string): Promise<any> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: AUTH, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return await res.json();
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Open Legal Data drosselt die Abrufe (noch ${Math.round((body.retry_after ?? 0) / 3600)} h). Kostenloses Konto anlegen und OPENLEGALDATA_API_KEY in .env setzen.`);
      }
    } catch (e: any) { if (String(e?.message ?? "").includes("drosselt")) throw e; }
    await sleep(1000 * attempt);
  }
  return null;
}

// 1) Kandidaten sammeln
const cand = new Map<number, { id: number; court: string; date: string; theme: string; score: number }>();
for (const [theme, text] of QUERIES) {
  const urls = [
    `${API}/cases/search/?format=json&text=${encodeURIComponent(text)}&court=OVGNRW`,
    `${API}/cases/search/?format=json&text=${encodeURIComponent(text + " Nordrhein-Westfalen")}`,
    `${API}/cases/search/?format=json&text=${encodeURIComponent(text + " Nordrhein-Westfalen")}&page=2`,
  ];
  let rank = 0;
  for (const u of urls) {
    const d = await getJson(u);
    await sleep(300);
    for (const r of d?.results ?? []) {
      rank++;
      if (!COURTS[r.court] || !r.date || r.date < "2006-01-01") continue;
      const score = (r.court === "OVGNRW" ? 3 : r.court.startsWith("VG") ? 2 : 1) + Math.max(0, 2 - rank / 10) + (r.date >= "2015" ? 1 : 0);
      const prev = cand.get(r.id);
      if (!prev || prev.score < score) cand.set(r.id, { id: r.id, court: r.court, date: r.date, theme, score });
    }
  }
}
const ranked = [...cand.values()].sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
console.log(`Kandidaten: ${ranked.length}`);

// 2) Volltexte laden und filtern
const stripTags = (h: string) => h.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
interface Part { heading: string; paras: string[] }
function partsOf(html: string): Part[] {
  const pieces = html.split(/<h2[^>]*>/i);
  const out: Part[] = [];
  for (const p of pieces) {
    const m = p.match(/^([\s\S]*?)<\/h2>([\s\S]*)$/i);
    const heading = m ? stripTags(m[1]) : "Text";
    const body = m ? m[2] : p;
    const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((x) => stripTags(x[1])).filter((x) => x.length > 1);
    if (paras.length) out.push({ heading: heading || "Text", paras });
  }
  return out;
}
/** Randnummer am Absatzanfang ("27Vgl. ...") abtrennen, nur bei aufsteigender Folge. */
function withRn(paras: string[]): Array<{ rn: number | null; text: string }> {
  let last = 0;
  return paras.map((t) => {
    const m = t.match(/^(\d{1,3})\s?(?=[A-ZÄÖÜ„"(§\d])/);
    if (m && Number(m[1]) === last + 1) { last = Number(m[1]); return { rn: last, text: t.slice(m[0].length).trim() }; }
    return { rn: null, text: t };
  });
}

interface Decision { meta: any; theme: string; sections: Array<{ reference: string; title: string; content: string }> }
const decisions: Decision[] = [];
for (const c of ranked) {
  if (decisions.length >= MAX) break;
  const d = await getJson(`${API}/cases/${c.id}/?format=json`);
  await sleep(150);
  if ((decisions.length + 1) % 25 === 0) console.log(`  geladen: ${decisions.length + 1} Entscheidungen`);
  const html: string = d?.content ?? "";
  const plain = stripTags(html);
  if (plain.length < 3000 || !/Schul|Schüler|Lehrer|Lehrkraft/.test(plain)) continue;
  const sections: Decision["sections"] = [];
  for (const part of partsOf(html)) {
    const h = part.heading.replace(/:$/, "");
    if (/^(Tenor|Leits(a|ä)tz)/i.test(h)) { sections.push({ reference: h, title: h, content: part.paras.join("\n") }); continue; }
    if (!/Gründe|Entscheidungsgründe|Tatbestand/i.test(h)) continue;
    // Gründe zu Abschnitten von ~1800 Zeichen bündeln, mit Randnummern-Bereich
    let buf: Array<{ rn: number | null; text: string }> = [];
    const flush = () => {
      if (!buf.length) return;
      const rns = buf.map((b) => b.rn).filter((x): x is number => x !== null);
      const ref = rns.length ? `${h} Rn. ${rns[0]}${rns.length > 1 ? `–${rns[rns.length - 1]}` : ""}` : `${h} Teil ${sections.filter((s) => s.reference.startsWith(h)).length + 1}`;
      sections.push({ reference: ref, title: h, content: buf.map((b) => (b.rn ? `${b.rn} ${b.text}` : b.text)).join("\n") });
      buf = [];
    };
    for (const p of withRn(part.paras)) {
      buf.push(p);
      if (buf.reduce((n, b) => n + b.text.length, 0) > 1800) flush();
    }
    flush();
  }
  if (!sections.length) continue;
  decisions.push({ meta: { ...d, courtCode: c.court }, theme: c.theme, sections });
}
const byCourt: Record<string, number> = {}; const byTheme: Record<string, number> = {};
decisions.forEach((d) => { byCourt[COURTS[d.meta.courtCode]] = (byCourt[COURTS[d.meta.courtCode]] ?? 0) + 1; byTheme[d.theme] = (byTheme[d.theme] ?? 0) + 1; });
console.log(`Entscheidungen: ${decisions.length}`, byCourt, byTheme);
if (DRY) { for (const d of decisions.slice(0, 5)) console.log(` - ${COURTS[d.meta.courtCode]} ${d.meta.date} ${d.meta.file_number} | ${d.sections.length} Abschnitte | ${d.sections[0].content.slice(0, 120)}`); process.exit(0); }

// 3) Schreiben
const fmtDate = (iso: string) => { const [y, m, dd] = iso.split("-"); return `${Number(dd)}.${Number(m)}.${y}`; };
const chunkRepo = new SupabaseChunkRepository(db);
const embRepo = new SupabaseEmbeddingRepository(db);
const provider = EmbeddingProviderFactory.forModel(EMBED_MODEL);
let nSrc = 0, nSec = 0, nEmb = 0;
for (const d of decisions) {
  const court = COURTS[d.meta.courtCode];
  const typ = d.meta.type ?? "Entscheidung";
  const title = `${court}, ${typ} vom ${fmtDate(d.meta.date)} – ${d.meta.file_number}`;
  const key = `court_decision:${d.meta.ecli || d.meta.id}`;
  const sourceId = uuid(`legal_source:${key}`);
  const now = new Date().toISOString();
  const { error: se } = await db.from("legal_sources").upsert({
    id: sourceId, name: title, title, short_name: court, source_type: "court_decision", source_type_v2: "court_decision", status: "active",
    official_url: `https://de.openlegaldata.io/case/${d.meta.slug}`, jurisdiction: court.startsWith("B") ? "Bund" : "NRW",
    authority: court, federal_state: court.startsWith("B") ? null : "NRW", legal_domain: d.theme, version_label: d.meta.date,
    official_source: true, authority_verified: false, verification_status: "unverified", lifecycle_status: "active", source_language: "de",
    description: `${d.meta.ecli ?? ""} · Volltext über Open Legal Data`.trim(),
  }, { onConflict: "id" });
  if (se) throw new Error(`legal_sources ${title}: ${se.message}`);
  const rows = d.sections.map((s, i) => ({
    id: uuid(`legal_section:${key}:${s.reference}:${i}`), source_id: sourceId, reference: s.reference, title: s.title, content: s.content, full_text: s.content,
    section_number: s.reference, status: "active", version_label: d.meta.date, metadata: { ecli: d.meta.ecli ?? null, court, file_number: d.meta.file_number },
    parser_method: "openlegaldata", parser_confidence: 0.9, import_url: `https://de.openlegaldata.io/case/${d.meta.slug}`, imported_at: now,
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
