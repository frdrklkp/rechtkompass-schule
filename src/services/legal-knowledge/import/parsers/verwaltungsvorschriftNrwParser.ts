/**
 * Sprint 4.5E – Produktionsreifer Parser: Verwaltungsvorschriften
 * zum Schulrecht NRW (VV zum SchulG, VV zu einzelnen Verordnungen).
 *
 * Vollständig deterministisch. Nutzt ausschließlich das bestehende
 * Import-Framework (Parser → Normalizer → Validator → Delta → Repository Port).
 *
 * Unterstützte Strukturen:
 *   - Titel („Verwaltungsvorschriften zu …") und BASS-Gliederungsnummer
 *   - Nummern und Unternummern (1., 1.1, 1.1.1 …)
 *   - Abschnitte und Unterabschnitte (Textüberschriften)
 *   - Fließtext, Listen (a), b), Spiegelstriche), Tabellen
 *   - Anlagen
 *   - Fundstellen (BASS, ABl. NRW) und Verweise
 *   - Herausgeber, Datum, Gültigkeit, letzte Änderung
 *   - Offizielle URL (aus Hint)
 */
import type {
  LegalImportInput,
  LegalImportParser,
  LegalNode,
  NormalizedLegalDocument,
} from "../types";
import {
  BASS_CHROME_NOISE,
  CITATION_MARKER_RE,
  VOM_LINE_RE,
  findDate,
} from "./bassSiteHeader";

const BASS_NR_RE = /BASS\s+(\d{1,2}\s*[-–]\s*\d{2})(?:\s*Nr\.?\s*(\d+))?/i;
const ABL_RE = /ABl\.\s*NRW\.?\s*S\.\s*\d+/i;
const NUM_RE = /^(\d+(?:\.\d+){0,4})\s+(.+)$/;          // "1", "1.1", "1.1.1" gefolgt von Text
const NUM_ONLY_RE = /^(\d+(?:\.\d+){0,4})\.?\s*$/;      // reine Nummer als Header
const ITEM_ALPHA_RE = /^([a-z]{1,2})\)\s+(.+)$/;
const BULLET_RE = /^[-–—•*]\s+(.+)$/;
const TABLE_ROW_RE = /^\|(.+)\|\s*$/;
const ANLAGE_RE = /^Anlage\s+([A-Z]|\d+)(?:\s*[:.\-–—]\s*|\s+)(.*)$/;
const REFERENCE_RE =
  /(§\s*\d+[a-z]?(?:\s*Abs\.\s*\d+)?|Artikel\s+\d+[a-z]?|Nr\.\s*\d+(?:\.\d+)*|BASS\s+\d{1,2}\s*[-–]\s*\d{2}(?:\s*Nr\.?\s*\d+)?|Anlage\s+[A-Z0-9]+|ABl\.\s*NRW\.?\s*S\.\s*\d+)/gi;

function mk(node: Omit<LegalNode, "localId" | "children"> & { children?: LegalNode[] }): LegalNode {
  return { localId: "", children: node.children ?? [], ...node };
}

function extractRefs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(REFERENCE_RE)) out.add(m[1].replace(/\s+/g, " ").trim());
  return [...out];
}

function attachRefs(node: LegalNode): void {
  const t = node.text ?? "";
  if (!t) return;
  const refs = extractRefs(t);
  if (refs.length > 0) node.metadata = { ...(node.metadata ?? {}), references: refs };
}

interface Header {
  title: string | null;
  citation: string | null;      // BASS-Gliederungsnummer
  publishedAt: string | null;
  amendedAt: string | null;
  validFrom: string | null;
  authority: string | null;
  ablFundstelle: string | null;
  consumed: number;
}

function extractHeader(lines: string[]): Header {
  const h: Header = {
    title: null,
    citation: null,
    publishedAt: null,
    amendedAt: null,
    validFrom: null,
    authority: null,
    ablFundstelle: null,
    consumed: 0,
  };
  const titleLines: string[] = [];
  let collectingTitle = false;
  let titleCaptured = false;

  for (let i = 0; i < lines.length && i < 60; i++) {
    const line = lines[i].trim();
    if (!line) { h.consumed = i + 1; continue; }
    if (BASS_CHROME_NOISE.has(line)) { h.consumed = i + 1; continue; }

    // Struktur-Abbruch gilt IMMER, auch bevor ein Aktenzeichen gefunden
    // wurde - sonst würde ein Dokument ohne erkennbaren Aktenzeichen-Marker
    // ewig auf den Marker warten und dabei den kompletten Inhalt verschlucken.
    if (NUM_RE.test(line) || NUM_ONLY_RE.test(line) || ANLAGE_RE.test(line)) break;

    if (!titleCaptured) {
      if (!collectingTitle) {
        if (CITATION_MARKER_RE.test(line)) {
          if (!h.citation) h.citation = line;
          collectingTitle = true;
        }
        h.consumed = i + 1;
        continue;
      }
      if (VOM_LINE_RE.test(line)) {
        h.title = titleLines.join(" ").replace(/\s+/g, " ").trim() || null;
        titleCaptured = true;
        collectingTitle = false;
        // "Vom ..." selbst noch normal weiterverarbeiten (publishedAt), daher kein continue.
      } else {
        titleLines.push(line);
        h.consumed = i + 1;
        continue;
      }
    }

    const bass = BASS_NR_RE.exec(line);
    if (bass && !h.citation) {
      const nr = bass[2] ? ` Nr. ${bass[2]}` : "";
      h.citation = `BASS ${bass[1].replace(/\s+/g, "")}${nr}`;
    }
    const abl = ABL_RE.exec(line);
    if (abl) h.ablFundstelle = abl[0].replace(/\s+/g, " ");

    const amendedAt = findDate(line, String.raw`Zuletzt\s+ge[aä]ndert\s+(?:durch|vom)?.*?`);
    if (amendedAt) h.amendedAt = amendedAt;
    else {
      const publishedAt = findDate(line, String.raw`\bvom`);
      if (publishedAt) {
        h.publishedAt = publishedAt;
        if (!h.validFrom) h.validFrom = publishedAt;
      }
    }
    const validFrom = findDate(line, String.raw`G[üu]ltig\s+ab`);
    if (validFrom) h.validFrom = validFrom;

    if (/Ministerium|Herausgeber:/i.test(line)) {
      h.authority = line.replace(/^Herausgeber:\s*/i, "");
    }
    h.consumed = i + 1;
  }
  return h;
}

function buildTableNode(rows: string[][]): LegalNode {
  return mk({
    kind: "text",
    heading: null,
    text: rows.map((r) => r.join(" | ")).join("\n"),
    metadata: { type: "table", rows },
  });
}

/**
 * Findet den nächst-höheren Container für eine Nummer wie „1.2.3":
 * eine Ebene tiefer als die eigene, also die längste Präfix-Nummer im Stack.
 */
function popToParent(stack: LegalNode[], number: string) {
  // Behalte alle Frames, deren Nummer echter Präfix von `number` ist.
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const topNum = (top.number ?? "").replace(/\.$/, "");
    if (topNum && (number === topNum || number.startsWith(topNum + "."))) {
      // topNum ist Präfix → hier bleiben.
      if (number === topNum) stack.pop(); // Ersatz-Frame gleichrangig entfernen
      return;
    }
    stack.pop();
  }
}

export const verwaltungsvorschriftNrwParser: LegalImportParser = {
  id: "verwaltungsvorschrift-nrw",
  label: "Verwaltungsvorschrift NRW",
  kind: "administrative_regulation",

  canParse(input: LegalImportInput): boolean {
    const raw = input.raw.slice(0, 6000);
    if (input.hint?.officialUrl && /verwaltungsvorschrift|vv[-_]/i.test(input.hint.officialUrl)) return true;
    if (/Verwaltungsvorschrift(?:en)?\b/i.test(raw)) return true;
    return false;
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const header = extractHeader(lines);

    // Hinweis (2026-08-13): der HTML-<title> von bass.schule.nrw ist auf
    // jeder Seite generisch "BASS" (input.hint.detectedTitle) - der aus dem
    // Titelblock geparste header.title hat deshalb Vorrang.
    const root = mk({
      kind: "document",
      heading: header.title ?? input.hint?.detectedTitle ?? "Verwaltungsvorschrift",
    });

    // Stack für nummerierte Ebenen (1 → 1.1 → 1.1.1).
    const numStack: LegalNode[] = [];
    let currentAnlage: LegalNode | null = null;
    let currentNode: LegalNode | null = null; // aktuell offener Text-Zielknoten
    let tableBuffer: string[][] | null = null;

    const anlageRoot = (): LegalNode => currentAnlage ?? root;

    const flushTable = () => {
      if (tableBuffer && tableBuffer.length > 0) {
        (currentNode ?? anlageRoot()).children.push(buildTableNode(tableBuffer));
      }
      tableBuffer = null;
    };

    for (let i = header.consumed; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { flushTable(); continue; }

      const tbl = TABLE_ROW_RE.exec(line);
      if (tbl) {
        (tableBuffer ??= []).push(tbl[1].split("|").map((c) => c.trim()));
        continue;
      } else if (tableBuffer) {
        flushTable();
      }

      let m: RegExpExecArray | null;

      if ((m = ANLAGE_RE.exec(line))) {
        currentAnlage = mk({
          kind: "chapter",
          number: `Anlage ${m[1]}`,
          heading: m[2]?.trim() || null,
          metadata: { role: "anlage", anlage: m[1] },
        });
        root.children.push(currentAnlage);
        numStack.length = 0;
        currentNode = null;
        continue;
      }

      // Nummerierter Header „1.2 Titel …"
      if ((m = NUM_RE.exec(line))) {
        const number = m[1];
        const rest = m[2].trim();
        popToParent(numStack, number);
        const parent = numStack.length > 0 ? numStack[numStack.length - 1] : anlageRoot();
        const depth = number.split(".").length;
        const isTopHeader = depth === 1 && !/[a-zäöüß]/.test(rest.slice(0, 1)); // "1 Grundsatz"
        // Kind-Kind: „section" für Ebene 1, „subsection" ab Ebene 2, sonst „item".
        const kind: LegalNode["kind"] =
          depth === 1 ? "section" : depth === 2 ? "subsection" : "item";
        // Wenn der Text mit Kleinbuchstaben beginnt, ist es eher ein Fließtext, keine Überschrift.
        const looksLikeHeader = /^[A-ZÄÖÜ]/.test(rest);
        const node = mk({
          kind,
          number,
          heading: looksLikeHeader && rest.length < 120 ? rest : null,
          text: looksLikeHeader && rest.length < 120 ? null : rest,
          metadata: { role: isTopHeader ? "topic" : "clause" },
        });
        attachRefs(node);
        parent.children.push(node);
        numStack.push(node);
        currentNode = node;
        continue;
      }

      // Aufzählungen
      let item: LegalNode | null = null;
      if ((m = ITEM_ALPHA_RE.exec(line))) {
        item = mk({ kind: "item", number: `${m[1]})`, text: m[2].trim() });
      } else if ((m = BULLET_RE.exec(line))) {
        item = mk({ kind: "item", number: null, text: m[1].trim() });
      }
      if (item) {
        attachRefs(item);
        (currentNode ?? anlageRoot()).children.push(item);
        continue;
      }

      // Fließtext
      if (currentNode) {
        currentNode.text = [(currentNode.text ?? ""), line].join(" ").trim();
        attachRefs(currentNode);
      } else {
        const pre = mk({ kind: "text", text: line });
        attachRefs(pre);
        anlageRoot().children.push(pre);
      }
    }
    flushTable();

    if (root.children.length === 0) {
      root.children.push(mk({ kind: "text", text: input.raw.trim() || null }));
    }

    const versionLabel =
      input.hint?.detectedVersion ??
      (header.amendedAt
        ? `Fassung ${header.amendedAt}`
        : header.publishedAt
          ? `Fassung ${header.publishedAt}`
          : "Unbekannte Fassung");

    return {
      source: {
        key: "verwaltungsvorschrift-nrw",
        kind: "administrative_regulation",
        title: header.title ?? input.hint?.detectedTitle ?? "Verwaltungsvorschrift NRW",
        shortName: "VV",
        jurisdiction: "NRW",
        authority: header.authority ?? "MSB NRW",
        officialUrl: input.hint?.officialUrl ?? null,
        language: "de",
        metadata: {
          source: "verwaltungsvorschrift",
          bassNumber: header.citation,
          fundstelle: header.ablFundstelle,
          amendedAt: header.amendedAt,
        },
      },
      version: {
        label: versionLabel,
        publishedAt: header.publishedAt,
        validFrom: header.validFrom,
        validTo: null,
        citation: header.citation ?? header.ablFundstelle,
      },
      root,
      rawText: input.raw,
    };
  },
};
