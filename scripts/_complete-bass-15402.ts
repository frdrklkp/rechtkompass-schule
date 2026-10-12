/**
 * BASS 12-52 Nr. 1 (Teilnahme am Unterricht und an sonstigen
 * Schulveranstaltungen, bass.schule.nrw/15402.htm): Der Import begann erst
 * bei Nr. 3.1 - es fehlten Nr. 1 (Teilnahmepflicht), Nr. 2
 * (Schulversäumnisse) und vor allem der Einleitungssatz von Nr. 3 ("Wichtige
 * Gründe, bei deren Vorliegen die Schulleiterin oder der Schulleiter ...
 * beurlauben kann, sofern wichtige schulische Gründe dem nicht
 * entgegenstehen, sind insbesondere:"). Außerdem war die Aufzählung von
 * Nr. 3.3 abgeschnitten (Fund 12.10.2026, Fall "Freistellung am Tag vor der
 * schriftlichen Abschlussprüfung").
 *
 * Dieses Skript legt Nr. 1, 2 und 3 (Einleitung) als eigene Abschnitte mit
 * Chunk und Suchvektor an und ersetzt den abgeschnittenen Abschnitt 3.3
 * durch den vollständigen Wortlaut (alter Chunk wird deaktiviert).
 *
 * Aufruf: bun run scripts/_complete-bass-15402.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { SupabaseChunkRepository, SupabaseEmbeddingRepository } from "../src/services/legal-knowledge/embeddings/repositories/SupabaseRepositories";
import type { PersistedChunk } from "../src/services/legal-knowledge/embeddings/repositories/InMemoryRepositories";
import { buildChunkId, buildStableHash, sha1 } from "../src/services/legal-knowledge/chunks/ChunkHashBuilder";
import { EmbeddingProviderFactory } from "../src/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";

const dry = process.argv.includes("--dry-run");
const URL = "https://bass.schule.nrw/15402.htm";
const SOURCE_KEY = "bass-doc-15402";
const EMBED_MODEL = "openai/text-embedding-3-small";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const uuid = (seed: string) => { const h = sha1(seed).slice(0, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

const html = await (await fetch(URL)).text();
const lines = html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
  .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr|td)>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
  .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const text = lines.join("\n");

function between(from: RegExp, to: RegExp): string {
  const a = text.search(from);
  const rest = a >= 0 ? text.slice(a) : "";
  const b = rest.slice(1).search(to);
  if (a < 0 || b < 0) throw new Error(`Grenzen nicht gefunden: ${from} .. ${to} - Seitenaufbau geändert?`);
  return rest.slice(0, b + 1).trim();
}
const nr1 = between(/^1 Teilnahmepflicht/m, /^2 Schulversäumnisse/m);
const nr2 = between(/^2 Schulversäumnisse/m, /^3 Beurlaubung vom Unterricht/m);
const nr3 = between(/^3 Beurlaubung vom Unterricht/m, /^3\.1 Persönliche Anlässe/m);
const nr33 = between(/^3\.3 Teilnahme an Veranstaltungen/m, /^Die Dauer der Beurlaubung soll je Schuljahr/m);

const head = (s: string) => s.split("\n")[0];
const body = (s: string) => s.split("\n").slice(1).join("\n");
const NEW = [
  { ref: "Nr. 1", title: "Teilnahmepflicht (§ 43 Absatz 1 SchulG)", content: body(nr1), order: -3 },
  { ref: "Nr. 2", title: "Schulversäumnisse (§ 43 Absatz 2 SchulG)", content: body(nr2), order: -2 },
  { ref: "Nr. 3", title: "Beurlaubung vom Unterricht und von sonstigen Schulveranstaltungen (§ 43 Absatz 4 Satz 1 Alternative 1 SchulG)", content: nr3.slice(nr3.indexOf("Wichtige Gründe")), order: -1 },
];
for (const n of NEW) console.log(`\n## ${n.ref} ${n.title}\n${n.content}`);
console.log(`\n## 3.3 (vollständig)\n${nr33}`);
if (!/sind insbesondere:/.test(NEW[2].content) || !/1\.1 /.test(NEW[0].content) || !/2\.2 /.test(NEW[1].content) || !/Sportveranstaltungen/.test(nr33)) {
  throw new Error("Zerlegung unplausibel, Abbruch.");
}
if (dry) process.exit(0);

const { data: src } = await db.from("legal_sources").select("id,title").eq("official_url", URL).eq("status", "active").single();
const { data: abs4 } = await db.from("legal_sections").select("*").eq("source_id", src.id).eq("reference", "Abs. 4").single();
if (!head(nr33).startsWith("3.3") || !String(abs4.content).startsWith("3.3")) throw new Error("Abschnitt 3.3 nicht eindeutig.");
const now = new Date().toISOString();

const rows = NEW.map((n) => ({
  id: uuid(`legal_section:${SOURCE_KEY}:${n.ref}`), source_id: src.id, reference: n.ref, title: n.title,
  content: n.content, full_text: n.content, section_number: n.ref, status: "active", version_label: abs4.version_label,
  metadata: { completedAt: now, reason: "Import begann erst bei Nr. 3.1" }, parser_method: "bass-complete-15402", parser_confidence: 0.95,
  import_url: URL, imported_at: now, source_hash: sha1(n.content).slice(0, 16), order_index: n.order,
}));
const { error: secErr } = await db.from("legal_sections").upsert(rows, { onConflict: "id" });
if (secErr) throw new Error("legal_sections: " + secErr.message);
const { error: updErr } = await db.from("legal_sections").update({
  content: nr33, full_text: nr33, source_hash: sha1(nr33).slice(0, 16), updated_at: now,
  metadata: { ...(abs4.metadata ?? {}), completedAt: now, reason: "Aufzählung war abgeschnitten" },
}).eq("id", abs4.id);
if (updErr) throw new Error("Abschnitt 3.3: " + updErr.message);
console.log(`\n${rows.length} Abschnitte angelegt, Abschnitt 3.3 vervollständigt.`);

const targets = [
  ...rows.map((r, i) => ({ secId: r.id, path: `${SOURCE_KEY}/${r.reference}`, title: `${r.reference} ${r.title}`, content: `${r.reference} ${r.title}\n${r.content}`, order: 200 + i })),
  { secId: abs4.id, path: `${SOURCE_KEY}/3.3-vollstaendig`, title: head(nr33), content: nr33, order: 210 },
];
const chunkRepo = new SupabaseChunkRepository(db);
const chunks: PersistedChunk[] = targets.map((t) => {
  const stableHash = buildStableHash({ sourceId: src.id, path: t.path, normalizedContent: t.content });
  return {
    id: uuid(`legal_chunk:${t.path}`), chunkId: buildChunkId(src.id, t.path, t.order), sourceId: src.id,
    stableHash, contentHash: stableHash, path: t.path, displayPath: `${src.title} ${t.title}`, title: t.title,
    displayTitle: t.title, content: t.content, normalizedContent: t.content,
    metadata: { sectionNumber: t.title, primarySectionId: t.secId },
    token: { characterCount: t.content.length, wordCount: t.content.split(/\s+/).length, tokenEstimate: Math.ceil(t.content.length / 4), sentenceCount: (t.content.match(/[.!?]/g) ?? []).length, averageSentenceLength: 0, referenceCount: 0 },
    active: true, chunkVersion: 1, createdAt: now, updatedAt: now, primarySection: t.secId,
  } as PersistedChunk;
});

// Alten (abgeschnittenen) Chunk von 3.3 deaktivieren, bevor der neue geschrieben wird.
const newChunkIds = new Set(chunks.map((c) => c.id));
const { data: oldChunks } = await db.from("legal_chunks").select("id").eq("source_id", src.id).eq("primary_section_id", abs4.id);
const stale = (oldChunks ?? []).map((c: any) => c.id).filter((id: string) => !newChunkIds.has(id));
if (stale.length) {
  await db.from("legal_chunks").update({ active: false }).in("id", stale);
  await db.from("legal_chunk_embeddings").update({ invalidated_at: now }).in("chunk_id", stale);
  console.log(`${stale.length} alter Chunk von 3.3 deaktiviert.`);
}
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
