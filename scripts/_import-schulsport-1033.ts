/**
 * Volltext-Import "Sicherheitsförderung im Schulsport" (BASS 18-23 Nr. 2).
 *
 * Anlass (14.10.2026, Entscheidungsvorlage Redaktionslinien): Die Quelle
 * 5c6fdd5c enthielt nur vier Satzfetzen der BASS-Seite. Der Runderlass vom
 * 03.01.2020 verweist für die eigentlichen Regeln auf Heft 1033 der
 * Schriftenreihe "Schule in NRW" (Rechtsgrundlagen, verbindlich für Sport-
 * unterricht, außerunterrichtlichen Schulsport und Ganztag). Dieses Skript
 * ersetzt die Fetzen durch den Erlass (Nr. 1-3) und die nummerierten
 * Abschnitte des Hefts (Teil I allgemein, Teil II je Sportbereich).
 *
 * Verknüpfungen auf die alten Fetzen werden vorher umgehängt bzw. entfernt
 * (RELINK). Text-Extraktion über macOS PDFKit (osascript).
 * Aufruf: bun run scripts/_import-schulsport-1033.ts [--dry-run]
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
import { sentenceStart } from "../src/lib/caseCitationCoverage";

const dry = process.argv.includes("--dry-run");
const PDF_URL = "https://www.schulsport-nrw.de/fileadmin/user_upload/1033_Inhalt.pdf";
const BASS_URL = "https://bass.schule.nrw/14927.htm";
const SOURCE_ID = "5c6fdd5c-1d03-40f4-f3eb-98042220abca";
const SOURCE_KEY = "bass-18-23-nr-2-heft-1033";
const EMBED_MODEL = "openai/text-embedding-3-small";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const uuid = (seed: string) => { const h = sha1(seed).slice(0, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

const dir = mkdtempSync(join(tmpdir(), "schulsport-1033-"));
const pdfPath = join(dir, "1033.pdf");
writeFileSync(pdfPath, Buffer.from(await (await fetch(PDF_URL)).arrayBuffer()));
const raw = execFileSync("osascript", ["-l", "JavaScript", "-e",
  `ObjC.import('PDFKit'); $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(${JSON.stringify(pdfPath)})).string.js`], { maxBuffer: 64 * 1024 * 1024 }).toString();

// Umlaute zusammensetzen, weiche Trennstriche und Silbentrennung ("Bewe- gung") auflösen;
// Ergänzungsstriche ("Sport- und Bewegungs...") bleiben stehen.
const text = raw.normalize("NFC").replace(/­/g, "").replace(//g, "•")
  .replace(/(\p{L})- (?!(?:und|oder|bzw|sowie)\b)(\p{Ll})/gu, "$1$2");

const erlassStart = text.indexOf("1. Sicherheitsförderung als Aufgabe des Schulsports");
const erlassEnd = text.indexOf("Inhalt Seite");
const bodyStart = text.indexOf("Teil I Allgemeiner Teil");
const bodyEnd = text.indexOf("13 Anlagen/Links 13.1", bodyStart);
if (erlassStart < 0 || erlassEnd < 0 || bodyStart < 0 || bodyEnd < 0) throw new Error("Gliederung des PDF nicht gefunden");
const body = text.slice(bodyStart, bodyEnd);

// Überschriften des Inhaltsverzeichnisses (volle Titel für die Anzeige, Suchtext für den Fund im Fließtext)
const TOC: Array<[string, string, string?]> = [
  ["1", "Geltungsbereich"], ["1.1", "Schulsport"], ["1.2", "Lehrkräfte"],
  ["2", "Sicherheitsförderung im Schulsport"], ["2.1", "Sicherheitsförderung als Aufgabe des Schulsports"], ["2.2", "Fachliche Voraussetzungen"],
  ["2.3", "Organisation und Aufsicht"], ["2.3.1", "Grundsätze"], ["2.3.2", "Übungsstätte"], ["2.3.3", "Wege zur Übungsstätte"],
  ["2.4", "Persönliche Ausstattung und Ausrüstung"], ["2.5", "Sportgeräte"], ["2.6", "Sofortmaßnahmen und Erste Hilfe bei Unfällen"],
  ["2.6.1", "Sachliche Voraussetzungen"], ["2.6.2", "Maßnahmen bei Unfällen"], ["2.6.3", "Vorgehen bei Verletzungen der Schülerinnen und Schüler"],
  ["3", "Bewegen im Wasser – Schwimmen", "Bewegen im Wasser"],
  ["4", "Laufen, Springen, Werfen – Leichtathletik", "§Laufen, Springen, Werfen – Leichtathletik"],
  ["5", "Bewegen an Geräten – Turnen", "Bewegen an Geräten"], ["5.1", "Gerätturnen"], ["5.2", "Trampolinturnen", "Trampolinturnen"],
  ["5.3", "Parkour/Freerunning", "Parkour"], ["5.4", "Klettern"], ["5.5", "Slackline"],
  ["6", "Gestalten, Tanzen, Darstellen – Gymnastik/Tanz/Bewegungskünste", "§Gestalten, Tanzen, Darstellen"],
  ["7", "Spielen in und mit Regelstrukturen – Sportspiele", "Spielen in und mit Regelstrukturen"],
  ["8", "Gleiten, Fahren, Rollen – Rollsport, Bootsport, Wintersport", "Gleiten, Fahren, Rollen"],
  ["8.1", "Inline-Skating, Skateboarden, Waveboarden, Rollschuhfahren", "Inline-Skating"], ["8.2", "Radfahren und Mountainbiken"],
  ["8.3", "Weitere Rollsportarten"], ["8.4", "Segeln"], ["8.5", "Segelfahrten mit Plattbodenschiffen"],
  ["8.6", "Windsurfen", "§Windsurfen\nFachliche"], ["8.7", "Kanufahren"], ["8.8", "Rudern"],
  ["8.9", "Wasserski/Wakeboarden", "§Wasserski/Wakeboarden"],
  ["8.10", "Wellenreiten auf einer Wellenreitanlage mit stehender Welle", "Wellenreiten auf einer Wellenreitanlage"],
  ["8.11", "Wellenreiten in offenem Gewässer"], ["8.12", "Stand-up Paddling"],
  ["8.13", "Skilaufen/Snowboarden/Skilanglaufen/Rodeln – Schneesport", "Skilaufen"], ["8.14", "Eislaufen"], ["8.15", "Flugsport"],
  ["9", "Ringen und Kämpfen – Zweikampfsport", "Ringen und Kämpfen"], ["10", "Weitere schulsportliche Angebote"],
  ["10.1", "Reiten und Pferdesport"], ["10.2", "Wanderungen/Wanderfahrten", "Wanderungen"], ["10.2.1", "Wanderungen im Watt"], ["10.2.2", "Wanderungen im Gebirge"],
  ["11", "Risikoabschätzung für nicht aufgeführte Bewegungsfelder/Sportbereiche", "§Risikoabschätzung für nicht aufgeführte"],
  ["12", "Schlussbestimmungen"],
];
const GENERIC = ["Fachliche Voraussetzungen", "Organisation und Aufsicht", "Persönliche Ausstattung und Ausrüstung", "Sportgeräte"];
const words = (s: string) => s.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\u00a0]+");
// Normaler Fund: "<Nummer> <Titel>"; "§..." = Titel ohne Nummer am Zeilenanfang (PDF trennt dort die Nummer ab).
const finder = (num: string, needle: string) => needle.startsWith("§")
  ? new RegExp("(?<=\\n)" + words(needle.slice(1)))
  : new RegExp("(?<![\\d.,§])" + num.replace(/\./g, "\\.") + "\\.?[\\s\\u00a0]+" + words(needle));
const cands: Array<{ num: string; title: string; needle: string }> = TOC.map(([num, title, needle]) => ({ num, title, needle: needle ?? title }));
for (const [num] of TOC) if (/^([3-9]|10\.1$)/.test(num) && num !== "10") GENERIC.forEach((g, k) => cands.push({ num: `${num}.${k + 1}`, title: g, needle: g }));
const order = (n: string) => n.split(".").map(Number);
cands.sort((a, b) => { const x = order(a.num), y = order(b.num); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; } return 0; });
const seen = new Set<string>();
const heads: Array<{ num: string; title: string; at: number; end: number }> = [];
let pos = 0;
for (const c of cands) {
  if (seen.has(c.num)) continue;
  const re = finder(c.num, c.needle); re.lastIndex = 0;
  const m = re.exec(body.slice(pos));
  if (!m) continue;
  seen.add(c.num);
  const at = pos + m.index;
  heads.push({ num: c.num, title: c.title, at, end: at + m[0].length - (c.needle.startsWith("§") && c.needle.includes("\n") ? c.needle.length - 1 - c.needle.indexOf("\n") : 0) });
  pos = at + m[0].length;
}
const tocTitle = new Map(TOC.map(([n, t]) => [n, t]));
const clean = (s: string) => s.replace(/\n\s*\d{1,2}\s*\n/g, "\n").replace(/^\d{1,2}\s+(?=\p{Lu})/u, "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
type Part = { num: string; title: string; content: string };
let parts: Part[] = heads.map((h, i) => ({ num: h.num, title: h.title, content: clean(body.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : body.length)) }));
// Leere Kapitelköpfe ("5.1 Gerätturnen" direkt vor "5.1.1") in den Titel des Folgeabschnitts übernehmen
const merged: Part[] = [];
for (let i = 0; i < parts.length; i++) {
  const p = parts[i];
  if (p.content.replace(/^[–\s]+/, "").length < 60 && i + 1 < parts.length && parts[i + 1].num.startsWith(p.num + ".")) {
    parts[i + 1] = { ...parts[i + 1], content: (p.content.length >= 20 ? p.content + "\n" : "") + parts[i + 1].content };
    continue;
  }
  merged.push(p);
}
parts = merged;
// Generische Unterüberschriften mit dem Sportbereich verbinden ("8.13.2 Organisation und Aufsicht – Skilaufen/...")
const display = (p: Part) => {
  const parent = p.num.split(".").slice(0, -1).join(".");
  return GENERIC.includes(p.title) && parent && parent !== "2" ? `${p.title} – ${tocTitle.get(parent) ?? ""}` : p.title;
};
const erlassText = clean(text.slice(erlassStart, erlassEnd));
const erlassParts = ["1. Sicherheitsförderung als Aufgabe des Schulsports", "2. Rechtsgrundlagen zur Sicherheitsförderung im Schulsport", "3. Schlussbestimmung"]
  .map((h, i, all) => { const a = erlassText.indexOf(h); const b = i + 1 < all.length ? erlassText.indexOf(all[i + 1]) : erlassText.length; return { num: `${i + 1}`, title: h.replace(/^\d\.\s*/, ""), content: erlassText.slice(a + h.length, b).trim() }; });

for (const p of erlassParts) console.log(`Erlass Nr. ${p.num} ${p.title} (${p.content.length})`);
for (const p of parts) console.log(`${p.num.padEnd(7)} ${display(p).slice(0, 70).padEnd(71)} ${p.content.length}`);
if (erlassParts.some((p) => p.content.length < 100)) throw new Error("Erlass-Abschnitt unplausibel kurz");
const must = ["1.1", "1.2", "2.2", "2.3.1", "2.3.2", "2.4", "2.5", "2.6.2", "2.6.3", "4", "8.13.2", "11"];
const missing = must.filter((n) => !parts.some((p) => p.num === n));
if (missing.length) throw new Error("Abschnitte fehlen: " + missing.join(", "));
if (dry) process.exit(0);

// Verknüpfungen auf die alten Satzfetzen: Sportfälle umhängen, Nicht-Sport-Fälle lösen (Geltungsbereich Nr. 1.1)
const RELINK: Record<string, string[]> = {
  "63f04dd4-71ac-4244-b8fd-907cf21fe8ab": ["8.13.2", "2.3.1", "2.6.2"], // Schneesportexkursion
  "f5e9f240-e669-42d5-8663-6dccd64bf210": ["2.3.1", "2.3.2", "5.1.2"], // Turngeräte vor Unterrichtsbeginn
  "661ae841-8803-490f-a5e9-16039a6ab4c8": ["2.3.1", "2.2", "2.6.2", "2.6.3"], // Aufsicht im Sportunterricht
};
const now = new Date().toISOString();
const ref = (num: string) => `Heft 1033 Nr. ${num}`;
const rows = [
  ...erlassParts.map((p, i) => ({ key: `Erlass Nr. ${p.num}`, title: p.title, content: p.content, order: i + 1, url: BASS_URL })),
  ...parts.map((p, i) => ({ key: ref(p.num), title: `${p.num} ${display(p)}`, content: p.content, order: 10 + i, url: PDF_URL })),
].map((r) => ({
  id: uuid(`legal_section:${SOURCE_KEY}:${r.key}`), source_id: SOURCE_ID, reference: r.key, title: r.title, content: r.content, full_text: r.content,
  section_number: r.key, status: "active", version_label: "03.01.2020", metadata: {}, parser_method: "schulsport-1033-pdfkit", parser_confidence: 0.85,
  import_url: r.url, imported_at: now, source_hash: sha1(r.content).slice(0, 16), order_index: r.order,
}));

const { error: srcErr } = await db.from("legal_sources").update({
  version_label: "03.01.2020", official_url: BASS_URL, updated_at: now,
  description: "Runderlass vom 03.01.2020 (BASS 18-23 Nr. 2) mit den verbindlichen Rechtsgrundlagen aus Heft 1033 „Sicherheitsförderung im Schulsport“ (Schule in NRW).",
}).eq("id", SOURCE_ID);
if (srcErr) throw new Error("legal_sources: " + srcErr.message);
const { error: secErr } = await db.from("legal_sections").upsert(rows, { onConflict: "id" });
if (secErr) throw new Error("legal_sections: " + secErr.message);

const keepIds = new Set(rows.map((r) => r.id));
const { data: old } = await db.from("legal_sections").select("id").eq("source_id", SOURCE_ID);
const oldIds = (old ?? []).map((s: any) => s.id).filter((id: string) => !keepIds.has(id));
const byNum = new Map(rows.map((r) => [r.reference, r]));
if (oldIds.length) {
  const { data: links } = await db.from("case_legal_links").select("id,case_id").in("legal_section_id", oldIds);
  for (const [caseId, nums] of Object.entries(RELINK)) {
    const { data: have } = await db.from("case_legal_links").select("legal_section_id").eq("case_id", caseId);
    const haveIds = new Set((have ?? []).map((l: any) => l.legal_section_id));
    const ins = nums.map((n) => byNum.get(ref(n))!).filter((r) => !haveIds.has(r.id)).map((r, i) => ({
      case_id: caseId, legal_section_id: r.id, relevance: i === 0 ? "high" : "medium",
      explanation: `Sicherheitsförderung im Schulsport, ${r.title}.`, content_summary: sentenceStart(r.content), content_summary_kind: "wortlaut",
    }));
    if (ins.length) { const { error } = await db.from("case_legal_links").insert(ins); if (error) throw new Error("case_legal_links: " + error.message); }
  }
  if (links?.length) { const { error } = await db.from("case_legal_links").delete().in("id", links.map((l: any) => l.id)); if (error) throw new Error("Altlinks: " + error.message); }
  await db.from("legal_chunks").delete().eq("source_id", SOURCE_ID);
  const { error: delErr } = await db.from("legal_sections").delete().in("id", oldIds);
  if (delErr) throw new Error("Altabschnitte: " + delErr.message);
  console.log(`Altabschnitte entfernt: ${oldIds.length}, Altlinks gelöst: ${links?.length ?? 0}`);
}

await db.from("legal_chunks").delete().eq("source_id", SOURCE_ID);
const chunkRepo = new SupabaseChunkRepository(db);
const TITLE = "Sicherheitsförderung im Schulsport";
const chunks: PersistedChunk[] = rows.map((r, i) => {
  const content = `${r.title}\n${r.content}`;
  const path = `${SOURCE_KEY}/${r.reference}`;
  const stableHash = buildStableHash({ sourceId: SOURCE_ID, path, normalizedContent: content });
  return {
    id: uuid(`legal_chunk:${path}`), chunkId: buildChunkId(SOURCE_ID, path, i), sourceId: SOURCE_ID, stableHash, contentHash: stableHash, path,
    displayPath: `${TITLE} – ${r.reference} ${r.title}`, title: r.title, displayTitle: r.title, content, normalizedContent: content,
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
    sourceId: SOURCE_ID, chunkId: c.id, chunkStableHash: c.stableHash, chunkPath: c.path, providerId: r.provider, modelId: EMBED_MODEL,
    modelVersion: r.modelVersion, dimensions: r.dimensions, vector: r.vector, status: "embedded", contentHash: c.stableHash, inputFormatVersion: 1,
    tokenCount: r.usage?.totalTokens ?? null, inputCharacterCount: c.normalizedContent.length, usage: r.usage ?? null, cost: null,
    errorCode: null, errorMessage: null, attemptCount: 1, embeddedAt: now, invalidatedAt: null,
  } as any);
  n++;
}
console.log(`Quelle ${SOURCE_ID}: ${rows.length} Abschnitte, ${chunks.length} Chunks, ${n} Suchvektoren.`);
