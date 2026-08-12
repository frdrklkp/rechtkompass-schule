/**
 * Sprint 4.5C – Normalisierung eines geparsten Dokuments.
 * Aufgabe: Whitespace glätten, lokale IDs vergeben, defensive Metadata-Kopien.
 * Der Normalizer ändert die Struktur NICHT – er hebt nur syntaktische Störer.
 */
import type { LegalNode, NormalizedLegalDocument } from "./types";
import { assignLocalIds } from "./hashing";

function tidyString(s: string | null | undefined): string | null | undefined {
  if (s == null) return s;
  const trimmed = s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return trimmed.length === 0 ? null : trimmed;
}

function tidyNode(node: LegalNode): LegalNode {
  return {
    localId: node.localId,
    kind: node.kind,
    number: (tidyString(node.number ?? null) ?? null) as string | null,
    heading: (tidyString(node.heading ?? null) ?? null) as string | null,
    text: (tidyString(node.text ?? null) ?? null) as string | null,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: node.children.map(tidyNode),
  };
}

export function normalizeDocument(doc: NormalizedLegalDocument): NormalizedLegalDocument {
  const root = tidyNode(doc.root);
  assignLocalIds(root);
  return {
    source: { ...doc.source },
    version: { ...doc.version },
    root,
    rawText: doc.rawText ?? null,
  };
}
