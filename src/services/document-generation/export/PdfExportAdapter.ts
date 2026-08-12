/**
 * Sprint 4.5B – PDF-Export.
 * Nutzt `pdf-lib`. Rendert ausschließlich gespeichertes Markdown.
 * Standard-Font Helvetica (WinAnsi) – nicht-darstellbare Zeichen werden zu "?" transliteriert
 * (pdf-lib erlaubt keine anderen Glyphen mit Standardfonts).
 */
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import type { GeneratedDocument } from "../types";
import { buildExportFilename } from "./filename";
import type { Block, Inline } from "./MarkdownParser";
import { inlineToText, parseMarkdown } from "./MarkdownParser";
import type { ExportAdapter, ExportResult } from "./types";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 64;
const BODY_SIZE = 11;
const H1_SIZE = 20;
const H2_SIZE = 16;
const H3_SIZE = 13;
const LINE_GAP = 1.35;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}
interface PdfCtx {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  fonts: Fonts;
  title: string;
  version: string;
  pageNum: number;
}

export class PdfExportAdapter implements ExportAdapter {
  readonly format = "pdf" as const;
  readonly contentType = "application/pdf";

  async export(doc: GeneratedDocument): Promise<ExportResult> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(doc.title);
    pdf.setCreator("RechtKompass Schule");
    pdf.setProducer("pdf-lib");
    const fonts: Fonts = {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
      mono: await pdf.embedFont(StandardFonts.Courier),
    };
    const ctx: PdfCtx = {
      pdf,
      page: pdf.addPage([PAGE_W, PAGE_H]),
      y: PAGE_H - MARGIN_TOP,
      fonts,
      title: doc.title,
      version: (doc.workflowVersionId ?? "").slice(0, 8) || "—",
      pageNum: 1,
    };
    drawHeader(ctx);
    drawMetadata(ctx, doc);
    ensureSpace(ctx, 10);
    ctx.y -= 6;

    for (const b of parseMarkdown(doc.markdown)) {
      renderBlock(ctx, b);
    }

    // Rechtsgrundlagen-Block
    const sources = extractSources(doc);
    if (sources.length > 0) {
      ensureSpace(ctx, 40);
      ctx.y -= 8;
      renderBlock(ctx, { kind: "heading", level: 2, inline: [{ kind: "text", text: "Rechtsgrundlagen" }] });
      renderBlock(ctx, { kind: "list", ordered: false, items: sources.map((s) => [{ kind: "text", text: s }]) });
    }

    // Fußzeilen für alle Seiten setzen
    finalizeFooters(ctx);

    const bytes = await pdf.save();
    const filename = buildExportFilename({
      title: doc.title, createdAt: doc.createdAt, sessionId: doc.sessionId, extension: "pdf",
    });
    return { bytes, filename, contentType: this.contentType, format: this.format };
  }
}

function drawHeader(ctx: PdfCtx): void {
  const t = sanitize(ctx.title);
  ctx.page.drawText(t, {
    x: MARGIN_X,
    y: PAGE_H - MARGIN_TOP + 24,
    size: 9,
    font: ctx.fonts.bold,
    color: rgb(0.4, 0.4, 0.4),
  });
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: PAGE_H - MARGIN_TOP + 16 },
    end: { x: PAGE_W - MARGIN_X, y: PAGE_H - MARGIN_TOP + 16 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
}

function drawMetadata(ctx: PdfCtx, doc: GeneratedDocument): void {
  const meta: [string, string][] = [
    ["Dokument", doc.title],
    ["Status", doc.status],
    ["Erstellt", safeDate(doc.createdAt)],
    ["Workflow-Version", ctx.version],
    ["Session", doc.sessionId.slice(0, 8)],
  ];
  for (const [k, v] of meta) {
    ensureSpace(ctx, BODY_SIZE * LINE_GAP);
    ctx.page.drawText(sanitize(`${k}: `), {
      x: MARGIN_X, y: ctx.y, size: 9, font: ctx.fonts.bold, color: rgb(0.35, 0.35, 0.35),
    });
    const w = ctx.fonts.bold.widthOfTextAtSize(`${k}: `, 9);
    ctx.page.drawText(sanitize(v), {
      x: MARGIN_X + w, y: ctx.y, size: 9, font: ctx.fonts.regular, color: rgb(0.35, 0.35, 0.35),
    });
    ctx.y -= 9 * LINE_GAP;
  }
}

function renderBlock(ctx: PdfCtx, b: Block): void {
  switch (b.kind) {
    case "blank": return;
    case "pagebreak":
      newPage(ctx);
      return;
    case "hr":
      ensureSpace(ctx, 12);
      ctx.y -= 4;
      ctx.page.drawLine({
        start: { x: MARGIN_X, y: ctx.y },
        end: { x: PAGE_W - MARGIN_X, y: ctx.y },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      ctx.y -= 8;
      return;
    case "heading": {
      const size = b.level === 1 ? H1_SIZE : b.level === 2 ? H2_SIZE : H3_SIZE;
      ctx.y -= 6;
      renderInline(ctx, b.inline, { size, bold: true });
      ctx.y -= 4;
      return;
    }
    case "paragraph":
      renderInline(ctx, b.inline, { size: BODY_SIZE });
      ctx.y -= 4;
      return;
    case "list": {
      let n = 1;
      for (const item of b.items) {
        const marker = b.ordered ? `${n++}. ` : "•  ";
        renderInline(ctx, [{ kind: "text", text: marker }, ...item], { size: BODY_SIZE, indent: 12 });
      }
      ctx.y -= 4;
      return;
    }
    case "table": {
      renderTable(ctx, b.header, b.rows);
      return;
    }
  }
}

interface InlineStyle { size: number; bold?: boolean; italic?: boolean; indent?: number; }

function renderInline(ctx: PdfCtx, inline: Inline[], style: InlineStyle): void {
  const size = style.size;
  const lineHeight = size * LINE_GAP;
  const indent = style.indent ?? 0;
  const maxWidth = PAGE_W - MARGIN_X * 2 - indent;
  const tokens = tokenize(inline, style.bold ?? false, style.italic ?? false);
  let line: { text: string; bold: boolean; italic: boolean; code: boolean }[] = [];
  let lineWidth = 0;

  const flush = () => {
    if (line.length === 0) return;
    ensureSpace(ctx, lineHeight);
    let x = MARGIN_X + indent;
    for (const seg of line) {
      const font = pickFont(ctx.fonts, seg);
      const w = font.widthOfTextAtSize(seg.text, size);
      ctx.page.drawText(sanitize(seg.text), { x, y: ctx.y, size, font, color: rgb(0.15, 0.15, 0.15) });
      x += w;
    }
    ctx.y -= lineHeight;
    line = [];
    lineWidth = 0;
  };

  for (const tok of tokens) {
    if (tok.text === "\n") { flush(); continue; }
    const font = pickFont(ctx.fonts, tok);
    // Break long words if needed by splitting on spaces.
    const words = tok.text.split(/(\s+)/);
    for (const w of words) {
      if (!w) continue;
      const width = font.widthOfTextAtSize(w, size);
      if (lineWidth + width > maxWidth && line.length > 0) {
        flush();
        if (/^\s+$/.test(w)) continue;
      }
      line.push({ ...tok, text: w });
      lineWidth += width;
    }
  }
  flush();
}

interface Segment { text: string; bold: boolean; italic: boolean; code: boolean; }

function tokenize(inline: Inline[], bold: boolean, italic: boolean): Segment[] {
  const out: Segment[] = [];
  const walk = (nodes: Inline[], b: boolean, it: boolean) => {
    for (const n of nodes) {
      if (n.kind === "text") out.push({ text: sanitize(n.text), bold: b, italic: it, code: false });
      else if (n.kind === "code") out.push({ text: sanitize(n.text), bold: b, italic: it, code: true });
      else if (n.kind === "strong") walk(n.children, true, it);
      else if (n.kind === "em") walk(n.children, b, true);
    }
  };
  walk(inline, bold, italic);
  return out;
}

function pickFont(fonts: Fonts, seg: { bold: boolean; italic: boolean; code: boolean }): PDFFont {
  if (seg.code) return fonts.mono;
  if (seg.bold && seg.italic) return fonts.boldItalic;
  if (seg.bold) return fonts.bold;
  if (seg.italic) return fonts.italic;
  return fonts.regular;
}

function renderTable(ctx: PdfCtx, header: Inline[][], rows: Inline[][][]): void {
  const cols = Math.max(header.length, ...rows.map((r) => r.length), 1);
  const totalW = PAGE_W - MARGIN_X * 2;
  const colW = totalW / cols;
  const cellPad = 4;
  const size = 10;
  const lh = size * LINE_GAP;
  const drawRow = (cells: Inline[][], isHeader: boolean) => {
    const font = isHeader ? ctx.fonts.bold : ctx.fonts.regular;
    const lines: string[][] = cells.map((c) => wrapPlain(inlineToText(c) || "", font, size, colW - cellPad * 2));
    const rowH = Math.max(1, ...lines.map((l) => l.length)) * lh + cellPad * 2;
    ensureSpace(ctx, rowH);
    const yTop = ctx.y + 2;
    if (isHeader) {
      ctx.page.drawRectangle({
        x: MARGIN_X, y: yTop - rowH, width: totalW, height: rowH, color: rgb(0.93, 0.93, 0.93),
      });
    }
    // borders
    for (let i = 0; i <= cols; i++) {
      const x = MARGIN_X + i * colW;
      ctx.page.drawLine({
        start: { x, y: yTop }, end: { x, y: yTop - rowH },
        thickness: 0.4, color: rgb(0.7, 0.7, 0.7),
      });
    }
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: yTop - rowH }, end: { x: MARGIN_X + totalW, y: yTop - rowH },
      thickness: 0.4, color: rgb(0.7, 0.7, 0.7),
    });
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: yTop }, end: { x: MARGIN_X + totalW, y: yTop },
      thickness: 0.4, color: rgb(0.7, 0.7, 0.7),
    });
    for (let c = 0; c < cols; c++) {
      const cellLines = lines[c] ?? [];
      let y = yTop - cellPad - size;
      for (const l of cellLines) {
        ctx.page.drawText(sanitize(l), {
          x: MARGIN_X + c * colW + cellPad, y, size, font, color: rgb(0.15, 0.15, 0.15),
        });
        y -= lh;
      }
    }
    ctx.y -= rowH;
  };
  drawRow(padCells(header, cols), true);
  for (const r of rows) drawRow(padCells(r, cols), false);
  ctx.y -= 6;
}

function padCells(row: Inline[][], cols: number): Inline[][] {
  const out = row.slice();
  while (out.length < cols) out.push([]);
  return out.slice(0, cols);
}

function wrapPlain(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(sanitize(trial), size) <= maxWidth) cur = trial;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function ensureSpace(ctx: PdfCtx, needed: number): void {
  if (ctx.y - needed < MARGIN_BOTTOM) newPage(ctx);
}

function newPage(ctx: PdfCtx): void {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN_TOP;
  ctx.pageNum += 1;
  drawHeader(ctx);
}

function finalizeFooters(ctx: PdfCtx): void {
  const pages = ctx.pdf.getPages();
  const total = pages.length;
  pages.forEach((p, idx) => {
    const label = `RechtKompass Schule · Version ${ctx.version} · Seite ${idx + 1} / ${total}`;
    const w = ctx.fonts.regular.widthOfTextAtSize(sanitize(label), 8);
    p.drawText(sanitize(label), {
      x: PAGE_W - MARGIN_X - w, y: MARGIN_BOTTOM - 24,
      size: 8, font: ctx.fonts.regular, color: rgb(0.55, 0.55, 0.55),
    });
  });
}

function extractSources(doc: GeneratedDocument): string[] {
  const ctx = doc.usedContext as { sources?: Array<{ citation?: string }> };
  const arr = ctx?.sources;
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => s?.citation ?? "").filter((x) => x.length > 0);
}

function safeDate(d: string | Date): string {
  try { return new Date(d).toLocaleString("de-DE"); } catch { return String(d); }
}

/**
 * Standardfonts (WinAnsi) unterstützen kein volles Unicode.
 * Bekannte deutsche und einige romanische Zeichen bleiben erhalten;
 * alles andere wird zu `?` transliteriert, damit pdf-lib nicht abbricht.
 */
const WIN_ANSI_ALLOWED = /[\x20-\x7EäöüÄÖÜß€§·—–…«»„“”‚‘’´`•©®™°µ£¥¢±²³½¼¾×÷©®±–—…‘’“”«»àáâãåæçèéêëìíîïñòóôõøùúûýÀÁÂÃÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕØÙÚÛÝ]/;

export function sanitize(input: string): string {
  let out = "";
  for (const ch of input) {
    if (WIN_ANSI_ALLOWED.test(ch)) out += ch;
    else if (ch === "\t") out += "    ";
    else if (ch === "\n" || ch === "\r") out += " ";
    else out += "?";
  }
  return out;
}
