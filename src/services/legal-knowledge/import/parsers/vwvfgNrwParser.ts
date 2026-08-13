/**
 * VwVfG NRW – Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen.
 *
 * recht.nrw.de liefert dieses Dokument über die neuere "LRGV"-Seitenvorlage
 * (Fassungs-Sidebar, Stammnorm/Ausfertigungsdatum-Kopfzeile) statt der
 * älteren Vorlage, die der Schulgesetz-Parser kennt. Die Paragraphen selbst
 * folgen aber demselben Muster wie beim Schulgesetz: „§ N" auf eigener Zeile,
 * echte Überschrift auf der nächsten Zeile, dieselbe Paragraphen-Werkzeugleiste
 * ("Mehr", "Paragraph ausdrucken", "Paragraph Link kopieren", "Fußnoten",
 * "Link kopiert", "Der Link zum Pragraph wurde kopiert") und dasselbe
 * "Inhaltsübersicht"-TOC-Muster – die Kernlogik ist vom Schulgesetz-Parser
 * übernommen. Der unterschiedliche Kopfbereich wird komplett verworfen statt
 * (wie beim Schulgesetz) als Präambel an root.heading angehängt, da er sonst
 * den Dokumenttitel mit Sidebar-Chrome verunreinigen würde; der <title> der
 * Seite ist auf recht.nrw.de zuverlässig der echte Dokumenttitel.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";

const PARAGRAPH_RE = /^§\s*(\d+[a-z]?)\s*(?:[–—-]\s*(.+))?$/;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;
const TEIL_RE = /^Teil\s+([IVXLCDM]+|\d+)\s*(.*)$/i;
const ABSCHNITT_RE = /^Abschnitt\s+(\d+[a-z]?)\s*(.*)$/i;
const AUSFERTIGUNG_DATE_RE = /^\d{1,2}\.\d{1,2}\.\d{4}$/;

/** Wiederkehrende Paragraphen-Werkzeugleiste von recht.nrw.de, keine Rechtstext-Inhalte. */
const NOISE_LINES = new Set([
  "Mehr",
  "Paragraph ausdrucken",
  "Paragraph Link kopieren",
  "Fußnoten",
  "Link kopiert",
  "Der Link zum Pragraph wurde kopiert", // Tippfehler steht so im Original
]);

function mkNode(node: Omit<LegalNode, "localId" | "children"> & { children?: LegalNode[] }): LegalNode {
  return { localId: "", children: node.children ?? [], ...node };
}

/** Verweise wie "§ 10 gilt entsprechend." sind ganze Sätze, keine neue Paragraphenüberschrift. */
function looksLikeCrossReference(text: string): boolean {
  return /[.!?:]$/.test(text.trim());
}

function numericToIso(dm: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(dm);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

const GERMAN_MONTHS: Record<string, string> = {
  januar: "01", februar: "02", märz: "03", april: "04", mai: "05", juni: "06",
  juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
};

/** Letztes "in Kraft getreten am DD. Monatsname YYYY" im Änderungshistorie-Fließtext. */
function lastAmendmentDate(text: string): string | null {
  const re = /in Kraft getreten am (\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const mm = GERMAN_MONTHS[m[2].toLowerCase()];
    if (mm) last = `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  }
  return last;
}

export const vwvfgNrwParser: LegalImportParser = {
  id: "vwvfg-nrw",
  label: "VwVfG NRW",
  kind: "law",

  canParse(input: LegalImportInput): boolean {
    const raw = input.raw.slice(0, 6000);
    if (input.hint?.officialUrl?.includes("recht.nrw.de") && /verwaltungsverfahrensgesetz/i.test(input.hint.officialUrl)) {
      return true;
    }
    return /Verwaltungsverfahrensgesetz\s+(?:für\s+das\s+Land\s+)?Nordrhein[-\s]Westfalen/i.test(raw);
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const root: LegalNode = mkNode({
      kind: "document",
      heading: input.hint?.detectedTitle ?? "Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen",
    });

    let currentPart: LegalNode | null = null;
    let currentSection: LegalNode | null = null;
    let currentParagraph: LegalNode | null = null;
    let currentSubsection: LegalNode | null = null;
    let awaitingHeading = false;
    let inTableOfContents = false;
    // Der Kopfbereich (Fassungs-Sidebar, Stammnorm-Kopfzeile) wird komplett
    // verworfen statt an root.heading angehängt - endet an der ersten
    // eigenständigen "Inhaltsübersicht"-Zeile (nicht dem Satzfragment
    // "Inhaltsübersicht zuletzt geändert durch ...").
    let inHeaderRegion = true;
    let awaitingField: "publishedAt" | "validFrom" | null = null;
    let publishedAt: string | null = null;
    let validFrom: string | null = null;
    let amendedAt: string | null = null;
    let precededByBlank = true;

    const containerForParagraph = (): LegalNode => currentSection ?? currentPart ?? root;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) { precededByBlank = true; continue; }
      const isNewBlock = precededByBlank;
      precededByBlank = false;

      if (inHeaderRegion) {
        if (line === "Ausfertigungsdatum") { awaitingField = "publishedAt"; continue; }
        if (line === "Gültig ab") { awaitingField = "validFrom"; continue; }
        if (awaitingField && AUSFERTIGUNG_DATE_RE.test(line)) {
          const iso = numericToIso(line);
          if (awaitingField === "publishedAt") publishedAt = iso;
          else validFrom = iso;
          awaitingField = null;
          continue;
        }
        if (/in Kraft getreten am/i.test(line)) {
          const found = lastAmendmentDate(line);
          if (found) amendedAt = found;
        }
        if (line === "Inhaltsübersicht") {
          inHeaderRegion = false;
          inTableOfContents = true;
        }
        continue;
      }

      if (NOISE_LINES.has(line)) {
        if (line === "Link kopiert") inTableOfContents = false;
        continue;
      }
      if (line === "Inhaltsübersicht") { inTableOfContents = true; continue; }
      if (inTableOfContents) continue;

      let m: RegExpExecArray | null;

      // Fußnoten wie "Teil I Abschnitt 3 mit § 8a bis § 8e eingefügt durch
      // Artikel 1 des Gesetzes vom ... ." beginnen zufällig mit "Teil I" /
      // "Abschnitt N", sind aber ganze Sätze (enden auf Satzzeichen) und
      // keine echte Gliederungsüberschrift - sonst würde currentParagraph
      // zurückgesetzt und der nachfolgende echte Absatztext verworfen.
      if (
        (m = TEIL_RE.exec(line)) &&
        !(m[2]?.trim() && looksLikeCrossReference(m[2]))
      ) {
        currentPart = mkNode({ kind: "part", number: `Teil ${m[1]}`, heading: m[2]?.trim() || null });
        root.children.push(currentPart);
        currentSection = currentParagraph = currentSubsection = null;
        continue;
      }
      if (
        (m = ABSCHNITT_RE.exec(line)) &&
        !(m[2]?.trim() && looksLikeCrossReference(m[2]))
      ) {
        currentSection = mkNode({ kind: "section", number: `Abschnitt ${m[1]}`, heading: m[2]?.trim() || null });
        (currentPart ?? root).children.push(currentSection);
        currentParagraph = currentSubsection = null;
        continue;
      }
      if (
        isNewBlock &&
        (m = PARAGRAPH_RE.exec(line)) &&
        !(m[2]?.trim() && looksLikeCrossReference(m[2]))
      ) {
        currentParagraph = mkNode({ kind: "paragraph", number: `§ ${m[1]}`, heading: m[2]?.trim() || null });
        containerForParagraph().children.push(currentParagraph);
        currentSubsection = null;
        awaitingHeading = !currentParagraph.heading;
        continue;
      }
      if ((m = SUBSECTION_RE.exec(line)) && currentParagraph) {
        currentSubsection = mkNode({ kind: "subsection", number: `(${m[1]})`, text: m[2]?.trim() || null });
        currentParagraph.children.push(currentSubsection);
        awaitingHeading = false;
        continue;
      }
      if (awaitingHeading && currentParagraph) {
        currentParagraph.heading = line;
        awaitingHeading = false;
        continue;
      }

      const target = currentSubsection ?? currentParagraph;
      if (target) {
        target.text = [(target.text ?? ""), line].join(" ").trim();
      }
    }

    return {
      source: {
        key: "vwvfg-nrw",
        kind: "law",
        title: input.hint?.detectedTitle ?? "Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen",
        shortName: "VwVfG NRW",
        jurisdiction: "NRW",
        authority: "Land Nordrhein-Westfalen",
        officialUrl: input.hint?.officialUrl ?? null,
        language: "de",
        metadata: { amendedAt },
      },
      version: {
        label: input.hint?.detectedVersion ?? (validFrom ? `Fassung ${validFrom}` : "Unbekannte Fassung"),
        publishedAt,
        validFrom,
      },
      root,
      rawText: input.raw,
    };
  },
};
