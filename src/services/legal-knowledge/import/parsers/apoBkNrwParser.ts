/**
 * Sprint 4.5E – Produktionsreifer Parser: APO-BK NRW
 * (Ausbildungs- und Prüfungsordnung Berufskolleg).
 *
 * Vollständig deterministisch. Nutzt ausschließlich das bestehende
 * Import-Framework (Parser → Normalizer → Validator → Delta → Repository Port).
 *
 * Unterstützte Strukturen:
 *   - Verordnungstitel und Kurzbezeichnung (APO-BK)
 *   - Teile, Kapitel, Abschnitte
 *   - Paragraphen (§) und Absätze ((n))
 *   - Nummerische Aufzählungen (1., 2.), alphabetische (a), b)) und Spiegelstriche
 *   - Anlagen (Anlage A, B, C … / Anlage 1 …) mit eigener innerer Gliederung
 *   - Tabellen (Pipe-Notation) → metadata.rows
 *   - Interne/externe Verweise → metadata.references
 *   - Kopfmetadaten: Datum, „Zuletzt geändert", Herausgeber, offizielle Fundstelle
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
  findPublishedDate,
  looksLikeCrossReference,
} from "./bassSiteHeader";

const APO_TITLE_RE = /Ausbildungs[-\s]?\s*und\s+Pr(?:ü|ue)fungsordnung.*(Berufskolleg|APO[-\s]BK)/i;
const APO_SHORT_RE = /\bAPO[-\s]?BK\b/i;
const PART_RE = /^Teil\s+([IVXLCDM]+|\d+)\s*(?:[–—-]\s*)?(.*)$/i;
const CHAPTER_RE = /^Kapitel\s+([IVXLCDM]+|\d+)\s*(?:[–—-]\s*)?(.*)$/i;
const SECTION_RE = /^Abschnitt\s+([IVXLCDM]+|\d+)\s*(?:[–—-]\s*)?(.*)$/i;
const PARAGRAPH_RE = /^§\s*(\d+[a-z]?)\s*(?:[–—-]\s*)?(.*)$/;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;
const ITEM_ALPHA_RE = /^([a-z]{1,2})\)\s+(.+)$/;
const ITEM_NUM_RE = /^(\d{1,2})\.\s+(.+)$/;
const BULLET_RE = /^[-–—•*]\s+(.+)$/;
const TABLE_ROW_RE = /^\|(.+)\|\s*$/;
const ANLAGE_RE = /^Anlage\s+([A-Z]|\d+)(?:\s*[:.\-–—]\s*|\s+)(.*)$/;
const REFERENCE_RE =
  /(§\s*\d+[a-z]?(?:\s*Abs\.\s*\d+)?|Artikel\s+\d+[a-z]?|APO[-\s]?BK(?:\s*Anlage\s*[A-Z]?\d*)?|Anlage\s+[A-Z0-9]+|BASS\s+\d{1,2}\s*[-–]\s*\d{2}(?:\s*Nr\.?\s*\d+)?)/gi;

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
  shortName: string | null;
  publishedAt: string | null;
  amendedAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  authority: string | null;
  citation: string | null;
  consumed: number;
}

function extractHeader(lines: string[]): Header {
  const h: Header = {
    title: null,
    shortName: null,
    publishedAt: null,
    amendedAt: null,
    validFrom: null,
    validTo: null,
    authority: null,
    citation: null,
    consumed: 0,
  };
  const titleLines: string[] = [];
  let collectingTitle = false;
  let titleCaptured = false;

  for (let i = 0; i < lines.length && i < 60; i++) {
    const line = lines[i].trim();
    if (!line) { h.consumed = i + 1; continue; }
    if (BASS_CHROME_NOISE.has(line)) { h.consumed = i + 1; continue; }
    // Die "Inhaltsübersicht" markiert das Ende des Kopfbereichs. Ohne diesen
    // expliziten Stopp würde der generische Struktur-Abbruch weiter unten
    // erst bei der ERSTEN Inhaltsübersicht-Zeile ("§ N Titel", passt auf
    // PARAGRAPH_RE) greifen - der Hauptparser sähe die "Inhaltsübersicht"-
    // Zeile dann nie und die eigene Inhaltsübersicht-Erkennung liefe leer.
    if (line === "Inhaltsübersicht") break;

    // Struktur-Abbruch gilt IMMER, auch bevor ein Aktenzeichen gefunden wurde:
    // ohne diesen frühen Abbruch würde ein Dokument ohne erkennbaren
    // Aktenzeichen-Marker (z.B. ein aus mehreren Seiten zusammengeführter
    // Rohtext ohne die bass.schule.nrw-Kopfzeilen) ewig auf den Marker warten
    // und dabei den kompletten Inhalt inkl. aller § als "Kopfbereich"
    // verschlucken (Fund: Testfixtures mit zusammengeführten HTML-Seiten).
    if (
      PART_RE.test(line) || CHAPTER_RE.test(line) || SECTION_RE.test(line) ||
      PARAGRAPH_RE.test(line) || ANLAGE_RE.test(line)
    ) break;

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
        if (h.title && APO_SHORT_RE.test(h.title)) h.shortName = "APO-BK";
        titleCaptured = true;
        collectingTitle = false;
        // "Vom ..." selbst noch normal weiterverarbeiten (publishedAt), daher kein continue.
      } else {
        titleLines.push(line);
        h.consumed = i + 1;
        continue;
      }
    }

    if (APO_SHORT_RE.test(line) && !h.shortName) h.shortName = "APO-BK";
    if (!h.title && APO_TITLE_RE.test(line)) h.title = line;

    const amendedAt = findDate(line, String.raw`Zuletzt\s+ge[aä]ndert\s+(?:durch|vom)?.*?`);
    if (amendedAt) h.amendedAt = amendedAt;
    else {
      const publishedAt = findPublishedDate(line);
      if (publishedAt) {
        h.publishedAt = publishedAt;
        if (!h.validFrom) h.validFrom = publishedAt;
      }
    }
    const validFrom = findDate(line, String.raw`G[üu]ltig\s+ab`);
    if (validFrom) h.validFrom = validFrom;
    const validTo = findDate(line, String.raw`G[üu]ltig\s+bis`);
    if (validTo) h.validTo = validTo;

    if (/Ministerium|Herausgeber:/i.test(line)) {
      h.authority = line.replace(/^Herausgeber:\s*/i, "");
    }
    const cit = /GV\.\s*NRW\.?\s*S\.\s*\d+|BASS\s+\d{1,2}\s*[-–]\s*\d{2}(?:\s*Nr\.?\s*\d+)?/i.exec(line);
    if (cit && !h.citation) h.citation = cit[0].replace(/\s+/g, " ");

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

export const apoBkNrwParser: LegalImportParser = {
  id: "apo-bk-nrw",
  label: "APO-BK NRW",
  kind: "ordinance",

  canParse(input: LegalImportInput): boolean {
    const raw = input.raw.slice(0, 6000);
    if (input.hint?.officialUrl && /apo[-_]?bk/i.test(input.hint.officialUrl)) return true;
    if (APO_SHORT_RE.test(raw)) return true;
    if (APO_TITLE_RE.test(raw)) return true;
    return false;
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const header = extractHeader(lines);

    // Hinweis (2026-08-13): der HTML-<title> von bass.schule.nrw ist auf jeder
    // Seite generisch "BASS" (input.hint.detectedTitle) - kein Rückschluss auf
    // das konkrete Dokument. Der aus dem Titelblock geparste header.title hat
    // deshalb Vorrang, detectedTitle ist nur Notnagel, falls das Parsen scheitert.
    const root = mk({
      kind: "document",
      heading: header.title ?? input.hint?.detectedTitle ?? "APO-BK",
    });

    let currentAnlage: LegalNode | null = null;
    let currentPart: LegalNode | null = null;
    let currentChapter: LegalNode | null = null;
    let currentSection: LegalNode | null = null;
    let currentBlock: LegalNode | null = null;
    let currentSubsection: LegalNode | null = null;
    let tableBuffer: string[][] | null = null;
    // Direkt nach "§ N" (ohne Titel auf derselben Zeile) steht die echte
    // Überschrift auf der nächsten inhaltlichen Zeile - einmalig als Titel abgreifen.
    let awaitingHeading = false;
    // Die "Inhaltsübersicht" listet jeden Paragraphen nochmal inline ("§ N Titel")
    // auf - das sind Navigationsvorschauen, keine Rechtsnormen. Echte Paragraphen
    // stehen auf dieser Seite immer als "§ N" allein auf eigener Zeile.
    let inTableOfContents = false;

    /** Struktur-Reset beim Wechsel in eine Anlage. */
    const resetInAnlage = () => {
      currentPart = currentChapter = currentSection = currentBlock = currentSubsection = null;
    };

    const anlageRoot = (): LegalNode => currentAnlage ?? root;
    const containerForBlock = (): LegalNode =>
      currentSection ?? currentChapter ?? currentPart ?? anlageRoot();
    const containerForItem = (): LegalNode =>
      currentSubsection ?? currentBlock ?? containerForBlock();

    const flushTable = () => {
      if (tableBuffer && tableBuffer.length > 0) {
        containerForItem().children.push(buildTableNode(tableBuffer));
      }
      tableBuffer = null;
    };

    // Echte Paragraphenüberschriften stehen auf dieser Seite immer isoliert
    // nach einer Leerzeile. Seitenumbrüche in mehrseitigen Anlagen können dazu
    // führen, dass eine mitten im Fließtext stehende Verweisung ("... gemäß
    // § 10") durch den Zeilenumbruch wie eine eigene "§ 10"-Zeile aussieht -
    // ohne vorausgehende Leerzeile ist das aber keine neue Vorschrift, sondern
    // Fließtext (Fund beim Testimport, 2026-08-13: leere §-Knoten in Anlage C/D).
    let precededByBlank = true;

    for (let i = header.consumed; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { flushTable(); precededByBlank = true; continue; }
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
        resetInAnlage();
        continue;
      }
      if ((m = PART_RE.exec(line))) {
        currentPart = mk({ kind: "part", number: `Teil ${m[1]}`, heading: m[2]?.trim() || null });
        anlageRoot().children.push(currentPart);
        currentChapter = currentSection = currentBlock = currentSubsection = null;
        continue;
      }
      if ((m = CHAPTER_RE.exec(line))) {
        currentChapter = mk({ kind: "chapter", number: `Kapitel ${m[1]}`, heading: m[2]?.trim() || null });
        (currentPart ?? anlageRoot()).children.push(currentChapter);
        currentSection = currentBlock = currentSubsection = null;
        continue;
      }
      if ((m = SECTION_RE.exec(line))) {
        currentSection = mk({ kind: "section", number: `Abschnitt ${m[1]}`, heading: m[2]?.trim() || null });
        (currentChapter ?? currentPart ?? anlageRoot()).children.push(currentSection);
        currentBlock = currentSubsection = null;
        continue;
      }
      if (
        isNewBlock &&
        (m = PARAGRAPH_RE.exec(line)) &&
        !(m[2]?.trim() && looksLikeCrossReference(m[2]))
      ) {
        currentBlock = mk({ kind: "paragraph", number: `§ ${m[1]}`, heading: m[2]?.trim() || null });
        containerForBlock().children.push(currentBlock);
        currentSubsection = null;
        awaitingHeading = !currentBlock.heading;
        continue;
      }
      if ((m = SUBSECTION_RE.exec(line)) && currentBlock) {
        currentSubsection = mk({ kind: "subsection", number: `(${m[1]})`, text: m[2]?.trim() || null });
        attachRefs(currentSubsection);
        currentBlock.children.push(currentSubsection);
        awaitingHeading = false;
        continue;
      }

      if (awaitingHeading && currentBlock) {
        currentBlock.heading = line;
        awaitingHeading = false;
        continue;
      }

      let item: LegalNode | null = null;
      if ((m = ITEM_ALPHA_RE.exec(line))) {
        item = mk({ kind: "item", number: `${m[1]})`, text: m[2].trim() });
      } else if ((m = ITEM_NUM_RE.exec(line))) {
        item = mk({ kind: "item", number: `${m[1]}.`, text: m[2].trim() });
      } else if ((m = BULLET_RE.exec(line))) {
        item = mk({ kind: "item", number: null, text: m[1].trim() });
      }
      if (item) {
        attachRefs(item);
        containerForItem().children.push(item);
        continue;
      }

      const target =
        currentSubsection ?? currentBlock ?? currentSection ?? currentChapter ?? currentPart ?? currentAnlage;
      if (target) {
        target.text = [(target.text ?? ""), line].join(" ").trim();
        attachRefs(target);
      } else {
        const pre = mk({ kind: "text", text: line });
        attachRefs(pre);
        root.children.push(pre);
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
        key: "apo-bk-nrw",
        kind: "ordinance",
        title: header.title ?? input.hint?.detectedTitle ?? "APO Berufskolleg NRW",
        shortName: header.shortName ?? "APO-BK",
        jurisdiction: "NRW",
        authority: header.authority ?? "MSB NRW",
        officialUrl: input.hint?.officialUrl ?? null,
        language: "de",
        metadata: {
          source: "apo-bk",
          citation: header.citation,
          amendedAt: header.amendedAt,
        },
      },
      version: {
        label: versionLabel,
        publishedAt: header.publishedAt,
        validFrom: header.validFrom,
        validTo: header.validTo,
        citation: header.citation,
      },
      root,
      rawText: input.raw,
    };
  },
};
