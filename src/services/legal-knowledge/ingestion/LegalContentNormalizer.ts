// Deterministische Textnormalisierung. Kein KI-Aufruf, keine Persistenz.

import type { LegalContentStats } from "./LegalIngestionTypes";

const CTRL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const NBSP_RE = /\u00A0/g;
const MULTIPLE_LF_RE = /\n{3,}/g;
const TRAILING_WS_RE = /[ \t]+$/gm;
const MULTI_SPACE_RE = /[ \t]{2,}/g;

const SECTION_MARKER_RE = /(?:§|Art\.|Artikel)\s*\d+/;

export function normalizeLegalContent(input: string): string {
  if (!input) return "";
  let s = input;
  // Zeilenenden vereinheitlichen
  s = s.replace(/\r\n?/g, "\n");
  // Steuerzeichen entfernen
  s = s.replace(CTRL_CHARS_RE, "");
  // NBSP → normales Leerzeichen
  s = s.replace(NBSP_RE, " ");
  // Windows-Bullets vereinheitlichen
  s = s.replace(/[•●◦]/g, "•");
  // Trailing whitespace auf jeder Zeile
  s = s.replace(TRAILING_WS_RE, "");
  // Mehrfach-Leerzeichen (nicht am Zeilenanfang für Einrückung)
  s = s.split("\n").map((line) => {
    const m = line.match(/^(\s*)(.*)$/);
    if (!m) return line;
    const indent = m[1] ?? "";
    const rest = (m[2] ?? "").replace(MULTI_SPACE_RE, " ");
    return indent + rest;
  }).join("\n");
  // §-Referenzen mit gleichmäßigem Leerzeichen: "§5" → "§ 5"
  s = s.replace(/§\s*(\d)/g, "§ $1");
  s = s.replace(/Art\.\s*(\d)/g, "Art. $1");
  // Mehr als 2 Leerzeilen → 2
  s = s.replace(MULTIPLE_LF_RE, "\n\n");
  // Trim gesamt
  s = s.trim();
  return s;
}

export function computeContentStats(text: string): LegalContentStats {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      charCount: 0,
      wordCount: 0,
      lineCount: 0,
      paragraphCount: 0,
      hasSectionMarkers: false,
      detectedFormat: "empty",
    };
  }
  const lines = trimmed.split("\n");
  const paragraphs = trimmed.split(/\n\s*\n/).filter(Boolean);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const hasSectionMarkers = SECTION_MARKER_RE.test(trimmed);
  return {
    charCount: trimmed.length,
    wordCount: words.length,
    lineCount: lines.length,
    paragraphCount: paragraphs.length,
    hasSectionMarkers,
    detectedFormat: hasSectionMarkers ? "structured" : "plain",
  };
}

export function computeChecksum(text: string): string {
  // Simple, deterministischer FNV-1a Hash (32 bit hex). Kein Kryptohash nötig.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}
