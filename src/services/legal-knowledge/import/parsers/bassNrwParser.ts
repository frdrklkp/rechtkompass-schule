/**
 * Sprint 4.5D – Produktionsreifer Parser: BASS NRW
 * (Bereinigte Amtliche Sammlung der Schulvorschriften Nordrhein-Westfalen).
 *
 * Ausschließlich deterministisch (keine KI). Nutzt das bestehende
 * Import-Framework: erzeugt ein `NormalizedLegalDocument`, das über
 * Normalizer / Validator / Versioner / RepositoryPort persistiert wird.
 *
 * Unterstützte Strukturen:
 *   - Teil / Kapitel / Abschnitt (Gliederung)
 *   - Paragraph („§ N Titel")
 *   - Artikel („Artikel N")
 *   - Absatz („(1) …")
 *   - Aufzählungen („a) …", „1. …", Spiegelstriche)
 *   - Tabellen (Pipe-Notation) – als metadata.rows
 *   - Verweise (auf § / BASS / Artikel) – als metadata.references je Textknoten
 *   - Kopfmetadaten: BASS-Nr., Herausgeber, „vom …", „Zuletzt geändert …"
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
  looksLikeCrossReference,
} from "./bassSiteHeader";

const BASS_CITATION_RE = /BASS\s+(\d{1,2}\s*[-–]\s*\d{2})\s*(?:Nr\.?\s*(\d+))?/i;
const PARAGRAPH_RE = /^§\s*(\d+[a-z]?)\s*(?:[–—-]\s*)?(.*)$/;
const ARTICLE_RE = /^Artikel\s+(\d+[a-z]?)\s*(?:[–—-]\s*)?(.*)$/i;
const PART_RE = /^Teil\s+([IVXLCDM]+|\d+)\s*(?:[–—-]\s*)?(.*)$/i;
const CHAPTER_RE = /^Kapitel\s+([IVXLCDM]+|\d+)\s*(?:[–—-]\s*)?(.*)$/i;
const SECTION_RE = /^Abschnitt\s+([IVXLCDM]+|\d+)\s*(?:[–—-]\s*)?(.*)$/i;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;
const ITEM_ALPHA_RE = /^([a-z]{1,2})\)\s+(.+)$/;
const ITEM_NUM_RE = /^(\d{1,2})\.\s+(.+)$/;
const BULLET_RE = /^[-–—•*]\s+(.+)$/;
const TABLE_ROW_RE = /^\|(.+)\|\s*$/;
const REFERENCE_RE = /(§\s*\d+[a-z]?(?:\s*Abs\.\s*\d+)?|BASS\s+\d{1,2}\s*[-–]\s*\d{2}(?:\s*Nr\.?\s*\d+)?|Artikel\s+\d+[a-z]?)/gi;

function mkNode(node: Omit<LegalNode, "localId" | "children"> & { children?: LegalNode[] }): LegalNode {
  return { localId: "", children: node.children ?? [], ...node };
}

function extractReferences(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(REFERENCE_RE)) {
    out.add(m[1].replace(/\s+/g, " ").trim());
  }
  return [...out];
}

function attachReferences(node: LegalNode): void {
  const t = node.text ?? "";
  if (!t) return;
  const refs = extractReferences(t);
  if (refs.length > 0) {
    node.metadata = { ...(node.metadata ?? {}), references: refs };
  }
}

/**
 * Erkennt Kopfblock (bis erste strukturelle Zeile) und extrahiert Metadaten:
 * BASS-Nummer, Titel, Herausgeber, "vom" und "Zuletzt geändert".
 */
function extractHeader(rawLines: string[]): {
  title: string | null;
  citation: string | null;
  publishedAt: string | null;
  validFrom: string | null;
  amendedAt: string | null;
  authority: string | null;
  headerConsumed: number;
} {
  let title: string | null = null;
  let citation: string | null = null;
  let publishedAt: string | null = null;
  let validFrom: string | null = null;
  let amendedAt: string | null = null;
  let authority: string | null = null;
  let headerConsumed = 0;

  const titleLines: string[] = [];
  let collectingTitle = false;
  let titleCaptured = false;

  for (let i = 0; i < rawLines.length && i < 60; i++) {
    const line = rawLines[i].trim();
    if (!line) { headerConsumed = i + 1; continue; }
    if (BASS_CHROME_NOISE.has(line)) { headerConsumed = i + 1; continue; }
    // Die "Inhaltsübersicht" markiert das Ende des Kopfbereichs. Ohne diesen
    // expliziten Stopp würde der generische Struktur-Abbruch weiter unten
    // erst bei der ERSTEN Inhaltsübersicht-Zeile ("§ N Titel", passt auf
    // PARAGRAPH_RE) greifen - der Hauptparser sähe die "Inhaltsübersicht"-
    // Zeile dann nie und die eigene Inhaltsübersicht-Erkennung liefe leer
    // (Fund beim Testimport, 2026-08-13: BASS NRW - leere §-Knoten).
    if (line === "Inhaltsübersicht") break;

    // Struktur-Abbruch gilt IMMER, auch bevor ein Aktenzeichen gefunden wurde:
    // ohne diesen frühen Abbruch würde ein Dokument ohne erkennbaren
    // Aktenzeichen-Marker ewig auf den Marker warten und dabei den kompletten
    // Inhalt inkl. aller § als "Kopfbereich" verschlucken.
    if (
      PART_RE.test(line) ||
      CHAPTER_RE.test(line) ||
      SECTION_RE.test(line) ||
      PARAGRAPH_RE.test(line) ||
      ARTICLE_RE.test(line)
    ) {
      break;
    }

    if (!titleCaptured) {
      if (!collectingTitle) {
        if (CITATION_MARKER_RE.test(line)) {
          if (!citation) citation = line;
          collectingTitle = true;
        }
        headerConsumed = i + 1;
        continue;
      }
      if (VOM_LINE_RE.test(line)) {
        title = titleLines.join(" ").replace(/\s+/g, " ").trim() || null;
        titleCaptured = true;
        collectingTitle = false;
        // "Vom ..." selbst noch normal weiterverarbeiten (publishedAt), daher kein continue.
      } else {
        titleLines.push(line);
        headerConsumed = i + 1;
        continue;
      }
    }
    const cit = BASS_CITATION_RE.exec(line);
    if (cit) {
      const nr = cit[2] ? ` Nr. ${cit[2]}` : "";
      if (!citation) citation = `BASS ${cit[1].replace(/\s+/g, "")}${nr}`.replace(/\s*-\s*/, "-");
      headerConsumed = i + 1;
      continue;
    }
    const geandAt = findDate(line, String.raw`Zuletzt\s+ge[aä]ndert\s+(?:durch|vom)?.*?`);
    if (geandAt) amendedAt = geandAt;
    else {
      const vomAt = findDate(line, String.raw`\bvom`);
      if (vomAt) {
        publishedAt = vomAt;
        if (!validFrom) validFrom = vomAt;
      }
    }
    if (/Ministerium|Herausgeber:/i.test(line)) {
      authority = line.replace(/^Herausgeber:\s*/i, "");
    }
    headerConsumed = i + 1;
  }

  return { title, citation, publishedAt, validFrom, amendedAt, authority, headerConsumed };
}

/** Erzeugt einen Tabellenknoten aus aufeinanderfolgenden Pipe-Zeilen. */
function buildTableNode(rows: string[][]): LegalNode {
  return mkNode({
    kind: "text",
    heading: null,
    text: rows.map((r) => r.join(" | ")).join("\n"),
    metadata: { type: "table", rows },
  });
}

export const bassNrwParser: LegalImportParser = {
  id: "bass-nrw",
  label: "BASS NRW",
  kind: "administrative_regulation",

  canParse(input: LegalImportInput): boolean {
    const raw = input.raw.slice(0, 6000);
    if (input.hint?.officialUrl?.includes("bass.schule.nrw")) return true;
    if (input.hint?.officialUrl?.includes("bass.schul-welt.de")) return true;
    if (BASS_CITATION_RE.test(raw)) return true;
    if (/Bereinigte\s+Amtliche\s+Sammlung/i.test(raw)) return true;
    return false;
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const header = extractHeader(lines);

    // Hinweis (2026-08-13): der HTML-<title> von bass.schule.nrw ist auf jeder
    // Seite generisch "BASS" (input.hint.detectedTitle) - kein Rückschluss auf
    // das konkrete Dokument. Der aus dem Titelblock geparste header.title hat
    // deshalb Vorrang, detectedTitle ist nur Notnagel, falls das Parsen scheitert.
    const root: LegalNode = mkNode({
      kind: "document",
      heading: header.title ?? input.hint?.detectedTitle ?? "BASS-Vorschrift",
    });

    // Aktueller Verankerungspfad: document → part → chapter → section → paragraph/article → subsection
    let currentPart: LegalNode | null = null;
    let currentChapter: LegalNode | null = null;
    let currentSection: LegalNode | null = null;
    let currentBlock: LegalNode | null = null; // paragraph / article
    let currentSubsection: LegalNode | null = null;
    let tableBuffer: string[][] | null = null;
    // Direkt nach "§ N"/"Artikel N" (ohne Titel auf derselben Zeile) steht die
    // echte Überschrift auf der nächsten inhaltlichen Zeile.
    let awaitingHeading = false;
    // Die "Inhaltsübersicht" listet jeden Paragraphen nochmal inline ("§ N Titel")
    // auf - Navigationsvorschau, keine Rechtsnorm. Echte Paragraphen stehen auf
    // dieser Seite immer als "§ N" allein auf eigener Zeile.
    let inTableOfContents = false;
    // Echte Paragraphenüberschriften stehen immer isoliert nach einer Leerzeile.
    let precededByBlank = true;

    const containerForBlock = (): LegalNode =>
      currentSection ?? currentChapter ?? currentPart ?? root;

    const containerForItem = (): LegalNode =>
      currentSubsection ?? currentBlock ?? containerForBlock();

    const flushTable = () => {
      if (tableBuffer && tableBuffer.length > 0) {
        containerForItem().children.push(buildTableNode(tableBuffer));
      }
      tableBuffer = null;
    };

    for (let i = header.headerConsumed; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        flushTable();
        precededByBlank = true;
        continue;
      }
      const isNewBlock = precededByBlank;
      precededByBlank = false;

      if (line === "Inhaltsübersicht") {
        inTableOfContents = true;
        continue;
      }
      if (inTableOfContents) {
        const tocPara = PARAGRAPH_RE.exec(line);
        if (tocPara && !tocPara[2]?.trim()) {
          // "§ N" allein auf eigener Zeile = Ende der Inhaltsübersicht, echter Inhalt beginnt.
          inTableOfContents = false;
        } else {
          continue;
        }
      }

      // Tabellen (zusammenhängende Pipe-Zeilen)
      const tableMatch = TABLE_ROW_RE.exec(line);
      if (tableMatch) {
        const cells = tableMatch[1].split("|").map((c) => c.trim());
        (tableBuffer ??= []).push(cells);
        continue;
      } else if (tableBuffer) {
        flushTable();
      }

      let m: RegExpExecArray | null;

      if ((m = PART_RE.exec(line))) {
        currentPart = mkNode({ kind: "part", number: `Teil ${m[1]}`, heading: m[2]?.trim() || null });
        root.children.push(currentPart);
        currentChapter = currentSection = currentBlock = currentSubsection = null;
        continue;
      }
      if ((m = CHAPTER_RE.exec(line))) {
        currentChapter = mkNode({ kind: "chapter", number: `Kapitel ${m[1]}`, heading: m[2]?.trim() || null });
        (currentPart ?? root).children.push(currentChapter);
        currentSection = currentBlock = currentSubsection = null;
        continue;
      }
      if ((m = SECTION_RE.exec(line))) {
        currentSection = mkNode({ kind: "section", number: `Abschnitt ${m[1]}`, heading: m[2]?.trim() || null });
        (currentChapter ?? currentPart ?? root).children.push(currentSection);
        currentBlock = currentSubsection = null;
        continue;
      }
      if (
        isNewBlock &&
        (m = PARAGRAPH_RE.exec(line)) &&
        !(m[2]?.trim() && looksLikeCrossReference(m[2]))
      ) {
        currentBlock = mkNode({
          kind: "paragraph",
          number: `§ ${m[1]}`,
          heading: m[2]?.trim() || null,
        });
        containerForBlock().children.push(currentBlock);
        currentSubsection = null;
        awaitingHeading = !currentBlock.heading;
        continue;
      }
      if (
        isNewBlock &&
        (m = ARTICLE_RE.exec(line)) &&
        !(m[2]?.trim() && looksLikeCrossReference(m[2]))
      ) {
        currentBlock = mkNode({
          kind: "article",
          number: `Artikel ${m[1]}`,
          heading: m[2]?.trim() || null,
        });
        containerForBlock().children.push(currentBlock);
        currentSubsection = null;
        awaitingHeading = !currentBlock.heading;
        continue;
      }
      if ((m = SUBSECTION_RE.exec(line)) && currentBlock) {
        currentSubsection = mkNode({
          kind: "subsection",
          number: `(${m[1]})`,
          text: m[2]?.trim() || null,
        });
        attachReferences(currentSubsection);
        currentBlock.children.push(currentSubsection);
        awaitingHeading = false;
        continue;
      }

      if (awaitingHeading && currentBlock) {
        currentBlock.heading = line;
        awaitingHeading = false;
        continue;
      }

      // Aufzählungen
      let item: LegalNode | null = null;
      if ((m = ITEM_ALPHA_RE.exec(line))) {
        item = mkNode({ kind: "item", number: `${m[1]})`, text: m[2].trim() });
      } else if ((m = ITEM_NUM_RE.exec(line))) {
        item = mkNode({ kind: "item", number: `${m[1]}.`, text: m[2].trim() });
      } else if ((m = BULLET_RE.exec(line))) {
        item = mkNode({ kind: "item", number: null, text: m[1].trim() });
      }
      if (item) {
        attachReferences(item);
        containerForItem().children.push(item);
        continue;
      }

      // Freitext: an aktuell offene Ebene anhängen
      const target = currentSubsection ?? currentBlock ?? currentSection ?? currentChapter ?? currentPart;
      if (target) {
        target.text = [(target.text ?? ""), line].join(" ").trim();
        attachReferences(target);
      } else {
        // Vor jeder Struktur: als Präambel-Textknoten
        const pre = mkNode({ kind: "text", text: line });
        attachReferences(pre);
        root.children.push(pre);
      }
    }
    flushTable();

    // Defensive Fallback: enthält die Quelle nur Kopfmetadaten, hängen wir
    // den Rohtext als Präambel-Textknoten an, damit spätere Stufen
    // (Snapshot, Delta, Chunk-Engine) etwas zu tun haben.
    if (root.children.length === 0) {
      root.children.push(mkNode({ kind: "text", text: input.raw.trim() || null }));
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
        key: "bass-nrw",
        kind: "administrative_regulation",
        title: header.title ?? input.hint?.detectedTitle ?? "BASS-Vorschrift NRW",
        shortName: "BASS",
        jurisdiction: "NRW",
        authority: header.authority ?? "MSB NRW",
        officialUrl: input.hint?.officialUrl ?? null,
        language: "de",
        metadata: {
          source: "bass",
          citation: header.citation,
          amendedAt: header.amendedAt,
        },
      },
      version: {
        label: versionLabel,
        publishedAt: header.publishedAt,
        validFrom: header.validFrom,
        validTo: null,
        citation: header.citation,
      },
      root,
      rawText: input.raw,
    };
  },
};
