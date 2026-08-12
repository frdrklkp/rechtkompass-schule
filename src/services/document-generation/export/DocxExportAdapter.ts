/**
 * Sprint 4.5B – DOCX-Export.
 * Nutzt `docx`. Rendert ausschließlich das gespeicherte Markdown (keine erneute KI).
 * Unterstützt Überschriften, Absätze, Listen, Tabellen, Hervorhebungen, Seitenumbrüche,
 * Kopf-/Fußzeile, Rechtsgrundlagenblock, Metadatenblock.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { GeneratedDocument } from "../types";
import { buildExportFilename } from "./filename";
import type { Block, Inline } from "./MarkdownParser";
import { inlineToText, parseMarkdown } from "./MarkdownParser";
import type { ExportAdapter, ExportResult } from "./types";

export class DocxExportAdapter implements ExportAdapter {
  readonly format = "docx" as const;
  readonly contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  async export(doc: GeneratedDocument): Promise<ExportResult> {
    const blocks = parseMarkdown(doc.markdown);
    const children: (Paragraph | Table)[] = [];

    // Metadaten-Block
    children.push(...metadataBlock(doc));
    children.push(spacer());

    for (const b of blocks) {
      pushBlock(children, b);
    }

    // Rechtsgrundlagen-Block (aus usedContext, falls vorhanden)
    const sources = extractSources(doc);
    if (sources.length > 0) {
      children.push(spacer());
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "Rechtsgrundlagen", bold: true })],
        }),
      );
      for (const s of sources) {
        children.push(
          new Paragraph({
            numbering: { reference: "bullets", level: 0 },
            children: [new TextRun(s)],
          }),
        );
      }
    }

    const docx = new Document({
      creator: "RechtKompass Schule",
      title: doc.title,
      styles: {
        default: { document: { run: { font: "Arial", size: 22 } } },
        paragraphStyles: [
          { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 32, bold: true, font: "Arial" },
            paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
          { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 28, bold: true, font: "Arial" },
            paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
          { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 24, bold: true, font: "Arial" },
            paragraph: { spacing: { before: 160, after: 100 }, outlineLevel: 2 } },
        ],
      },
      numbering: {
        config: [
          { reference: "bullets",
            levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
          { reference: "numbers",
            levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: doc.title, bold: true, size: 20, color: "555555" })],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: `RechtKompass Schule · Version ${(doc.workflowVersionId ?? "").slice(0, 8) || "—"}`,
                      size: 18,
                      color: "888888",
                    }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(docx);
    const bytes = new Uint8Array(buffer);
    const filename = buildExportFilename({
      title: doc.title, createdAt: doc.createdAt, sessionId: doc.sessionId, extension: "docx",
    });
    return { bytes, filename, contentType: this.contentType, format: this.format };
  }
}

function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun("")] });
}

function metadataBlock(doc: GeneratedDocument): Paragraph[] {
  const rows: [string, string][] = [
    ["Dokument", doc.title],
    ["Status", doc.status],
    ["Erstellt", formatDate(doc.createdAt)],
    ["Workflow-Version", (doc.workflowVersionId ?? "—").slice(0, 8) || "—"],
    ["Session", doc.sessionId.slice(0, 8)],
  ];
  return rows.map(
    ([k, v]) =>
      new Paragraph({
        children: [
          new TextRun({ text: `${k}: `, bold: true, size: 20, color: "555555" }),
          new TextRun({ text: v, size: 20, color: "555555" }),
        ],
      }),
  );
}

function extractSources(doc: GeneratedDocument): string[] {
  const ctx = doc.usedContext as { sources?: Array<{ citation?: string }> };
  const arr = ctx?.sources;
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => s?.citation ?? "").filter((x) => x.length > 0);
}

function formatDate(d: string | Date): string {
  try {
    return new Date(d).toLocaleString("de-DE");
  } catch {
    return String(d);
  }
}

function pushBlock(out: (Paragraph | Table)[], b: Block): void {
  switch (b.kind) {
    case "blank":
      return;
    case "pagebreak":
      out.push(new Paragraph({ children: [new PageBreak()] }));
      return;
    case "hr":
      out.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } },
          children: [new TextRun("")],
        }),
      );
      return;
    case "heading": {
      const lvl = Math.min(Math.max(b.level, 1), 3) as 1 | 2 | 3;
      const level = lvl === 1 ? HeadingLevel.HEADING_1 : lvl === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      out.push(new Paragraph({ heading: level, children: inlineToRuns(b.inline) }));
      return;
    }
    case "paragraph":
      out.push(new Paragraph({ children: inlineToRuns(b.inline) }));
      return;
    case "list":
      for (const item of b.items) {
        out.push(
          new Paragraph({
            numbering: { reference: b.ordered ? "numbers" : "bullets", level: 0 },
            children: inlineToRuns(item),
          }),
        );
      }
      return;
    case "table": {
      const cols = Math.max(b.header.length, ...b.rows.map((r) => r.length), 1);
      const totalWidth = 9360;
      const colW = Math.floor(totalWidth / cols);
      const widths = Array(cols).fill(colW);
      const cell = (inline: Inline[], header: boolean) =>
        new TableCell({
          width: { size: colW, type: WidthType.DXA },
          shading: header ? { fill: "EEEEEE", type: ShadingType.CLEAR, color: "auto" } : undefined,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: inlineToRuns(inline, { bold: header }) })],
        });
      const rows: TableRow[] = [];
      rows.push(
        new TableRow({
          tableHeader: true,
          children: padRow(b.header, cols).map((c) => cell(c, true)),
        }),
      );
      for (const r of b.rows) {
        rows.push(new TableRow({ children: padRow(r, cols).map((c) => cell(c, false)) }));
      }
      out.push(
        new Table({
          width: { size: totalWidth, type: WidthType.DXA },
          columnWidths: widths,
          rows,
        }),
      );
      return;
    }
  }
}

function padRow(row: Inline[][], cols: number): Inline[][] {
  const out = row.slice();
  while (out.length < cols) out.push([]);
  return out.slice(0, cols);
}

function inlineToRuns(inline: Inline[], baseStyle: { bold?: boolean; italics?: boolean } = {}): TextRun[] {
  const runs: TextRun[] = [];
  const walk = (nodes: Inline[], style: { bold?: boolean; italics?: boolean }) => {
    for (const n of nodes) {
      if (n.kind === "text") runs.push(new TextRun({ text: n.text, ...style }));
      else if (n.kind === "code") runs.push(new TextRun({ text: n.text, font: "Consolas", ...style }));
      else if (n.kind === "strong") walk(n.children, { ...style, bold: true });
      else if (n.kind === "em") walk(n.children, { ...style, italics: true });
    }
  };
  walk(inline, baseStyle);
  if (runs.length === 0) runs.push(new TextRun({ text: inlineToText(inline) }));
  return runs;
}
