/**
 * DSG NRW – Datenschutzgesetz Nordrhein-Westfalen. Landesrechtliche
 * Ergänzung der DSGVO für öffentliche Stellen - zentral für Schul-
 * Datenschutzfälle, die bisher nur auf § 120 SchulG NRW oder die DSGVO
 * gestützt werden konnten (Fund Nachtlauf 2026-08-26: 18 rote Fälle
 * verweisen auf das fehlende DSG NRW).
 *
 * recht.nrw.de liefert dieses Dokument über dieselbe "LRGV"-Seitenvorlage
 * wie VwVfG/LBG/LDG NRW (siehe vwvfgNrwParser.ts, dessen Kernlogik hier
 * unverändert übernommen wird). Nur canParse() und die dokumentspezifischen
 * Metadaten unterscheiden sich.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";

const PARAGRAPH_RE = /^§\s*(\d+[a-z]?)\s*(?:[–—-]\s*(.+))?$/;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;
const TEIL_RE = /^Teil\s+([IVXLCDM]+|\d+)\s*(.*)$/i;
const ABSCHNITT_RE = /^Abschnitt\s+(\d+[a-z]?)\s*(.*)$/i;
const KAPITEL_RE = /^Kapitel\s+(\d+[a-z]?)\s*(.*)$/i;
const AUSFERTIGUNG_DATE_RE = /^\d{1,2}\.\d{1,2}\.\d{4}$/;

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

const FALLBACK_TITLE = "Gesetz zur Anpassung des allgemeinen Datenschutzrechts an die Verordnung (EU) 2016/679 (Datenschutzgesetz Nordrhein-Westfalen - DSG NRW)";

export const dsgNrwParser: LegalImportParser = {
  id: "dsg-nrw",
  label: "DSG NRW",
  kind: "law",

  canParse(input: LegalImportInput): boolean {
    const raw = input.raw.slice(0, 6000);
    if (input.hint?.officialUrl?.includes("recht.nrw.de") && /datenschutzgesetz/i.test(input.hint.officialUrl)) {
      return true;
    }
    return /Datenschutzgesetz Nordrhein-Westfalen|DSG NRW/i.test(raw);
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const root: LegalNode = mkNode({
      kind: "document",
      heading: input.hint?.detectedTitle ?? FALLBACK_TITLE,
    });

    let currentPart: LegalNode | null = null;
    let currentSection: LegalNode | null = null;
    let currentParagraph: LegalNode | null = null;
    let currentSubsection: LegalNode | null = null;
    let awaitingHeading = false;
    let inTableOfContents = false;
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

      if (
        (m = TEIL_RE.exec(line)) &&
        !(m[2]?.trim() && looksLikeCrossReference(m[2]))
      ) {
        currentPart = mkNode({ kind: "part", number: `Teil ${m[1]}`, heading: m[2]?.trim() || null });
        root.children.push(currentPart);
        currentSection = currentParagraph = currentSubsection = null;
        continue;
      }
      // Das DSG NRW gliedert in Teile und darunter teils Kapitel, teils
      // Abschnitte - beide werden als "section"-Ebene behandelt.
      if (
        ((m = ABSCHNITT_RE.exec(line)) || (m = KAPITEL_RE.exec(line))) &&
        !(m[2]?.trim() && looksLikeCrossReference(m[2]))
      ) {
        const label = /^Kapitel/i.test(line) ? "Kapitel" : "Abschnitt";
        currentSection = mkNode({ kind: "section", number: `${label} ${m[1]}`, heading: m[2]?.trim() || null });
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
        key: "dsg-nrw",
        kind: "law",
        title: input.hint?.detectedTitle ?? FALLBACK_TITLE,
        shortName: "DSG NRW",
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
