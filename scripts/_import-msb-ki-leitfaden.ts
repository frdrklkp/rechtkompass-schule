/**
 * Import des Handlungsleitfadens "Umgang mit textgenerierenden KI-Systemen"
 * des Ministeriums für Schule und Bildung NRW (02/2023) als Quelle.
 *
 * Anlass (14.10.2026, Rot-Sanierung): Die roten KI-Fälle scheiterten an
 * Kernfragen, die kein Gesetz ausdrücklich beantwortet - Schülerdaten in
 * KI-Tools, Verlässlichkeit von KI-Detektoren, nicht gekennzeichnete
 * KI-Nutzung als Täuschung. Der Leitfaden ist die offizielle Orientierung
 * des Landes dazu. Er ist KEINE Rechtsnorm: source_type "guideline",
 * source_type_v2 "other" - Fälle dürfen ihn als Verwaltungsauffassung
 * zitieren, nicht als gesetzliche Pflicht.
 *
 * Text-Extraktion über macOS PDFKit (osascript), daher nur auf macOS lauffähig.
 * Aufruf: bun run scripts/_import-msb-ki-leitfaden.ts [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SupabaseChunkRepository, SupabaseEmbeddingRepository } from "../src/services/legal-knowledge/embeddings/repositories/SupabaseRepositories";
import type { PersistedChunk } from "../src/services/legal-knowledge/embeddings/repositories/InMemoryRepositories";
import { buildChunkId, buildStableHash, sha1 } from "../src/services/legal-knowledge/chunks/ChunkHashBuilder";
import { EmbeddingProviderFactory } from "../src/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";

const dry = process.argv.includes("--dry-run");
const URL = "https://www.schulministerium.nrw/system/files/media/document/file/handlungsleitfaden_ki_msb_nrw_230223.pdf";
const SOURCE_KEY = "msb-ki-leitfaden-2023";
const TITLE = "Umgang mit textgenerierenden KI-Systemen – Ein Handlungsleitfaden (Ministerium für Schule und Bildung NRW, 02/2023)";
const EMBED_MODEL = "openai/text-embedding-3-small";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const uuid = (seed: string) => { const h = sha1(seed).slice(0, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

const dir = mkdtempSync(join(tmpdir(), "msb-ki-"));
const pdfPath = join(dir, "leitfaden.pdf");
writeFileSync(pdfPath, Buffer.from(await (await fetch(URL)).arrayBuffer()));
const raw = execFileSync("osascript", ["-l", "JavaScript", "-e",
  `ObjC.import('PDFKit'); $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(${JSON.stringify(pdfPath)})).string.js`]).toString();

// Silbentrennung am Zeilenumbruch ("ren- ren") zusammenziehen, Seitenköpfe entfernen.
// Das PDF speichert Umlaute zerlegt (o + U+0308) - vorher zusammensetzen.
const text = raw
  .normalize("NFC")
  .replace(/UMGANG MIT TEXTGENERIERENDEN KI-SYSTEMEN/g, " ")
  // Ergänzungsstriche ("Lebens- und Arbeitsbereiche") bleiben stehen.
  .replace(/(\p{Ll})-\s+(?!(?:und|oder|bzw|sowie)\b)(\p{Ll})/gu, "$1$2")
  .replace(/\u00ad\s*/g, "")
  .replace(/[ \t]+/g, " ");
const body = text.slice(text.indexOf("Vorbemerkung\n") >= 0 ? text.indexOf("Vorbemerkung\n") : text.lastIndexOf("Vorbemerkung"));

const HEADINGS = [
  "Vorbemerkung",
  "Was sind textgenerierende KI (z.B. ChatGPT) und was können diese leisten?",
  "Warum kann es zu Fehlinformationen bei textgenerierenden KI-Anwendungen kommen?",
  "Gibt die KI neutrale und vorurteilsfreie Antworten?",
  "Wie soll mit dieser neuen Möglichkeit schulisch umgegangen werden?",
  "Darf eine textgenerierende KI im Unterricht eingesetzt werden?",
  "Vor welchem Hintergrund soll die Beschäftigung mit KI-Anwendungen stattfinden?",
  "Welche rechtlichen und praktischen Rahmenbedingungen sind bei der Nutzung im unterrichtlichen Zusammenhang zu beachten?",
  "Welche Konsequenzen kann die textgenerierende KI-Anwendung für die Entwicklung von Textkompetenzen der Schülerinnen und Schüler haben?",
  "Kann KI den Lernprozess auch unterstützen?",
  "Kann ich mit den Schülerinnen und Schülern Regeln vereinbaren, wie die Nutzung von KI in Texten gekennzeichnet werden kann?",
  "Wie gehe ich damit um, wenn Schülerinnen und Schüler die KI nutzen, dies aber nicht angeben?",
  "Wie kann ich Aufgaben stellen, die weniger dafür anfällig sind, dass sie ausschließlich von einer KI erledigt werden?",
  "Welchen Nutzen könnte es für mich als Lehrkraft geben?",
  "Ausblick",
];
// Überschriften stehen im PDF teils mit Zeilenumbrüchen/geschütztem Trennstrich - tolerant suchen.
const pattern = (h: string) => new RegExp(h.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-\\s]*")).join("[\\s\\u00ad]+"), "u");
const positions = HEADINGS.map((h) => { const m = body.match(pattern(h)); return { h, at: m?.index ?? -1, len: m?.[0].length ?? 0 }; });
const missing = positions.filter((p) => p.at < 0).map((p) => p.h);
if (missing.length) throw new Error("Überschriften nicht gefunden: " + missing.join(" | "));
const sorted = [...positions].sort((a, b) => a.at - b.at);
const end = body.search(/\n\s*Impressum\s*\n/);
const parts = sorted.map((p, i) => ({
  title: p.h,
  content: body.slice(p.at + p.len, i + 1 < sorted.length ? sorted[i + 1].at : end).replace(/\n\s*\d{1,2}\s*\n/g, "\n").replace(/\s*\n\s*/g, "\n").trim(),
}));
for (const [i, p] of parts.entries()) console.log(`${i + 1}. ${p.title} (${p.content.length} Zeichen): ${p.content.slice(0, 90).replace(/\n/g, " ")}…`);
if (parts.some((p) => p.content.length < 150)) throw new Error("Abschnitt unplausibel kurz, Abbruch.");
if (dry) process.exit(0);

const now = new Date().toISOString();
const sourceId = uuid(`legal_source:${SOURCE_KEY}`);
const { error: srcErr } = await db.from("legal_sources").upsert({
  id: sourceId, name: TITLE, title: TITLE, short_name: "KI-Leitfaden MSB", source_type: "guideline", source_type_v2: "other", status: "active",
  official_url: URL, jurisdiction: "NRW", authority: "Ministerium für Schule und Bildung des Landes Nordrhein-Westfalen", federal_state: "NRW",
  legal_domain: "KI im Unterricht", version_label: "02/2023", official_source: true, authority_verified: true,
  verification_status: "unverified", lifecycle_status: "active", source_language: "de",
  description: "Handlungsleitfaden des Schulministeriums (Orientierung, keine Rechtsnorm).",
}, { onConflict: "id" });
if (srcErr) throw new Error("legal_sources: " + srcErr.message);

const rows = parts.map((p, i) => {
  const ref = `Abschnitt ${i + 1}`;
  return {
    id: uuid(`legal_section:${SOURCE_KEY}:${ref}`), source_id: sourceId, reference: ref, title: p.title, content: p.content, full_text: p.content,
    section_number: ref, status: "active", version_label: "02/2023", metadata: {}, parser_method: "msb-ki-leitfaden-pdfkit", parser_confidence: 0.9,
    import_url: URL, imported_at: now, source_hash: sha1(p.content).slice(0, 16), order_index: i + 1,
  };
});
const { error: secErr } = await db.from("legal_sections").upsert(rows, { onConflict: "id" });
if (secErr) throw new Error("legal_sections: " + secErr.message);

await db.from("legal_chunks").delete().eq("source_id", sourceId);
const chunkRepo = new SupabaseChunkRepository(db);
const chunks: PersistedChunk[] = rows.map((r, i) => {
  const content = `${r.title}\n${r.content}`;
  const path = `${SOURCE_KEY}/${r.reference}`;
  const stableHash = buildStableHash({ sourceId, path, normalizedContent: content });
  return {
    id: uuid(`legal_chunk:${path}`), chunkId: buildChunkId(sourceId, path, i), sourceId, stableHash, contentHash: stableHash, path,
    displayPath: `${TITLE} – ${r.title}`, title: r.title, displayTitle: r.title, content, normalizedContent: content,
    metadata: { sectionNumber: r.reference, primarySectionId: r.id },
    token: { characterCount: content.length, wordCount: content.split(/\s+/).length, tokenEstimate: Math.ceil(content.length / 4), sentenceCount: (content.match(/[.!?]/g) ?? []).length, averageSentenceLength: 0, referenceCount: 0 },
    active: true, chunkVersion: 1, createdAt: now, updatedAt: now, primarySection: r.id,
  } as PersistedChunk;
});
await chunkRepo.upsertMany(chunks);

const embRepo = new SupabaseEmbeddingRepository(db);
const provider = EmbeddingProviderFactory.forModel(EMBED_MODEL);
const result = await provider.embedMany(chunks.map((c) => c.normalizedContent), { modelId: EMBED_MODEL });
let n = 0;
for (let j = 0; j < chunks.length; j++) {
  const r = result.results[j]; const c = chunks[j];
  if (!r) continue;
  await embRepo.upsert({
    sourceId, chunkId: c.id, chunkStableHash: c.stableHash, chunkPath: c.path, providerId: r.provider, modelId: EMBED_MODEL,
    modelVersion: r.modelVersion, dimensions: r.dimensions, vector: r.vector, status: "embedded", contentHash: c.stableHash, inputFormatVersion: 1,
    tokenCount: r.usage?.totalTokens ?? null, inputCharacterCount: c.normalizedContent.length, usage: r.usage ?? null, cost: null,
    errorCode: null, errorMessage: null, attemptCount: 1, embeddedAt: now, invalidatedAt: null,
  } as any);
  n++;
}
console.log(`Quelle ${sourceId}: ${rows.length} Abschnitte, ${chunks.length} Chunks, ${n} Suchvektoren.`);
