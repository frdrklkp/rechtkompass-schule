// Loader für Rohinhalte. In Sprint 4.1A: manual_text + existing_db.
// URL-Fetching und Binärformate werden bewusst nicht unterstützt.

import { UnsupportedSourceFormatError } from "../runtime/ingestionErrors";
import type { LegalIngestionInputType } from "./LegalIngestionTypes";

export interface LoadedContent {
  rawInput: string;
  origin: string;
}

export interface LoadOptions {
  inputType: LegalIngestionInputType;
  rawInput?: string;
  inputLocation?: string | null;
  existingContent?: string | null;
}

export async function loadLegalDocument(opts: LoadOptions): Promise<LoadedContent> {
  switch (opts.inputType) {
    case "manual_text": {
      const raw = (opts.rawInput ?? "").toString();
      return { rawInput: raw, origin: "manual" };
    }
    case "existing_db": {
      const raw = (opts.existingContent ?? "").toString();
      return { rawInput: raw, origin: opts.inputLocation ?? "database" };
    }
    case "official_url": {
      // Bewusst nur Verweis: kein Auto-Fetch in Sprint 4.1A.
      throw new UnsupportedSourceFormatError("official_url");
    }
    case "pdf":
    case "html":
    case "docx":
    case "markdown":
      throw new UnsupportedSourceFormatError(opts.inputType);
    default:
      throw new UnsupportedSourceFormatError(String(opts.inputType));
  }
}
