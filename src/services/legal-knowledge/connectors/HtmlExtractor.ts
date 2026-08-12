/**
 * Sprint 4.5G – HTML Extractor.
 *
 * Reines Parsen: keine Skriptausführung, kein Rendering von Fremdinhalten.
 * Erzeugt aus Roh-HTML einen strukturierten Textstrom, den die bestehenden
 * Parser (BASS, Schulgesetz, APO-BK, VV) unverändert verarbeiten können.
 */

const BLOCK_TAGS = /<\/(p|div|section|article|li|tr|h[1-6]|table|ul|ol|blockquote)>/gi;

export function stripDangerousMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&sect;/gi, "§")
    .replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

export function extractTitle(html: string): string {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = decodeEntities(h1[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (t) return t;
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (title) return decodeEntities(title[1]).replace(/\s+/g, " ").trim();
  return "";
}

/** Bevorzugt den inhaltlichen Hauptbereich, fällt sonst auf <body> zurück. */
export function extractMainRegion(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main && main[1].length > 200) return main[1];
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article && article[1].length > 200) return article[1];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

export function htmlToText(html: string): string {
  const safe = stripDangerousMarkup(html);
  const region = extractMainRegion(safe)
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  const withRows = region
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>\s*/gi, " | ")
    .replace(/<tr\b[^>]*>/gi, "|")
    .replace(BLOCK_TAGS, "\n\n");
  const text = decodeEntities(withRows.replace(/<[^>]+>/g, ""));
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const VERSION_PATTERNS: RegExp[] = [
  /Stand:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/i,
  /Fassung\s+vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/i,
  /Zuletzt\s+ge[äa]ndert[^\d]{0,20}(\d{1,2}\.\d{1,2}\.\d{4})/i,
  /\bvom\s+(\d{1,2}\.\d{1,2}\.\d{4})/i,
];

export function detectVersionHint(text: string): string | null {
  for (const re of VERSION_PATTERNS) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

/** djb2 – identisch zum Hashing-Ansatz des Import-Frameworks. */
export function contentHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
