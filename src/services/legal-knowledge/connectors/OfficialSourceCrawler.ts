/**
 * Sprint 4.5G – Crawler für offizielle Rechtsquellen.
 *
 * Breadth-First mit Besuchs-Set (keine Endlosschleifen), Dubletten-Erkennung
 * über kanonische URL und Inhalts-Hash. Keine Persistenz, keine Parserlogik.
 */
import { Downloader, DownloadError } from "./Downloader";
import { contentHash, detectVersionHint, extractTitle, htmlToText } from "./HtmlExtractor";
import { extractLinks, ATTACHMENT_EXT } from "./LinkExtractor";
import { canonicalizeUrl } from "./whitelist";
import type {
  CrawlPageError,
  CrawlProgress,
  CrawlResult,
  ExtractedDocument,
  OfficialSourceDefinition,
} from "./types";

export interface CrawlOptions {
  definition: OfficialSourceDefinition;
  startUrl?: string;
  downloader: Downloader;
  maxPages?: number;
  maxDepth?: number;
  /** Mindestlänge, ab der eine Seite als Dokument gilt. */
  minChars?: number;
  onProgress?: (p: CrawlProgress) => void;
  now?: () => number;
}

function progress(partial: Partial<CrawlProgress>, base: CrawlProgress): CrawlProgress {
  return { ...base, ...partial };
}

export async function crawlOfficialSource(opts: CrawlOptions): Promise<CrawlResult> {
  const def = opts.definition;
  const startUrl = canonicalizeUrl(opts.startUrl?.trim() || def.defaultUrl) ?? def.defaultUrl;
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? def.maxPages, 200));
  const maxDepth = Math.max(0, Math.min(opts.maxDepth ?? def.maxDepth, 6));
  const minChars = opts.minChars ?? 200;
  const now = opts.now ?? Date.now;
  const started = now();

  const visited = new Set<string>();
  const seenHashes = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const documents: ExtractedDocument[] = [];
  const errors: CrawlPageError[] = [];
  let duplicates = 0;
  let downloaded = 0;

  let state: CrawlProgress = {
    phase: "discovering",
    found: 1,
    downloaded: 0,
    processed: 0,
    validated: 0,
    deltaReady: false,
    ratio: 0,
  };
  opts.onProgress?.(state);

  while (queue.length > 0 && visited.size < maxPages) {
    const next = queue.shift()!;
    if (visited.has(next.url)) continue;
    visited.add(next.url);

    state = progress(
      { phase: "downloading", message: next.url, found: visited.size + queue.length },
      state,
    );
    opts.onProgress?.(state);

    let html = "";
    try {
      const page = await opts.downloader.download(next.url);
      html = page.html;
      downloaded++;
    } catch (err) {
      errors.push({
        url: next.url,
        message: err instanceof DownloadError ? err.message : (err as Error)?.message ?? "Abruf fehlgeschlagen",
      });
      continue;
    }

    state = progress({ phase: "extracting", downloaded }, state);
    opts.onProgress?.(state);

    const text = htmlToText(html);
    const hash = contentHash(text);
    const isAttachment = ATTACHMENT_EXT.test(next.url);

    if (text.length >= minChars) {
      if (seenHashes.has(hash)) {
        duplicates++;
      } else {
        seenHashes.add(hash);
        documents.push({
          url: next.url,
          title: extractTitle(html) || next.url,
          text,
          contentHash: hash,
          links: [],
          versionHint: detectVersionHint(text),
          charCount: text.length,
          attachment: isAttachment,
        });
      }
    }

    if (next.depth < maxDepth) {
      const links = extractLinks(html, {
        baseUrl: next.url,
        allowedHosts: def.hosts,
        documentLinkPattern: def.documentLinkPattern,
      });
      for (const link of links) {
        if (visited.has(link.url)) continue;
        if (queue.some((q) => q.url === link.url)) continue;
        if (visited.size + queue.length >= maxPages * 4) break;
        queue.push({ url: link.url, depth: next.depth + 1 });
      }
    }

    state = progress(
      {
        phase: "extracting",
        processed: documents.length,
        found: visited.size + queue.length,
        ratio: Math.min(1, visited.size / maxPages),
      },
      state,
    );
    opts.onProgress?.(state);
  }

  const truncated = visited.size >= maxPages && queue.length > 0;
  state = progress({ phase: "parsing", ratio: 1, message: undefined }, state);
  opts.onProgress?.(state);

  return {
    startUrl,
    sourceId: def.id,
    documents,
    duplicates,
    visited: [...visited],
    errors,
    durationMs: now() - started,
    truncated,
  };
}
