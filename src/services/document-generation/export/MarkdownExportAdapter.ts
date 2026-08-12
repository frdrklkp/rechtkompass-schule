/** Sprint 4.5B – Markdown-Export: liefert das gespeicherte Markdown 1:1. */
import type { GeneratedDocument } from "../types";
import { buildExportFilename } from "./filename";
import type { ExportAdapter, ExportResult } from "./types";

export class MarkdownExportAdapter implements ExportAdapter {
  readonly format = "md" as const;
  readonly contentType = "text/markdown;charset=utf-8";

  async export(doc: GeneratedDocument): Promise<ExportResult> {
    const bytes = new TextEncoder().encode(doc.markdown);
    const filename = buildExportFilename({
      title: doc.title,
      createdAt: doc.createdAt,
      sessionId: doc.sessionId,
      extension: "md",
    });
    return { bytes, filename, contentType: this.contentType, format: this.format };
  }
}
