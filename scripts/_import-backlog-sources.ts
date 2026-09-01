/**
 * Import der Quellen-Backlog-Prioritäten aus dem Nachtlauf 2026-08-26
 * (Quellenlücken-Analyse über alle Prüfbegründungen): DSG NRW (18 blockierte
 * Fälle), KunstUrhG (Bildnisrecht), SGB VIII (§ 8a Kindeswohl). Nutzt
 * denselben Crawl-/Upsert-/Embed-Ablauf wie scripts/_import-dienstrecht-
 * sources.ts, aber mit legal_domain/jurisdiction je Ziel statt fix.
 *
 * Aufruf: bun run scripts/_import-backlog-sources.ts
 */
import { createClient } from "@supabase/supabase-js";
import { bbigParser, dsgNrwParser, jarbschgParser, kunsturhgParser, sgb8Parser } from "../src/services/legal-knowledge/import";
import { mergeDocuments } from "../src/services/legal-knowledge/connectors/OfficialSourceConnectorService";
import type { LegalImportInput, LegalImportParser, LegalNode } from "../src/services/legal-knowledge/import/types";
import {
  SupabaseChunkRepository,
  SupabaseEmbeddingRepository,
} from "../src/services/legal-knowledge/embeddings/repositories/SupabaseRepositories";
import type { PersistedChunk } from "../src/services/legal-knowledge/embeddings/repositories/InMemoryRepositories";
import { buildChunkId, buildStableHash, sha1 } from "../src/services/legal-knowledge/chunks/ChunkHashBuilder";
import { EmbeddingProviderFactory } from "../src/services/legal-knowledge/embeddings/providers/EmbeddingProviderFactory";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const EMBED_MODEL = "openai/text-embedding-3-small";
const MAX_EMBED_CHARS = 20000;
const EMBED_BATCH_SIZE = 20;
const API_BASE = "http://127.0.0.1:8080";
const ADMIN_EMAIL = "admin@rechtkompass.local";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TARGETS: Array<{ url: string; label: string; sourceId: string; parser: LegalImportParser; legalDomain: string; bund: boolean }> = [
  {
    url: "https://recht.nrw.de/lrgv/gesetz/01042026-datenschutzgesetz-nordrhein-westfalen/",
    label: "DSG NRW",
    sourceId: "dsg-nrw",
    parser: dsgNrwParser,
    legalDomain: "Datenschutz",
    bund: false,
  },
  {
    url: "https://www.gesetze-im-internet.de/kunsturhg/BJNR000070907.html",
    label: "KunstUrhG",
    sourceId: "kunsturhg",
    parser: kunsturhgParser,
    legalDomain: "Datenschutz",
    bund: true,
  },
  {
    url: "https://www.gesetze-im-internet.de/sgb_8/BJNR111630990.html",
    label: "SGB VIII",
    sourceId: "sgb-8",
    parser: sgb8Parser,
    legalDomain: "Kinder- und Jugendhilfe",
    bund: true,
  },
  {
    url: "https://www.gesetze-im-internet.de/bbig_2005/BJNR093110005.html",
    label: "BBiG",
    sourceId: "bbig",
    parser: bbigParser,
    legalDomain: "Ausbildungsrecht",
    bund: true,
  },
  {
    url: "https://www.gesetze-im-internet.de/jarbschg/BJNR009650976.html",
    label: "JArbSchG",
    sourceId: "jarbschg",
    parser: jarbschgParser,
    legalDomain: "Ausbildungsrecht",
    bund: true,
  },
];

async function getAuthToken(): Promise<string> {
  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
  if (error) throw new Error(`generateLink fehlgeschlagen: ${error.message}`);
  const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: data.properties!.hashed_token,
    type: "magiclink",
  });
  if (verifyErr || !verified.session) throw new Error(`verifyOtp fehlgeschlagen: ${verifyErr?.message}`);
  return verified.session.access_token;
}

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

function collectParagraphs(node: LegalNode, ancestry: string[], out: FlatParagraph[], inheritedHeading: string | null = null): void {
  const currentHeading = node.heading?.trim() || inheritedHeading;
  const isBlock = node.kind === "paragraph";
  const nextAncestry = node.kind === "part" || node.kind === "section"
    ? [...ancestry, node.number ?? node.heading ?? node.kind]
    : ancestry;
  if (isBlock && collectText(node).trim()) {
    const localReference = node.number ?? `Abs. ${out.length + 1}`;
    const fullReference = [...ancestry, localReference].join(".");
    out.push({
      path: [...ancestry, localReference].join("/"),
      reference: fullReference,
      title: node.heading?.trim() || inheritedHeading || null,
      fullText: collectText(node),
    });
  }
  for (const child of node.children) collectParagraphs(child, isBlock ? ancestry : nextAncestry, out, currentHeading);
}

async function upsertSource(sourceKey: string, title: string, shortName: string | null, officialUrl: string, versionLabel: string | null, legalDomain: string, bund: boolean): Promise<string> {
  const id = deterministicUuid(`legal_source:${sourceKey}`);
  const { error } = await supabase.from("legal_sources").upsert({
    id, name: title, title, short_name: shortName, source_type: "law", status: "active",
    official_url: officialUrl, jurisdiction: bund ? "Bund" : "NRW",
    authority: bund ? "Bundesrepublik Deutschland" : "Land Nordrhein-Westfalen",
    federal_state: bund ? null : "NRW",
    legal_domain: legalDomain, version_label: versionLabel, official_source: true, authority_verified: true,
    verification_status: "unverified", lifecycle_status: "active", source_language: "de",
  }, { onConflict: "id" });
  if (error) throw new Error(`Upsert legal_sources fehlgeschlagen (${sourceKey}): ${error.message}`);
  return id;
}

async function upsertSections(sourceId: string, sourceKey: string, versionLabel: string | null, paragraphs: FlatParagraph[], parserId: string, officialUrl: string): Promise<Map<string, string>> {
  const idByPath = new Map<string, string>();
  const importedAt = new Date().toISOString();
  const rows = paragraphs.map((p) => {
    const id = deterministicUuid(`legal_section:${sourceKey}:${p.path}`);
    idByPath.set(p.path, id);
    return {
      id, source_id: sourceId, reference: p.reference, title: p.title, content: p.fullText,
      full_text: p.fullText || p.title || p.reference, section_number: p.reference, status: "active",
      version_label: versionLabel, metadata: {},
      parser_method: parserId, parser_confidence: p.title ? 0.9 : 0.6,
      import_url: officialUrl, imported_at: importedAt, source_hash: sha1(p.fullText).slice(0, 16),
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

async function importOne(target: (typeof TARGETS)[number], authToken: string): Promise<void> {
  console.log(`\n=== ${target.label} ===`);
  const crawlRes = await fetch(`${API_BASE}/api/legal-source-crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ source_id: target.sourceId, url: target.url, max_pages: 5, max_depth: 0 }),
  });
  const crawl = await crawlRes.json();
  if (!crawlRes.ok || crawl.error || !crawl.documents?.length) {
    throw new Error(crawl.error ?? "Kein Dokument geladen");
  }
  console.log(`  Gecrawlt: ${crawl.documents.length} Dokument(e), Titel: "${crawl.documents[0]?.title ?? "?"}"`);

  const raw = mergeDocuments(crawl.documents);
  const input: LegalImportInput = {
    raw,
    hint: {
      officialUrl: target.url,
      detectedTitle: crawl.documents[0]?.title ?? null,
      detectedVersion: crawl.documents.find((d: { versionHint?: string | null }) => d.versionHint)?.versionHint ?? null,
    },
  };

  const document = target.parser.parse(input);
  const paragraphs: FlatParagraph[] = [];
  collectParagraphs(document.root, [], paragraphs);
  const seenPaths = new Map<string, number>();
  for (const p of paragraphs) {
    const seen = seenPaths.get(p.path) ?? 0;
    seenPaths.set(p.path, seen + 1);
    if (seen > 0) p.path = `${p.path}#${seen + 1}`;
  }

  console.log(`  Erkannte Paragraphen: ${paragraphs.length}`);
  if (paragraphs.length === 0) {
    console.log("  WARNUNG: 0 Paragraphen erkannt - Parser passt vermutlich nicht zur echten Seitenstruktur. Kein Import.");
    console.log("  --- Erste 40 Zeilen des Rohtexts zur Diagnose ---");
    console.log(raw.split(/\r?\n/).slice(0, 40).join("\n"));
    return;
  }
  console.log(`  Beispiel: ${paragraphs[0].reference} ${paragraphs[0].title ?? ""} -> "${paragraphs[0].fullText.slice(0, 100)}..."`);

  const rowId = await upsertSource(target.sourceId, document.source.title, document.source.shortName, target.url, document.version.label, target.legalDomain, target.bund);
  const sectionIdByPath = await upsertSections(rowId, target.sourceId, document.version.label, paragraphs, target.parser.id, target.url);
  await upsertChunks(rowId, target.sourceId, document.source.title, paragraphs, sectionIdByPath);
  const embedStats = await embedChunks(rowId);
  console.log(`  Importiert: ${paragraphs.length} Abschnitte, ${embedStats.embedded} neu embedded, ${embedStats.skipped} übersprungen (bereits vorhanden).`);
}

async function main() {
  console.log("Bootstrapping Auth-Token für /api/legal-source-crawl...");
  const authToken = await getAuthToken();
  console.log("Token bereit.");

  for (const target of TARGETS) {
    try {
      await importOne(target, authToken);
    } catch (e) {
      console.log(`  FEHLER bei ${target.label}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch((e) => { console.error("Skript fehlgeschlagen:", e); process.exit(1); });
