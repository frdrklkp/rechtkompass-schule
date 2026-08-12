/**
 * Gemeinsam genutzte Parser-Utilities für den Import offizieller
 * Rechtsquellen. Wird von /api/import-legal-source und
 * /api/crawl-legal-source verwendet. Reine Web-APIs, kein Node.
 */

export type ParsedSection = {
  section_number: string;
  title: string;
  full_text: string;
  official_url: string;
  source_hash: string;
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&sect;/gi, "§")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return " "; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return " "; }
    });
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article|dt|dd)[^>]*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function shortHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const MARKER = new RegExp(
  "(" +
    "§\\s*\\d+[a-z]?" +
    "|Artikel\\s+\\d+[a-z]?" +
    "|Art\\.?\\s*\\d+[a-z]?" +
    "|Abschnitt\\s+\\d+[a-z]?" +
    "|Kapitel\\s+\\d+[a-z]?" +
    "|Teil\\s+\\d+[a-z]?" +
    "|Nummer\\s+\\d+(?:\\.\\d+)*" +
    "|Nr\\.?\\s*\\d+(?:\\.\\d+)*" +
    "|\\d{1,3}-\\d{1,3}\\s*Nr\\.?\\s*\\d+" +
    ")",
  "i",
);

export const MARKER_GLOBAL = new RegExp(MARKER.source, "gi");
export const MARKER_LINE_GLOBAL = new RegExp("^\\s*" + MARKER.source + "\\b([^\\n]{0,240})?", "gim");

export function normalizeNumber(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^Art\.?\s*/i, "Art. ")
    .replace(/^Artikel\s+/i, "Artikel ")
    .replace(/^Nr\.?\s*/i, "Nr. ")
    .trim();
}

export function cleanTitle(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:.·]+/, "")
    .trim()
    .slice(0, 200);
}

type Block = { text: string; anchor: string | null };

export function extractBlocks(html: string): Block[] {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const blocks: Block[] = [];
  const tagRe = /<(h[1-6]|p|div|li|tr|td|dt|dd|section|article|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  let lastAnchor: string | null = null;
  while ((m = tagRe.exec(cleaned)) !== null) {
    const attrs = m[2] || "";
    const inner = m[3] || "";
    const idMatch = /\bid\s*=\s*"([^"]+)"/i.exec(attrs) || /\bname\s*=\s*"([^"]+)"/i.exec(attrs);
    if (idMatch) lastAnchor = idMatch[1];
    const text = decodeEntities(inner.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (text) blocks.push({ text, anchor: lastAnchor });
  }
  return blocks;
}

export async function parseFromDom(html: string, baseUrl: string): Promise<ParsedSection[]> {
  const blocks = extractBlocks(html);
  if (!blocks.length) return [];
  type Header = { index: number; number: string; title: string; anchor: string | null };
  const headers: Header[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.text.length > 300) continue;
    const mm = new RegExp("^\\s*" + MARKER.source + "\\b(.*)$", "i").exec(b.text);
    if (!mm) continue;
    const rest = (mm[2] || "").trim();
    headers.push({
      index: i,
      number: normalizeNumber(mm[1]),
      title: cleanTitle(rest),
      anchor: b.anchor,
    });
  }
  if (headers.length < 2) return [];
  const sections: ParsedSection[] = [];
  for (let h = 0; h < headers.length; h++) {
    const cur = headers[h];
    const next = headers[h + 1];
    const bodyBlocks = blocks
      .slice(cur.index + 1, next ? next.index : blocks.length)
      .map((b) => b.text)
      .filter(Boolean);
    let title = cur.title;
    if (!title && bodyBlocks.length && bodyBlocks[0].length <= 120) {
      title = cleanTitle(bodyBlocks[0]);
      bodyBlocks.shift();
    }
    const full_text = bodyBlocks.join("\n\n").trim().slice(0, 8000);
    if (!full_text || full_text.length < 20) continue;
    const url = cur.anchor ? `${baseUrl.split("#")[0]}#${cur.anchor}` : baseUrl;
    sections.push({
      section_number: cur.number,
      title: title || "",
      full_text,
      official_url: url,
      source_hash: await shortHash(cur.number + "|" + full_text),
    });
  }
  return sections;
}

export async function parseFromText(text: string, baseUrl: string): Promise<ParsedSection[]> {
  type Hit = { number: string; title: string; start: number; end: number };
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MARKER_LINE_GLOBAL.source, "gim");
  while ((m = re.exec(text)) !== null) {
    hits.push({
      number: normalizeNumber(m[1]),
      title: cleanTitle(m[2] || ""),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  const sections: ParsedSection[] = [];
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i];
    const next = hits[i + 1];
    const body = text.slice(cur.end, next ? next.start : text.length).trim();
    if (!body || body.length < 20) continue;
    const full_text = body.slice(0, 8000);
    sections.push({
      section_number: cur.number,
      title: cur.title,
      full_text,
      official_url: baseUrl,
      source_hash: await shortHash(cur.number + "|" + full_text),
    });
  }
  return sections;
}

export async function parseHtmlToSections(
  html: string,
  url: string,
): Promise<{
  sections: ParsedSection[];
  mode: "dom" | "regex" | "fallback";
  markerCount: number;
  charCount: number;
}> {
  const text = stripHtml(html);
  const markerCount = (text.match(MARKER_GLOBAL) ?? []).length;
  let mode: "dom" | "regex" | "fallback" = "dom";
  let sections = await parseFromDom(html, url);
  if (sections.length < 2) {
    const alt = await parseFromText(text, url);
    if (alt.length > sections.length) {
      sections = alt;
      mode = "regex";
    }
  }
  if (sections.length === 0 && text.length > 100) {
    mode = "fallback";
    const full_text = text.slice(0, 8000);
    sections.push({
      section_number: "Dokument",
      title: "Automatisch importierter Text (keine Paragraphen erkannt)",
      full_text,
      official_url: url,
      source_hash: await shortHash("dokument|" + full_text),
    });
  }
  const seen = new Set<string>();
  sections = sections.filter((s) => {
    const k = s.section_number + "|" + s.source_hash;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { sections, mode, markerCount, charCount: text.length };
}

export function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return "";
  return decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 240);
}

/** Erkennt eine BASS-Nummer aus URL oder Titel (z. B. „12-08 Nr. 1"). */
export function guessBassNumber(url: string, title: string): string | null {
  const t = title || "";
  const m = /(\d{1,3}-\d{1,3})\s*Nr\.?\s*(\d+)/i.exec(t);
  if (m) return `${m[1]} Nr. ${m[2]}`;
  const m2 = /\/(\d{2,5})\.html?$/i.exec(url);
  return m2 ? `BASS-Seite ${m2[1]}` : null;
}
