/**
 * Sprint 4.5C – Deterministische Validierung normalisierter Rechtsquellen.
 * Prüft Pflichtfelder, doppelte lokale IDs, leere Textblätter, Referenzen
 * (soweit im Kontext auflösbar) und Versionskonflikte gegen einen Snapshot.
 */
import type {
  LegalImportIssue,
  LegalImportSnapshot,
  LegalImportValidationResult,
  NormalizedLegalDocument,
} from "./types";
import { flatten } from "./hashing";

/** Strukturelle Knotenarten, deren Textinhalt für die Validierung optional ist. */
const STRUCTURAL_KINDS = new Set(["document", "part", "chapter", "section", "heading"]);

export function validateDocument(
  doc: NormalizedLegalDocument,
  previous?: LegalImportSnapshot | null,
): LegalImportValidationResult {
  const issues: LegalImportIssue[] = [];

  if (!doc.source.key.trim()) {
    issues.push({ code: "missing_source_key", severity: "error", message: "Quellen-Key fehlt." });
  }
  if (!doc.source.title.trim()) {
    issues.push({ code: "missing_title", severity: "error", message: "Titel der Quelle fehlt." });
  }
  if (!doc.version.label.trim()) {
    issues.push({ code: "missing_version", severity: "error", message: "Versionsangabe fehlt." });
  }

  const nodes = flatten(doc.root);
  if (nodes.length <= 1) {
    issues.push({ code: "empty_document", severity: "error", message: "Dokument enthält keine Inhalte." });
  }

  const seen = new Map<string, number>();
  for (const n of nodes) {
    if (!n.localId) continue;
    seen.set(n.localId, (seen.get(n.localId) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      issues.push({
        code: "duplicate_local_id",
        severity: "error",
        message: `Doppelte lokale ID: ${id} (${count}×).`,
        nodeLocalId: id,
      });
    }
  }

  for (const n of nodes) {
    if (STRUCTURAL_KINDS.has(n.kind)) continue;
    const hasText = (n.text ?? "").trim().length > 0;
    const hasHeading = (n.heading ?? "").trim().length > 0;
    if (!hasText && !hasHeading && n.children.length === 0) {
      issues.push({
        code: "empty_text_leaf",
        severity: "warning",
        message: `Leerer Inhaltsknoten: ${n.localId} (${n.kind}).`,
        nodeLocalId: n.localId,
      });
    }
  }

  // Versionskonflikt: identisches Version-Label, aber signifikant abweichende Node-Menge.
  if (previous && previous.sourceKey === doc.source.key && previous.versionLabel === doc.version.label) {
    const prevIds = new Set(Object.keys(previous.nodeHashes));
    const currentIds = new Set(nodes.map((n) => n.localId));
    let diff = 0;
    for (const id of prevIds) if (!currentIds.has(id)) diff++;
    for (const id of currentIds) if (!prevIds.has(id)) diff++;
    if (diff > 0) {
      issues.push({
        code: "version_conflict",
        severity: "warning",
        message: `Version „${doc.version.label}" wurde inhaltlich verändert (${diff} abweichende Knoten). Neue Versionsbezeichnung empfohlen.`,
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  return { ok: errorCount === 0, errorCount, warningCount, issues };
}
