/** Sprint 4.5B – Export-Adapter Registry. */
import { DocxExportAdapter } from "./DocxExportAdapter";
import { MarkdownExportAdapter } from "./MarkdownExportAdapter";
import { PdfExportAdapter } from "./PdfExportAdapter";
import type { ExportAdapter, ExportFormat } from "./types";

export function getExportAdapter(format: ExportFormat): ExportAdapter {
  switch (format) {
    case "md": return new MarkdownExportAdapter();
    case "docx": return new DocxExportAdapter();
    case "pdf": return new PdfExportAdapter();
    default: throw new Error(`Unbekanntes Exportformat: ${format satisfies never}`);
  }
}

export function isExportFormat(x: unknown): x is ExportFormat {
  return x === "md" || x === "docx" || x === "pdf";
}

export * from "./types";
export { MarkdownExportAdapter, DocxExportAdapter, PdfExportAdapter };
export { buildExportFilename, slugify } from "./filename";
export { parseMarkdown, parseInline, inlineToText } from "./MarkdownParser";
export type { Block, Inline } from "./MarkdownParser";
