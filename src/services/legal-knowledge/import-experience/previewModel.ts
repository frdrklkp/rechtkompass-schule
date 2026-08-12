/**
 * Sprint 4.5H – Aufbereitung der Importvorschau, des Delta Explorers und des
 * Versionsvergleichs. Reine Funktionen ohne Netzwerk, Storage oder KI.
 */
import { flatten } from "../import";
import type {
  LegalImportDelta,
  LegalImportParser,
  LegalImportValidationResult,
  LegalNode,
  NormalizedLegalDocument,
} from "../import";
import {
  CONTENT_CATEGORY_LABEL,
  type CategoryDelta,
  type CompareSection,
  type ContentCategory,
  type DeltaEntry,
  type DeltaGroup,
  type DeltaOverview,
  type DocumentOverview,
  type ImportPreviewModel,
  type VersionComparison,
} from "./types";

/* ---------- Klassifikation ---------- */

const ATTACHMENT_RE = /^(anlage|anhang|muster|formular)\b/i;

export function isAttachmentNode(node: LegalNode): boolean {
  if (node.metadata && (node.metadata as { attachment?: unknown }).attachment === true) return true;
  const label = `${node.number ?? ""} ${node.heading ?? ""}`.trim();
  return ATTACHMENT_RE.test(label);
}

export function classifyNode(node: LegalNode): ContentCategory | null {
  if (isAttachmentNode(node)) return "attachment";
  if (node.kind === "document") return "document";
  if (node.kind === "paragraph" || node.kind === "article") return "paragraph";
  if (node.kind === "subsection" || node.kind === "sentence" || node.kind === "item")
    return "subsection";
  return null;
}

/** Ableitung der Kategorie für Knoten, die es nur noch im Altbestand gibt. */
export function inferCategoryFromLocalId(localId: string): ContentCategory {
  const id = localId.toLowerCase();
  if (/anlage|anhang|att|attachment/.test(id)) return "attachment";
  if (/doc|root|^n0$/.test(id)) return "document";
  if (/abs|sub|sentence|item/.test(id)) return "subsection";
  return "paragraph";
}

export function nodeTitle(node: LegalNode): string {
  const label = [node.number, node.heading].filter(Boolean).join(" ").trim();
  if (label) return label;
  const text = (node.text ?? "").replace(/\s+/g, " ").trim();
  return text
    ? `${text.slice(0, 70)}${text.length > 70 ? "…" : ""}`
    : CONTENT_CATEGORY_LABEL[classifyNode(node) ?? "paragraph"];
}

function countReferences(root: LegalNode): { internal: number; external: number } {
  let internal = 0;
  let external = 0;
  for (const node of flatten(root)) {
    const refs = (node.metadata as { references?: unknown } | undefined)?.references;
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      const value =
        typeof ref === "string"
          ? ref
          : typeof (ref as { url?: unknown })?.url === "string"
            ? (ref as { url: string }).url
            : typeof (ref as { type?: unknown })?.type === "string"
              ? (ref as { type: string }).type
              : "";
      if (/^https?:|extern/i.test(value)) external++;
      else internal++;
    }
  }
  return { internal, external };
}

/* ---------- Dokumentübersicht ---------- */

export function buildDocumentOverview(doc: NormalizedLegalDocument): DocumentOverview {
  const nodes = flatten(doc.root);
  const counts: Record<ContentCategory, number> = {
    document: 0,
    paragraph: 0,
    subsection: 0,
    attachment: 0,
  };
  for (const node of nodes) {
    const category = classifyNode(node);
    if (category) counts[category]++;
  }
  const refs = countReferences(doc.root);
  return {
    documents: Math.max(counts.document, 1),
    paragraphs: counts.paragraph,
    subsections: counts.subsection,
    attachments: counts.attachment,
    internalReferences: refs.internal,
    externalReferences: refs.external,
  };
}

/* ---------- Delta-Übersicht ---------- */

function emptyCategoryDelta(): CategoryDelta {
  return { added: 0, updated: 0, removed: 0 };
}

export function buildCategoryIndex(doc: NormalizedLegalDocument): Map<string, LegalNode> {
  const map = new Map<string, LegalNode>();
  for (const node of flatten(doc.root)) map.set(node.localId, node);
  return map;
}

export interface PreviousSectionEntry {
  title?: string;
  identifier?: string;
  category?: ContentCategory;
  text?: string;
  version?: string;
}

export type PreviousSectionIndex = Record<string, PreviousSectionEntry>;

export function buildDeltaOverview(
  doc: NormalizedLegalDocument,
  delta: LegalImportDelta,
  previousIndex: PreviousSectionIndex = {},
): DeltaOverview {
  const nodes = buildCategoryIndex(doc);
  const per: Record<ContentCategory, CategoryDelta> = {
    document: emptyCategoryDelta(),
    paragraph: emptyCategoryDelta(),
    subsection: emptyCategoryDelta(),
    attachment: emptyCategoryDelta(),
  };
  for (const change of delta.changes) {
    if (change.op === "unchanged") continue;
    const node = nodes.get(change.localId);
    const category =
      (node ? classifyNode(node) : null) ??
      previousIndex[change.localId]?.category ??
      inferCategoryFromLocalId(change.localId);
    per[category][change.op]++;
  }
  return {
    documents: per.document,
    paragraphs: per.paragraph,
    attachments: per.attachment,
    subsections: per.subsection,
    total: {
      added: delta.added,
      updated: delta.updated,
      removed: delta.removed,
      unchanged: delta.unchanged,
    },
  };
}

/* ---------- Vorschau-Modell ---------- */

export function buildImportPreviewModel(input: {
  document: NormalizedLegalDocument;
  delta: LegalImportDelta;
  validation: LegalImportValidationResult;
  parser: Pick<LegalImportParser, "id" | "label">;
  durationMs: number;
  importedAt?: string;
  previousIndex?: PreviousSectionIndex;
}): ImportPreviewModel {
  const { document, delta, validation, parser } = input;
  const versionConflict = validation.issues.some(
    (i) => i.code === "version_conflict" && i.severity === "error",
  );
  const blocked = !validation.ok || versionConflict;
  const hasChanges = delta.added + delta.updated + delta.removed > 0;
  const status = blocked ? "blocked" : hasChanges ? "ready" : "no_change";
  return {
    general: {
      sourceTitle: document.source.title,
      sourceKey: document.source.key,
      parserLabel: parser.label,
      parserId: parser.id,
      versionLabel: document.version.label,
      importedAt: input.importedAt ?? new Date().toISOString(),
      durationMs: Math.max(0, Math.round(input.durationMs)),
      status,
      statusLabel:
        status === "blocked"
          ? "Import blockiert"
          : status === "no_change"
            ? "Keine Änderungen"
            : "Bereit zur Übernahme",
    },
    overview: buildDocumentOverview(document),
    delta: buildDeltaOverview(document, delta, input.previousIndex),
    hasChanges,
  };
}

/* ---------- Delta Explorer ---------- */

const GROUP_LABEL: Record<"added" | "updated" | "removed", string> = {
  added: "Neue Inhalte",
  updated: "Geänderte Inhalte",
  removed: "Entfernte Inhalte",
};

const GROUP_ORDER: Record<"added" | "updated" | "removed", ContentCategory[]> = {
  added: ["document", "paragraph", "attachment", "subsection"],
  updated: ["document", "paragraph", "subsection", "attachment"],
  removed: ["document", "paragraph", "attachment", "subsection"],
};

function reasonFor(op: "added" | "updated" | "removed", category: ContentCategory): string {
  const label = CONTENT_CATEGORY_LABEL[category];
  if (op === "added") return `${label} in der neuen Fassung erstmals enthalten.`;
  if (op === "removed") return `${label} in der neuen Fassung nicht mehr enthalten.`;
  return `Inhaltsprüfsumme des ${label}s weicht von der installierten Fassung ab.`;
}

export function buildDeltaExplorer(
  doc: NormalizedLegalDocument,
  delta: LegalImportDelta,
  previousIndex: PreviousSectionIndex = {},
): DeltaGroup[] {
  const nodes = buildCategoryIndex(doc);
  const buckets: Record<"added" | "updated" | "removed", DeltaEntry[]> = {
    added: [],
    updated: [],
    removed: [],
  };

  for (const change of delta.changes) {
    if (change.op === "unchanged") continue;
    const node = nodes.get(change.localId);
    const previous = previousIndex[change.localId];
    const category =
      (node ? classifyNode(node) : null) ??
      previous?.category ??
      inferCategoryFromLocalId(change.localId);
    buckets[change.op].push({
      localId: change.localId,
      title: node ? nodeTitle(node) : (previous?.title ?? change.localId),
      identifier: (node?.number ?? previous?.identifier ?? change.localId) || change.localId,
      version:
        change.op === "removed" ? (previous?.version ?? "installierte Fassung") : doc.version.label,
      category,
      reason: reasonFor(change.op, category),
    });
  }

  return (Object.keys(buckets) as ("added" | "updated" | "removed")[]).map((kind) => {
    const entries = buckets[kind];
    const sections = GROUP_ORDER[kind]
      .map((category) => ({
        category,
        label: CONTENT_CATEGORY_LABEL[category],
        entries: entries.filter((e) => e.category === category),
      }))
      .filter((s) => s.entries.length > 0);
    return { kind, label: GROUP_LABEL[kind], total: entries.length, sections };
  });
}

/* ---------- Versionsvergleich ---------- */

export function buildVersionComparison(
  doc: NormalizedLegalDocument,
  delta: LegalImportDelta,
  previousIndex: PreviousSectionIndex = {},
  options: { installedVersion?: string | null; onlyChanged?: boolean } = {},
): VersionComparison {
  const nodes = buildCategoryIndex(doc);
  const onlyChanged = options.onlyChanged ?? true;
  const sections: CompareSection[] = [];

  for (const change of delta.changes) {
    if (onlyChanged && change.op === "unchanged") continue;
    const node = nodes.get(change.localId);
    const previous = previousIndex[change.localId];
    const category =
      (node ? classifyNode(node) : null) ??
      previous?.category ??
      inferCategoryFromLocalId(change.localId);
    if (category === "subsection" && change.op === "unchanged") continue;
    sections.push({
      localId: change.localId,
      title: node ? nodeTitle(node) : (previous?.title ?? change.localId),
      status: change.op,
      previousText: previous?.text ?? null,
      nextText: node ? (node.text ?? "").trim() || nodeTitle(node) : null,
    });
  }

  sections.sort((a, b) => a.localId.localeCompare(b.localId, "de", { numeric: true }));

  return {
    sourceKey: doc.source.key,
    installedVersion: options.installedVersion ?? null,
    incomingVersion: doc.version.label,
    changedCount: sections.filter((s) => s.status !== "unchanged").length,
    sections,
  };
}

/** Baut den Abschnittsindex der übernommenen Fassung (für spätere Vergleiche). */
export function buildSectionIndex(doc: NormalizedLegalDocument): PreviousSectionIndex {
  const index: PreviousSectionIndex = {};
  for (const node of flatten(doc.root)) {
    const category = classifyNode(node);
    if (!category) continue;
    index[node.localId] = {
      title: nodeTitle(node),
      identifier: node.number ?? node.localId,
      category,
      text: (node.text ?? "").replace(/\s+/g, " ").trim().slice(0, 4000),
      version: doc.version.label,
    };
  }
  return index;
}
