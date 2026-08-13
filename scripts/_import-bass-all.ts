/**
 * Bulk-Import der vollständigen BASS-Bibliothek (~400 Einzeldokumente,
 * entdeckt über scripts/_discover-bass-docs.ts -> /tmp/bass-documents.tsv).
 *
 * Jedes BASS-Dokument (z.B. "20-11 Nr. 5") ist eine eigenständige Vorschrift
 * mit eigener legal_sources-Zeile - nicht Teil eines einzigen "bass-nrw"-
 * Sammel-Dokuments. bassNrwParser.ts liefert für JEDES Dokument denselben
 * hartkodierten source.key="bass-nrw" (korrekt für den bisherigen
 * Single-Document-Anwendungsfall) - hier wird er nach dem Parsen pro
 * Dokument durch einen aus der URL abgeleiteten eindeutigen Schlüssel
 * ersetzt, damit jedes Dokument seine eigene DB-Zeile bekommt.
 *
 * Resumable: überspringt Dokumente, deren legal_sources-Zeile (per
 * deterministischer ID aus der Quell-URL) schon existiert.
 *
 * Aufruf: bun run scripts/_import-bass-all.ts [--limit N] [--start-at N]
 */
import { createClient } from "@supabase/supabase-js";
import { preparedParsers, schulgesetzNrwParser } from "../src/services/legal-knowledge/import";
import { mergeDocuments } from "../src/services/legal-knowledge/connectors/OfficialSourceConnectorService";
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../src/services/legal-knowledge/import/types";
import { BASS_CHROME_NOISE, CITATION_MARKER_RE, VOM_LINE_RE, findPublishedDate } from "../src/services/legal-knowledge/import/parsers/bassSiteHeader";
import {
  SupabaseChunkRepository,
  SupabaseEmbeddingRepository,
} from "../src/services/legal-knowledge/embeddings/repositories/SupabaseRepositories";
import type { PersistedChunk } from "../src/services/legal-knowledge/embeddings/repositories/InMemoryRepositories";
import { buildChunkId, buildStableHash, sha1 } from "../src/services/legal-knowledge/chunks/ChunkHashBuilder";
import { EmbeddingProviderFactory } from "../src/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMBED_MODEL = "openai/text-embedding-3-small";
const MAX_EMBED_CHARS = 20000;
const EMBED_BATCH_SIZE = 20;
const API_BASE = "http://127.0.0.1:8080";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function deterministicUuid(seed: string): string {
  const h = sha1(seed).slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function collectText(n: LegalNode): string {
  return [n.text, ...n.children.map(collectText)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

interface FlatParagraph { path: string; reference: string; title: string | null; fullText: string; }

function hasKind(node: LegalNode, kind: string): boolean {
  if (node.kind === kind) return true;
  return node.children.some((c) => hasKind(c, kind));
}

type LeafKind = "paragraph" | "subsection" | "section" | "item" | "text";

/**
 * Manche BASS-Dokumente landen bei KEINEM spezialisierten Parser richtig
 * strukturiert (z.B. der generische erlassParser-Stub) und liefern nur
 * "text"-Fallback-Knoten. Dritte Stufe, damit solcher echter Inhalt nicht
 * stillschweigend übersprungen wird (Fund beim BASS-Vollimport, 2026-08-13).
 *
 * Nachtrag (2026-08-13): eine feste Prioritätsreihenfolge ("section" vor
 * "text") ist zu grob - manche Verwaltungsvorschriften haben ihren echten
 * Inhalt fast vollständig in "subsection"-Knoten (z.B. "1.1", "1.2" ...),
 * während ein einziger beiläufiger "section"-Knoten (z.B. eine kurze
 * "1 Bereinigt am ..."-Fußzeile) fälschlich gewinnt und den gesamten
 * Inhalt verschluckt (Fund: "14-23 Nr. 4"). Deshalb: für jede plausible
 * Ebene wirklich sammeln und die mit dem meisten Text gewinnen lassen.
 */
function chooseLeafKind(root: LegalNode): LeafKind {
  if (hasKind(root, "paragraph") || hasKind(root, "article")) return "paragraph";
  let best: LeafKind = "text";
  let bestChars = -1;
  for (const k of ["subsection", "section", "item", "text"] as const) {
    if (k !== "text" && !hasKind(root, k)) continue;
    const out: FlatParagraph[] = [];
    collectParagraphs(root, [], out, k);
    const chars = out.reduce((s, p) => s + p.fullText.length, 0);
    if (out.length > 0 && chars > bestChars) {
      best = k;
      bestChars = chars;
    }
  }
  return best;
}

function collectParagraphs(node: LegalNode, ancestry: string[], out: FlatParagraph[], leafKind: LeafKind): void {
  const isBlock =
    leafKind === "paragraph" ? node.kind === "paragraph" || node.kind === "article"
    : leafKind === "subsection" ? node.kind === "subsection"
    : leafKind === "section" ? node.kind === "section"
    : leafKind === "item" ? node.kind === "item"
    : node.kind === "text";
  const nextAncestry =
    node.kind === "chapter" || node.kind === "part" ||
    (leafKind === "paragraph" && node.kind === "section") ||
    (leafKind === "subsection" && node.kind === "section") ||
    (leafKind === "item" && (node.kind === "section" || node.kind === "subsection"))
      ? [...ancestry, node.number ?? node.heading ?? node.kind]
      : ancestry;
  if (isBlock && collectText(node).trim()) {
    // "text"-Fallback-Knoten haben kein number-Feld - synthetische Referenz vergeben.
    const reference = node.number ?? `Abs. ${out.length + 1}`;
    out.push({ path: [...ancestry, reference].join("/"), reference, title: node.heading ?? null, fullText: collectText(node) });
  }
  for (const child of node.children) collectParagraphs(child, isBlock ? ancestry : nextAncestry, out, leafKind);
}

async function sourceAlreadyImported(sourceRowId: string): Promise<boolean> {
  const { data } = await supabase.from("legal_sources").select("id").eq("id", sourceRowId).maybeSingle();
  return !!data;
}

async function upsertSource(sourceKey: string, title: string, shortName: string | null, officialUrl: string, versionLabel: string | null): Promise<string> {
  const id = deterministicUuid(`legal_source:${sourceKey}`);
  const { error } = await supabase.from("legal_sources").upsert({
    id, name: title, title, short_name: shortName, source_type: "administrative_regulation", status: "active",
    official_url: officialUrl, jurisdiction: "NRW", authority: "MSB NRW", federal_state: "NRW",
    legal_domain: "Schulrecht", version_label: versionLabel, official_source: true, authority_verified: true,
    verification_status: "unverified", lifecycle_status: "active", source_language: "de",
  }, { onConflict: "id" });
  if (error) throw new Error(`Upsert legal_sources fehlgeschlagen (${sourceKey}): ${error.message}`);
  return id;
}

async function upsertSections(sourceId: string, sourceKey: string, versionLabel: string | null, paragraphs: FlatParagraph[]): Promise<Map<string, string>> {
  const idByPath = new Map<string, string>();
  const rows = paragraphs.map((p) => {
    const id = deterministicUuid(`legal_section:${sourceKey}:${p.path}`);
    idByPath.set(p.path, id);
    return {
      id, source_id: sourceId, reference: p.reference, title: p.title, content: p.fullText,
      full_text: p.fullText || p.title || p.reference, section_number: p.reference, status: "active",
      version_label: versionLabel, metadata: {},
    };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("legal_sections").upsert(rows.slice(i, i + 200), { onConflict: "id" });
    if (error) throw new Error(`Upsert legal_sections fehlgeschlagen: ${error.message}`);
  }
  return idByPath;
}

async function upsertChunks(sourceId: string, sourceKey: string, displayTitle: string, paragraphs: FlatParagraph[], sectionIdByPath: Map<string, string>): Promise<void> {
  const chunkRepo = new SupabaseChunkRepository(supabase);
  const chunks: PersistedChunk[] = paragraphs.map((p, order) => {
    const path = `${sourceKey}/${p.path}`;
    const normalizedContent = p.fullText || p.title || p.reference;
    const stableHash = buildStableHash({ sourceId, path, normalizedContent });
    return {
      id: deterministicUuid(`legal_chunk:${sourceKey}:${p.path}`), chunkId: buildChunkId(sourceId, path, order),
      sourceId, stableHash, contentHash: stableHash, path, displayPath: `${displayTitle} ${p.path}`,
      title: p.title ?? p.reference, displayTitle: p.title ?? p.reference, content: normalizedContent,
      normalizedContent, metadata: { sectionNumber: p.reference, primarySectionId: sectionIdByPath.get(p.path) ?? null },
      token: {
        characterCount: normalizedContent.length, wordCount: normalizedContent.split(/\s+/).filter(Boolean).length,
        tokenEstimate: Math.ceil(normalizedContent.length / 4), sentenceCount: (normalizedContent.match(/[.!?]/g) ?? []).length,
        averageSentenceLength: 0, referenceCount: 0,
      },
      active: true, chunkVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      primarySection: sectionIdByPath.get(p.path),
    };
  });
  if (chunks.length > 0) await chunkRepo.upsertMany(chunks);
}

async function embedChunks(sourceId: string): Promise<{ embedded: number; skipped: number }> {
  const chunkRepo = new SupabaseChunkRepository(supabase);
  const embeddingRepo = new SupabaseEmbeddingRepository(supabase);
  const chunks = await chunkRepo.listBySource(sourceId, { activeOnly: true });
  const provider = EmbeddingProviderFactory.forModel(EMBED_MODEL);
  const modelDef = provider.getModelCapabilities(EMBED_MODEL);
  let embedded = 0, skipped = 0;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const slice = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const toEmbed: typeof slice = [];
    for (const c of slice) {
      if (!c.normalizedContent.trim()) { skipped++; continue; }
      const existing = await embeddingRepo.findActive(c.id, EMBED_MODEL, modelDef.version, 1);
      if (existing && existing.contentHash === c.stableHash) { skipped++; continue; }
      toEmbed.push(c);
    }
    if (toEmbed.length === 0) continue;
    const inputs = toEmbed.map((c) => c.normalizedContent.slice(0, MAX_EMBED_CHARS));
    const result = await provider.embedMany(inputs, { modelId: EMBED_MODEL });
    for (let j = 0; j < toEmbed.length; j++) {
      const r = result.results[j]; const c = toEmbed[j];
      if (!r) { skipped++; continue; }
      await embeddingRepo.upsert({
        sourceId, chunkId: c.id, chunkStableHash: c.stableHash, chunkPath: c.path, providerId: r.provider,
        modelId: EMBED_MODEL, modelVersion: r.modelVersion, dimensions: r.dimensions, vector: r.vector,
        status: "embedded", contentHash: c.stableHash, inputFormatVersion: 1, tokenCount: r.usage?.totalTokens ?? null,
        inputCharacterCount: inputs[j].length, usage: r.usage ?? null, cost: null, errorCode: null, errorMessage: null,
        attemptCount: 1, embeddedAt: new Date().toISOString(), invalidatedAt: null,
      });
      embedded++;
    }
  }
  return { embedded, skipped };
}

function sourceKeyFromUrl(url: string): string {
  const m = /\/(\d+)\.htm/.exec(url);
  return `bass-doc-${m ? m[1] : sha1(url).slice(0, 12)}`;
}

/**
 * Letzter Rettungsanker für bass.schule.nrw-Dokumente ohne §- oder
 * Dezimal-Gliederung (z.B. Staatsverträge/Konkordate, Bekanntmachungen in
 * reiner Fließtextform) - keiner der spezialisierten Parser matcht solche
 * Dokumente, ohne diesen Fallback gingen sie beim Vollimport vollständig
 * verloren (Fund beim BASS-Vollimport, 2026-08-13, Bsp. "20-52 Nr. 1.2"
 * Kirchenvertrag, "21-01 Nr. 31" Bekanntmachung). Nutzt dieselbe
 * Titelblock-Erkennung wie die anderen bass.schule.nrw-Parser (Aktenzeichen
 * + Titel bis "Vom ..."), teilt den Fließtext-Rumpf in Absätze anhand von
 * Leerzeilen. Wird in allParsers bewusst als LETZTER Eintrag geführt -
 * greift nur, wenn kein spezialisierter Parser zuständig ist.
 */
const bassGenericFallbackParser: LegalImportParser = {
  id: "bass-generic-fallback",
  label: "BASS Generisch (Fließtext)",
  kind: "circular",
  canParse(input: LegalImportInput): boolean {
    const onBassDomain =
      input.hint?.officialUrl?.includes("bass.schule.nrw") ||
      input.hint?.officialUrl?.includes("bass.schul-welt.de");
    if (!onBassDomain) return false;
    return input.raw.split(/\r?\n/).some((l) => CITATION_MARKER_RE.test(l.trim()));
  },
  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const titleLines: string[] = [];
    let collectingTitle = false;
    let citation: string | null = null;
    let title: string | null = null;
    let publishedAt: string | null = null;
    let consumed = 0;
    for (let i = 0; i < lines.length && i < 60; i++) {
      const line = lines[i].trim();
      if (!line) { consumed = i + 1; continue; }
      if (BASS_CHROME_NOISE.has(line)) { consumed = i + 1; continue; }
      if (!collectingTitle) {
        if (CITATION_MARKER_RE.test(line)) {
          citation = line;
          collectingTitle = true;
        }
        consumed = i + 1;
        continue;
      }
      if (VOM_LINE_RE.test(line)) {
        title = titleLines.join(" ").replace(/\s+/g, " ").trim() || null;
        publishedAt = findPublishedDate(line);
        consumed = i + 1;
        break;
      }
      titleLines.push(line);
      consumed = i + 1;
    }
    const body = lines.slice(consumed).join("\n");
    const paragraphs = body
      .split(/\r?\n\s*\r?\n/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 0 && !BASS_CHROME_NOISE.has(s));
    const root: LegalNode = {
      localId: "",
      kind: "document",
      heading: title ?? input.hint?.detectedTitle ?? "BASS-Dokument",
      children: paragraphs.map((text, i) => ({
        localId: "",
        kind: "text",
        number: `Abs. ${i + 1}`,
        text,
        children: [],
      })),
    };
    return {
      source: {
        key: "bass-generic-fallback",
        kind: "circular",
        title: title ?? input.hint?.detectedTitle ?? "BASS-Dokument",
        shortName: null,
        jurisdiction: "NRW",
        authority: "MSB NRW",
        officialUrl: input.hint?.officialUrl ?? null,
        language: "de",
        metadata: { source: "bass", bassNumber: citation },
      },
      version: {
        label: publishedAt ? `Fassung ${publishedAt}` : "Unbekannte Fassung",
        publishedAt,
        validFrom: publishedAt,
        validTo: null,
        citation,
      },
      root,
      rawText: input.raw,
    };
  },
};

async function importOne(url: string, label: string): Promise<"imported" | "skipped" | "empty" | "error"> {
  const sourceKey = sourceKeyFromUrl(url);
  const sourceRowId = deterministicUuid(`legal_source:${sourceKey}`);
  if (await sourceAlreadyImported(sourceRowId)) return "skipped";

  const crawlRes = await fetch(`${API_BASE}/api/legal-source-crawl`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    // source_id nur für die Host-Whitelist des Crawlers (bass.schule.nrw
    // ist dort hinterlegt) - NICHT für die Parserwahl, siehe unten.
    body: JSON.stringify({ source_id: "bass-nrw", url, max_pages: 1, max_depth: 0 }),
  });
  const crawl = await crawlRes.json();
  if (!crawlRes.ok || crawl.error || !crawl.documents?.length) {
    throw new Error(crawl.error ?? "Kein Dokument geladen");
  }

  // Echte Parser-Auto-Erkennung statt fest zugeordneter Registry-parserId:
  // BASS bündelt sehr unterschiedlich strukturierte Dokumente (§-Gesetze,
  // Verordnungen, Dezimal-nummerierte Runderlasse) unter derselben Domain -
  // jedes Dokument braucht seinen eigenen, inhaltlich passenden Parser.
  const raw = mergeDocuments(crawl.documents);
  const input: LegalImportInput = {
    raw,
    hint: {
      officialUrl: url,
      detectedTitle: crawl.documents[0]?.title ?? null,
      detectedVersion: crawl.documents.find((d: { versionHint?: string | null }) => d.versionHint)?.versionHint ?? null,
    },
  };
  const allParsers: LegalImportParser[] = [schulgesetzNrwParser, ...preparedParsers, bassGenericFallbackParser];
  const parser = allParsers.find((p) => p.canParse(input));
  if (!parser) return "empty";
  const document = parser.parse(input);

  const paragraphs: FlatParagraph[] = [];
  const leafKind = chooseLeafKind(document.root);
  collectParagraphs(document.root, [], paragraphs, leafKind);
  const seenPaths = new Map<string, number>();
  for (const p of paragraphs) {
    const seen = seenPaths.get(p.path) ?? 0;
    seenPaths.set(p.path, seen + 1);
    if (seen > 0) p.path = `${p.path}#${seen + 1}`;
  }

  if (paragraphs.length === 0) return "empty";

  const title = document.source.title && document.source.title !== "BASS" ? document.source.title : label;
  const rowId = await upsertSource(sourceKey, title, document.source.shortName, url, document.version.label);
  const sectionIdByPath = await upsertSections(rowId, sourceKey, document.version.label, paragraphs);
  await upsertChunks(rowId, sourceKey, title, paragraphs, sectionIdByPath);
  await embedChunks(rowId);
  return "imported";
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const startIdx = args.indexOf("--start-at");
  const startAt = startIdx >= 0 ? Number(args[startIdx + 1]) : 0;

  const tsv = await Bun.file("/tmp/bass-documents.tsv").text();
  const rows = tsv.trim().split("\n").map((line) => {
    const [url, label] = line.split("\t");
    return { url, label: label ?? url };
  });
  const slice = rows.slice(startAt, startAt + limit);
  console.log(`${slice.length} von ${rows.length} Dokumenten werden verarbeitet (ab Index ${startAt}).`);

  const stats = { imported: 0, skipped: 0, empty: 0, error: 0 };
  for (let i = 0; i < slice.length; i++) {
    const { url, label } = slice[i];
    const progress = `[${startAt + i + 1}/${rows.length}]`;
    try {
      const result = await importOne(url, label);
      stats[result]++;
      if (result !== "skipped") console.log(`${progress} ${result.toUpperCase()}: ${label.slice(0, 70)}`);
    } catch (e) {
      stats.error++;
      console.log(`${progress} FEHLER: ${label.slice(0, 60)}: ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`--- Zwischenstand: ${stats.imported} importiert, ${stats.skipped} übersprungen, ${stats.empty} leer, ${stats.error} Fehler ---`);
    }
  }

  console.log("\n=== Zusammenfassung ===");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => { console.error("Skript fehlgeschlagen:", e); process.exit(1); });
