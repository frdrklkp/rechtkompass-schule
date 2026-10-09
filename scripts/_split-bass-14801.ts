/**
 * BASS 18-03 Nr. 1 (Zusammenarbeit bei der Verhütung und Bekämpfung der
 * Jugendkriminalität, bass.schule.nrw/14801.htm): Abschnitt 4 lag als ein
 * einziger Block mit 22.000 Zeichen vor (Überschriften beim Import entfernt),
 * Nr. 4.2.2 "Straftaten an der Schule" war für Verknüpfung und Suche praktisch
 * unauffindbar (Fund 09.10.2026). Dieses Skript legt die 21 Unterabschnitte
 * 4.1 … 4.6 als eigene Abschnitte mit Chunk und Suchvektor an und deaktiviert
 * den Sammel-Chunk von Abschnitt 4 (der Abschnitt selbst bleibt bestehen).
 *
 * Aufruf: bun run scripts/_split-bass-14801.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { SupabaseChunkRepository, SupabaseEmbeddingRepository } from "../src/services/legal-knowledge/embeddings/repositories/SupabaseRepositories";
import type { PersistedChunk } from "../src/services/legal-knowledge/embeddings/repositories/InMemoryRepositories";
import { buildChunkId, buildStableHash, sha1 } from "../src/services/legal-knowledge/chunks/ChunkHashBuilder";
import { EmbeddingProviderFactory } from "../src/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";

const dry = process.argv.includes("--dry-run");
const URL = "https://bass.schule.nrw/14801.htm";
const SOURCE_KEY = "bass-doc-14801";
const EMBED_MODEL = "openai/text-embedding-3-small";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const uuid = (seed: string) => { const h = sha1(seed).slice(0, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

const html = await (await fetch(URL)).text();
const text = html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
  .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr|td)>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
const start = text.indexOf("4 Aufgaben der Netzwerkpartner");
const end = text.indexOf("5 Besondere Formen der Zusammenarbeit");
if (start < 0 || end < 0) throw new Error("Abschnittsgrenzen nicht gefunden - Seitenaufbau geändert?");
const lines = text.slice(start, end).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const parts: Array<{ ref: string; title: string; text: string[] }> = [];
for (const l of lines) {
  const m = l.match(/^(4\.\d(?:\.\d)?)\s+(.{3,90})$/);
  if (m && !/[.:;]$/.test(m[2])) parts.push({ ref: m[1], title: m[2], text: [] });
  else if (parts.length) parts.at(-1)!.text.push(l);
}
const subs = parts.filter((p) => p.text.length > 0);
console.log(`${subs.length} Unterabschnitte erkannt:`, subs.map((s) => `${s.ref} ${s.title} (${s.text.join(" ").length})`).join(" | "));
if (subs.length < 15 || !subs.some((s) => s.ref === "4.2.2" && /Verbrechens/.test(s.text.join(" ")))) throw new Error("Zerlegung unplausibel, Abbruch.");
if (dry) process.exit(0);

const { data: src } = await db.from("legal_sources").select("id,title").eq("official_url", URL).single();
const { data: sec4 } = await db.from("legal_sections").select("*").eq("source_id", src.id).eq("reference", "4").single();
const now = new Date().toISOString();
const rows = subs.map((s, i) => {
  const content = s.text.join("\n");
  return {
    id: uuid(`legal_section:${SOURCE_KEY}:4/${s.ref}`), source_id: src.id, reference: s.ref, title: s.title,
    content, full_text: content, section_number: s.ref, status: "active", version_label: sec4.version_label,
    metadata: { splitFrom: sec4.id, splitAt: now }, parser_method: "bass-split-14801", parser_confidence: 0.95,
    import_url: URL, imported_at: now, source_hash: sha1(content).slice(0, 16), parent_id: sec4.id, order_index: i + 1,
  };
});
const { error: secErr } = await db.from("legal_sections").upsert(rows, { onConflict: "id" });
if (secErr) throw new Error("legal_sections: " + secErr.message);
console.log(`${rows.length} Abschnitte geschrieben.`);

const chunkRepo = new SupabaseChunkRepository(db);
const displayTitle = src.title;
const chunks: PersistedChunk[] = subs.map((s, i) => {
  const content = `${s.ref} ${s.title}\n${s.text.join("\n")}`;
  const path = `${SOURCE_KEY}/4/${s.ref}`;
  const stableHash = buildStableHash({ sourceId: src.id, path, normalizedContent: content });
  const secId = rows[i].id;
  return {
    id: uuid(`legal_chunk:${SOURCE_KEY}:4/${s.ref}`), chunkId: buildChunkId(src.id, path, 100 + i), sourceId: src.id,
    stableHash, contentHash: stableHash, path, displayPath: `${displayTitle} ${s.ref}`, title: `${s.ref} ${s.title}`,
    displayTitle: `${s.ref} ${s.title}`, content, normalizedContent: content,
    metadata: { sectionNumber: s.ref, primarySectionId: secId },
    token: { characterCount: content.length, wordCount: content.split(/\s+/).length, tokenEstimate: Math.ceil(content.length / 4), sentenceCount: (content.match(/[.!?]/g) ?? []).length, averageSentenceLength: 0, referenceCount: 0 },
    active: true, chunkVersion: 1, createdAt: now, updatedAt: now, primarySection: secId,
  } as PersistedChunk;
});
await chunkRepo.upsertMany(chunks);
console.log(`${chunks.length} Chunks geschrieben.`);

const embRepo = new SupabaseEmbeddingRepository(db);
const provider = EmbeddingProviderFactory.forModel(EMBED_MODEL);
const result = await provider.embedMany(chunks.map((c) => c.normalizedContent), { modelId: EMBED_MODEL });
let n = 0;
for (let j = 0; j < chunks.length; j++) {
  const r = result.results[j]; const c = chunks[j];
  if (!r) continue;
  await embRepo.upsert({
    sourceId: src.id, chunkId: c.id, chunkStableHash: c.stableHash, chunkPath: c.path, providerId: r.provider,
    modelId: EMBED_MODEL, modelVersion: r.modelVersion, dimensions: r.dimensions, vector: r.vector, status: "embedded",
    contentHash: c.stableHash, inputFormatVersion: 1, tokenCount: r.usage?.totalTokens ?? null, inputCharacterCount: c.normalizedContent.length,
    usage: r.usage ?? null, cost: null, errorCode: null, errorMessage: null, attemptCount: 1, embeddedAt: now, invalidatedAt: null,
  } as any);
  n++;
}
console.log(`${n} Suchvektoren geschrieben.`);

const { data: oldChunk } = await db.from("legal_chunks").select("id").eq("source_id", src.id).eq("primary_section_id", sec4.id);
if (oldChunk?.length) {
  await db.from("legal_chunks").update({ active: false }).in("id", oldChunk.map((c: any) => c.id));
  await db.from("legal_chunk_embeddings").update({ invalidated_at: now }).in("chunk_id", oldChunk.map((c: any) => c.id));
  console.log("Sammel-Chunk von Abschnitt 4 deaktiviert.");
}
