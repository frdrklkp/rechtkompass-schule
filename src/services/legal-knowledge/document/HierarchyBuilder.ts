/**
 * Build a full SectionNode tree from ParseEvents. Assigns stable ids, paths,
 * breadcrumbs, depth, order, and structured metadata.
 */
import { stableHash } from "@/lib/stableHash";
import type {
  OutlineEntry,
  SectionMetadata,
  SectionNode,
  SectionReference,
  SectionType,
} from "./types";
import { SECTION_RANK, SECTION_TYPE_LABELS } from "./types";
import type { ParseEvent } from "./parser/DocumentParser";
import { extractReferences } from "./parser/ReferenceParser";

export interface HierarchyOptions {
  sourceId: string | null;
  sourceLabel: string;
  parserMethod: string;
  parserVersion: string;
  baseMetadata?: Partial<SectionMetadata>;
}

export interface HierarchyResult {
  root: SectionNode;
  flat: SectionNode[];
}

const PATH_TYPE_PREFIX: Record<SectionType, string> = {
  document: "doc",
  book: "buch",
  part: "teil",
  title: "titel",
  chapter: "kap",
  subchapter: "ukap",
  section: "absch",
  subsection: "uabsch",
  paragraph: "p",
  article: "art",
  absatz: "abs",
  sentence: "s",
  number: "nr",
  letter: "lit",
  annex: "anlage",
  table: "tab",
  image: "img",
  definition: "def",
  example: "ex",
  footnote: "fn",
  reference: "ref",
  unknown: "x",
};

export function buildHierarchy(events: ParseEvent[], opts: HierarchyOptions): HierarchyResult {
  const root: SectionNode = makeRoot(opts);
  const flat: SectionNode[] = [root];
  const stack: SectionNode[] = [root];

  for (const event of events) {
    while (stack.length > 1 && SECTION_RANK[stack[stack.length - 1].type] >= SECTION_RANK[event.type]) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    const node = buildNode(event, parent, opts);
    parent.children.push(node);
    flat.push(node);
    stack.push(node);
  }

  return { root, flat };
}

function makeRoot(opts: HierarchyOptions): SectionNode {
  const label = opts.sourceLabel || "Dokument";
  const path = slug(label) || "doc";
  const stableHash = sha1(`${opts.sourceId ?? "root"}::${path}`);
  return {
    localId: stableHash,
    parentLocalId: null,
    order: 0,
    depth: 0,
    type: "document",
    number: null,
    label,
    title: label,
    displayTitle: label,
    originalText: "",
    normalizedText: "",
    summary: null,
    path,
    displayPath: label,
    breadcrumb: [label],
    startOffset: 0,
    endOffset: 0,
    stableHash,
    parserMethod: opts.parserMethod,
    confidence: 1,
    metadata: {
      sourceLabel: opts.sourceLabel,
      parserMethod: opts.parserMethod,
      ...opts.baseMetadata,
    },
    references: [],
    children: [],
  };
}

function buildNode(event: ParseEvent, parent: SectionNode, opts: HierarchyOptions): SectionNode {
  const depth = parent.depth + 1;
  const order = parent.children.length;
  const numberSlug = event.number ? slug(event.number) : String(order + 1);
  const segment = `${PATH_TYPE_PREFIX[event.type]}-${numberSlug}`;
  const path = `${parent.path}/${segment}`;
  const displaySegment = event.label;
  const breadcrumb = [...parent.breadcrumb, displaySegment];
  const displayPath = breadcrumb.join(" › ");
  const normalizedText = normalize(event.bodyText);
  const stableHash = sha1(
    `${opts.sourceId ?? "?"}::${path}::${normalizedText.slice(0, 200)}`,
  );
  const references: SectionReference[] = extractReferences(event.originalText, event.startOffset);

  const metadata: SectionMetadata = {
    sourceLabel: opts.sourceLabel,
    parserMethod: opts.parserMethod,
    parserConfidence: event.confidence,
    ...opts.baseMetadata,
  };
  attachStructuralMetadata(metadata, event.type, event.number, parent);

  const title = event.title.trim() || event.label;
  return {
    localId: stableHash,
    parentLocalId: parent.localId,
    order,
    depth,
    type: event.type,
    number: event.number,
    label: event.label,
    title,
    displayTitle: `${event.label}${event.title ? ` – ${event.title.trim()}` : ""}`,
    originalText: event.originalText,
    normalizedText,
    summary: null,
    path,
    displayPath,
    breadcrumb,
    startOffset: event.startOffset,
    endOffset: event.endOffset,
    stableHash,
    parserMethod: opts.parserMethod,
    confidence: event.confidence,
    metadata,
    references,
    children: [],
  };
}

function attachStructuralMetadata(
  meta: SectionMetadata,
  type: SectionType,
  number: string | null,
  parent: SectionNode,
) {
  // Inherit ancestor structural coordinates
  meta.chapter ??= parent.metadata.chapter;
  meta.section ??= parent.metadata.section;
  meta.paragraph ??= parent.metadata.paragraph;
  meta.article ??= parent.metadata.article;
  meta.absatz ??= parent.metadata.absatz;
  meta.annex ??= parent.metadata.annex;

  if (!number) return;
  switch (type) {
    case "chapter": meta.chapter = number; break;
    case "section": meta.section = number; break;
    case "paragraph": meta.paragraph = number; break;
    case "article": meta.article = number; break;
    case "absatz": meta.absatz = number; break;
    case "sentence": meta.sentence = number; break;
    case "number": meta.number = number; break;
    case "letter": meta.letter = number; break;
    case "annex": meta.annex = number; break;
    default: break;
  }
}

export function buildOutline(node: SectionNode): OutlineEntry[] {
  return node.children.map(toOutline);
}

function toOutline(node: SectionNode): OutlineEntry {
  return {
    localId: node.localId,
    type: node.type,
    label: node.label ?? SECTION_TYPE_LABELS[node.type],
    displayTitle: node.displayTitle,
    path: node.path,
    depth: node.depth,
    children: node.children.map(toOutline),
  };
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sha1(input: string): string {
  // Keine Node-crypto-Abhängigkeit mehr (Fund 2026-08-13: dieses Modul wird
  // transitiv von ChunksPanel.tsx/DocumentStructurePanel.tsx client-seitig
  // importiert, "crypto" ist im Browser nicht vorhanden). Nur für baum-
  // interne, pro Render neu berechnete "stabile" IDs verwendet, nicht
  // gegen gespeicherte Werte verglichen - Algorithmuswechsel unbedenklich.
  return stableHash(input).slice(0, 24);
}

export const _internal = { slug, sha1, normalize };
