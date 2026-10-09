/**
 * Abschnitte reparieren, in die beim Import die ANLAGEN einer Verordnung
 * gerutscht sind (meist der letzte Paragraf "Inkrafttreten"; Fund 09.10.2026):
 * Der eigentliche Paragraf bleibt mit seinem echten Wortlaut, der Anlagen-Teil
 * wird ein eigener Abschnitt "Anlagen" und für die Suche in Stücke von
 * höchstens ~3.500 Zeichen geteilt (jedes Stück mit eigenem Suchvektor und
 * der nächstliegenden Zwischenüberschrift als Kontext).
 *
 * Aufruf: bun run scripts/_split-annex-sections.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { SupabaseChunkRepository, SupabaseEmbeddingRepository } from "../src/services/legal-knowledge/embeddings/repositories/SupabaseRepositories";
import type { PersistedChunk } from "../src/services/legal-knowledge/embeddings/repositories/InMemoryRepositories";
import { buildChunkId, buildStableHash, sha1 } from "../src/services/legal-knowledge/chunks/ChunkHashBuilder";
import { EmbeddingProviderFactory } from "../src/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";

const dry = process.argv.includes("--dry-run");
const EMBED_MODEL = "openai/text-embedding-3-small";
const MAX_CHUNK = 3500;
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const uuid = (seed: string) => { const h = sha1(seed).slice(0, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

const NACHFOLGEND = /\|?\s*Nachfolgend finden Sie die Anlagen?\b/;
// Zwischenüberschriften im Anlagen-Teil (für den Kontext je Stück).
const BASS_HEADING = /\bAnlage\s+\d+[a-z]?\b[^|.]{0,80}/g;
const VERSMED_HEADING = /Teil [A-D]: (?:Gemeinsame Grundsätze|GdS-Tabelle|Begutachtung im Sozialen Entschädigungsrecht|Merkzeichen)|(?<=\s)\d{1,2}\.(?:\s?\d{1,2}\.)?\s?[A-ZÄÖÜ][a-zäöüß]+(?:[ ,-]+(?:und|oder|der|des|im|in|[A-ZÄÖÜ][a-zäöüß]+)){0,5}(?=\s?[|(])/g;

const TARGETS: Array<{ url: string; ref: string; split: RegExp; annexLabel: string; heading: RegExp }> = [
  { url: "https://www.gesetze-im-internet.de/versmedv/BJNR241200008.html", ref: "§ 5", split: /\|\s*Inhaltsverzeichnis/, annexLabel: "Anlage (Versorgungsmedizinische Grundsätze)", heading: VERSMED_HEADING },
  { url: "https://bass.schule.nrw/101.htm", ref: "§ 11", split: NACHFOLGEND, annexLabel: "Anlagen zur VO-DV I", heading: BASS_HEADING },
  { url: "https://bass.schule.nrw/1393.htm", ref: "§ 11", split: NACHFOLGEND, annexLabel: "Anlagen zur VO-DV II", heading: BASS_HEADING },
  { url: "https://bass.schule.nrw/12691.htm", ref: "§ 48", split: NACHFOLGEND, annexLabel: "Anlagen zur APO-S I und VVzAPO-S I", heading: BASS_HEADING },
  { url: "https://bass.schule.nrw/13199.htm", ref: "§ 48", split: NACHFOLGEND, annexLabel: "Anlagen zur APO-S I und VVzAPO-S I", heading: BASS_HEADING },
  { url: "https://bass.schule.nrw/9607.htm", ref: "§ 43", split: NACHFOLGEND, annexLabel: "Anlagen zur VVzAPO-GOSt", heading: BASS_HEADING },
  { url: "https://bass.schule.nrw/9609.htm", ref: "§ 43", split: NACHFOLGEND, annexLabel: "Anlagen zur VVzAPO-GOSt", heading: BASS_HEADING },
  { url: "https://bass.schule.nrw/18586.htm", ref: "§ 4", split: NACHFOLGEND, annexLabel: "Anlage (Regionaler Baukostenfaktor)", heading: BASS_HEADING },
  { url: "https://bass.schule.nrw/6217.htm", ref: "§ 22", split: NACHFOLGEND, annexLabel: "Anlage zur SchfkVO", heading: BASS_HEADING },
  { url: "https://bass.schule.nrw/6216.htm", ref: "§ 22", split: NACHFOLGEND, annexLabel: "Anlage zur SchfkVO", heading: BASS_HEADING },
];

function pieces(text: string): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(text.length, pos + MAX_CHUNK);
    if (end < text.length) {
      const win = text.slice(pos + Math.floor(MAX_CHUNK * 0.6), end);
      const cut = Math.max(win.lastIndexOf(" | "), win.lastIndexOf(". "), win.lastIndexOf("\n"));
      if (cut > 0) end = pos + Math.floor(MAX_CHUNK * 0.6) + cut + 1;
    }
    out.push({ start: pos, text: text.slice(pos, end).trim() });
    pos = end;
  }
  return out.filter((p) => p.text.length > 0);
}

function headingAt(text: string, re: RegExp, pos: number): string | null {
  let last: string | null = null;
  for (const m of text.matchAll(re)) { if ((m.index ?? 0) > pos) break; last = m[0].replace(/[|\s]+$/g, "").trim(); }
  return last;
}

const chunkRepo = new SupabaseChunkRepository(db);
const embRepo = new SupabaseEmbeddingRepository(db);
const provider = EmbeddingProviderFactory.forModel(EMBED_MODEL);
let totalChunks = 0;

for (const t of TARGETS) {
  const { data: src } = await db.from("legal_sources").select("id,title,short_name").eq("official_url", t.url).single();
  const { data: sec } = await db.from("legal_sections").select("*").eq("source_id", src.id).eq("reference", t.ref).single();
  const content: string = sec.content;
  const m = t.split.exec(content);
  if (!m || m.index < 20) { console.log(`ÜBERSPRUNGEN ${t.url} ${t.ref}: Trennstelle nicht gefunden (evtl. schon repariert)`); continue; }
  const head = content.slice(0, m.index).replace(/\|\s*$/, "").trim();
  const annex = content.slice(m.index).replace(/^\|\s*/, "").trim();
  const ps = pieces(annex);
  const short = src.short_name && !["BASS", "VV", "SchulG NRW", "RdErl."].includes(src.short_name) ? src.short_name : src.title.replace(/\s+/g, " ").slice(0, 60);
  console.log(`\n${t.url} ${t.ref}: ${content.length} Zeichen → Paragraf ${head.length} + ${t.annexLabel} ${annex.length} in ${ps.length} Stücken`);
  console.log(`   Paragraf endet: …${head.slice(-110)}`);
  console.log(`   Anlagen beginnen: ${annex.slice(0, 110)}…`);
  console.log(`   Stück-Kontexte: ${ps.slice(0, 5).map((p) => headingAt(annex, t.heading, p.start) ?? "–").join(" | ")}${ps.length > 5 ? " | …" : ""}`);
  if (dry) continue;

  const now = new Date().toISOString();
  const annexId = uuid(`legal_section:annex:${sec.id}`);
  // 1) Paragraf auf seinen Wortlaut kürzen, Anlagen-Abschnitt anlegen
  const { error: e1 } = await db.from("legal_sections").update({ content: head, full_text: head, source_hash: sha1(head).slice(0, 16), metadata: { ...(sec.metadata ?? {}), annexSplitAt: now, annexSectionId: annexId } }).eq("id", sec.id);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await db.from("legal_sections").upsert({
    id: annexId, source_id: src.id, reference: "Anlagen", title: t.annexLabel, content: annex, full_text: annex, section_number: "Anlagen",
    status: "active", version_label: sec.version_label, metadata: { splitFrom: sec.id, splitAt: now }, parser_method: "annex-split",
    parser_confidence: 0.9, import_url: t.url, imported_at: now, source_hash: sha1(annex).slice(0, 16), order_index: (sec.order_index ?? 0) + 1,
  }, { onConflict: "id" });
  if (e2) throw new Error(e2.message);

  // 2) Alte Chunks des Paragrafen deaktivieren
  const { data: old } = await db.from("legal_chunks").select("id").eq("primary_section_id", sec.id).eq("active", true);
  if (old?.length) {
    await db.from("legal_chunks").update({ active: false }).in("id", old.map((c: any) => c.id));
    await db.from("legal_chunk_embeddings").update({ invalidated_at: now }).in("chunk_id", old.map((c: any) => c.id));
  }

  // 3) Neue Chunks: Paragraf + Anlagen-Stücke
  const mk = (key: string, path: string, order: number, title: string, body: string, secId: string, display: string): PersistedChunk => {
    const stableHash = buildStableHash({ sourceId: src.id, path, normalizedContent: body });
    return {
      id: uuid(`legal_chunk:${key}`), chunkId: buildChunkId(src.id, path, order), sourceId: src.id, stableHash, contentHash: stableHash,
      path, displayPath: display, title, displayTitle: title, content: body, normalizedContent: body,
      metadata: { sectionNumber: secId === sec.id ? t.ref : "Anlagen", primarySectionId: secId },
      token: { characterCount: body.length, wordCount: body.split(/\s+/).length, tokenEstimate: Math.ceil(body.length / 4), sentenceCount: (body.match(/[.!?]/g) ?? []).length, averageSentenceLength: 0, referenceCount: 0 },
      active: true, chunkVersion: 1, createdAt: now, updatedAt: now, primarySection: secId,
    } as PersistedChunk;
  };
  const base = `annex-split/${sec.id}`;
  const chunks: PersistedChunk[] = [mk(`${base}/head`, `${base}/head`, 900, `${t.ref} ${sec.title ?? ""}`.trim(), head, sec.id, `${src.title} ${t.ref}`)];
  ps.forEach((p, i) => {
    const h = headingAt(annex, t.heading, p.start);
    const title = `${t.annexLabel}${h ? ` – ${h}` : ""} (Teil ${i + 1}/${ps.length})`;
    chunks.push(mk(`${base}/annex/${i}`, `${base}/annex/${i}`, 901 + i, title, `${short} – ${title}\n${p.text}`, annexId, `${src.title} ${t.annexLabel} ${i + 1}/${ps.length}`));
  });
  await chunkRepo.upsertMany(chunks);

  // 4) Suchvektoren
  for (let i = 0; i < chunks.length; i += 20) {
    const slice = chunks.slice(i, i + 20);
    const res = await provider.embedMany(slice.map((c) => c.normalizedContent.slice(0, 20000)), { modelId: EMBED_MODEL });
    for (let j = 0; j < slice.length; j++) {
      const r = res.results[j]; const c = slice[j]; if (!r) continue;
      await embRepo.upsert({ sourceId: src.id, chunkId: c.id, chunkStableHash: c.stableHash, chunkPath: c.path, providerId: r.provider, modelId: EMBED_MODEL,
        modelVersion: r.modelVersion, dimensions: r.dimensions, vector: r.vector, status: "embedded", contentHash: c.stableHash, inputFormatVersion: 1,
        tokenCount: r.usage?.totalTokens ?? null, inputCharacterCount: c.normalizedContent.length, usage: r.usage ?? null, cost: null, errorCode: null,
        errorMessage: null, attemptCount: 1, embeddedAt: now, invalidatedAt: null } as any);
    }
  }
  totalChunks += chunks.length;
  console.log(`   geschrieben: Paragraf gekürzt, Anlagen-Abschnitt ${annexId.slice(0, 8)}, ${chunks.length} Chunks mit Suchvektor, ${old?.length ?? 0} alte Chunks deaktiviert`);
}
if (!dry) console.log(`\nFertig: ${totalChunks} neue Chunks.`);
