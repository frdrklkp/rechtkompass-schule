/**
 * Sprint 4.5G – Link-Erkennung.
 *
 * Erkennt relative und absolute Links, Unterseiten, Anlagen und
 * Dokumentversionen. Filtert Navigationsrauschen und Fremd-Hosts.
 */
import { canonicalizeUrl, isWhitelistedHost, normalizeHost } from "./whitelist";

const EXCLUDE_HINTS = [
  "/druck", "/print", "/share", "/login", "/logout", "/impressum",
  "/datenschutz", "/kontakt", "/suche", "/search", "/rss", "/feed",
  "/barrierefreiheit", "/warenkorb",
];

const BINARY_EXT = /\.(zip|jpe?g|png|gif|svg|webp|mp[34]|mov|avi|css|js|ico)(\?|$)/i;
export const ATTACHMENT_EXT = /\.(pdf|docx?|xlsx?|rtf)(\?|$)/i;

export interface LinkCandidate {
  url: string;
  /** Anlage (PDF, DOCX …) statt HTML-Unterseite. */
  attachment: boolean;
  text: string;
}

export interface LinkExtractionOptions {
  baseUrl: string;
  allowedHosts: readonly string[];
  /** Optionales Muster für Dokumentlinks – wenn gesetzt, wird bevorzugt gefiltert. */
  documentLinkPattern?: RegExp;
}

const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF_RE = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;

export function extractLinks(html: string, opts: LinkExtractionOptions): LinkCandidate[] {
  const out = new Map<string, LinkCandidate>();
  let m: RegExpExecArray | null;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const label = (m[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const hrefMatch = attrs.match(HREF_RE);
    const raw = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? "").trim();
    if (!raw) continue;
    if (/^\s*(mailto:|tel:|javascript:|data:|#)/i.test(raw)) continue;

    const canonical = canonicalizeUrl(raw, opts.baseUrl);
    if (!canonical) continue;
    let parsed: URL;
    try {
      parsed = new URL(canonical);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    if (!isWhitelistedHost(parsed.hostname, opts.allowedHosts)) continue;
    if (BINARY_EXT.test(canonical)) continue;
    const lower = canonical.toLowerCase();
    if (EXCLUDE_HINTS.some((h) => lower.includes(h))) continue;

    const attachment = ATTACHMENT_EXT.test(canonical);
    if (!attachment && opts.documentLinkPattern && !opts.documentLinkPattern.test(canonical)) {
      continue;
    }
    if (!out.has(canonical)) out.set(canonical, { url: canonical, attachment, text: label });
  }
  return [...out.values()];
}

export function sameSite(a: string, b: string): boolean {
  try {
    return normalizeHost(new URL(a).hostname) === normalizeHost(new URL(b).hostname);
  } catch {
    return false;
  }
}
