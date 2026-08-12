/** Sprint 4.5B – Export-Adapter Typen. */
import type { GeneratedDocument } from "../types";

export type ExportFormat = "md" | "docx" | "pdf";

export interface ExportResult {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
  format: ExportFormat;
}

export interface ExportAdapter {
  readonly format: ExportFormat;
  readonly contentType: string;
  export(doc: GeneratedDocument): Promise<ExportResult>;
}
