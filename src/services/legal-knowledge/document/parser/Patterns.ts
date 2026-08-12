/** Deterministic regex catalogue for German legal texts. */
import type { SectionType } from "../types";

export interface PatternHit {
  type: SectionType;
  number: string | null;
  label: string;
  restOfLine: string;
  matchedText: string;
}

interface PatternRule {
  type: SectionType;
  regex: RegExp;
  buildLabel: (match: RegExpExecArray) => { number: string | null; label: string };
}

const PART_WORDS = [
  "Erster", "Zweiter", "Dritter", "Vierter", "Fünfter", "Sechster",
  "Siebter", "Siebenter", "Achter", "Neunter", "Zehnter", "Elfter", "Zwölfter",
].join("|");

const RULES: PatternRule[] = [
  {
    type: "book",
    regex: new RegExp(`^\\s*(${PART_WORDS})\\s+Buch\\b(.*)$`, "i"),
    buildLabel: (m) => ({ number: m[1], label: `${m[1]} Buch` }),
  },
  {
    type: "part",
    regex: new RegExp(`^\\s*(${PART_WORDS})\\s+Teil\\b(.*)$`, "i"),
    buildLabel: (m) => ({ number: m[1], label: `${m[1]} Teil` }),
  },
  {
    type: "part",
    regex: /^\s*Teil\s+([IVXLC]+|\d+)\b(.*)$/i,
    buildLabel: (m) => ({ number: m[1], label: `Teil ${m[1]}` }),
  },
  {
    type: "title",
    regex: /^\s*Titel\s+([IVXLC]+|\d+)\b(.*)$/i,
    buildLabel: (m) => ({ number: m[1], label: `Titel ${m[1]}` }),
  },
  {
    type: "chapter",
    regex: /^\s*Kapitel\s+([IVXLC]+|\d+)\b(.*)$/i,
    buildLabel: (m) => ({ number: m[1], label: `Kapitel ${m[1]}` }),
  },
  {
    type: "subchapter",
    regex: /^\s*Unterkapitel\s+([IVXLC]+|\d+)\b(.*)$/i,
    buildLabel: (m) => ({ number: m[1], label: `Unterkapitel ${m[1]}` }),
  },
  {
    type: "subsection",
    regex: /^\s*Unterabschnitt\s+([IVXLC]+|\d+)\b(.*)$/i,
    buildLabel: (m) => ({ number: m[1], label: `Unterabschnitt ${m[1]}` }),
  },
  {
    type: "section",
    regex: /^\s*Abschnitt\s+([IVXLC]+|\d+)\b(.*)$/i,
    buildLabel: (m) => ({ number: m[1], label: `Abschnitt ${m[1]}` }),
  },
  {
    type: "paragraph",
    regex: /^\s*§\s*(\d+[a-z]?)\b(.*)$/,
    buildLabel: (m) => ({ number: m[1], label: `§ ${m[1]}` }),
  },
  {
    type: "article",
    regex: /^\s*Art(?:ikel|\.)\s*(\d+[a-z]?)\b(.*)$/i,
    buildLabel: (m) => ({ number: m[1], label: `Art. ${m[1]}` }),
  },
  {
    type: "annex",
    regex: /^\s*Anlage\s+(\d+[a-z]?)\b(.*)$/i,
    buildLabel: (m) => ({ number: m[1], label: `Anlage ${m[1]}` }),
  },
  {
    type: "absatz",
    regex: /^\s*\((\d+[a-z]?)\)\s*(.*)$/,
    buildLabel: (m) => ({ number: m[1], label: `Abs. ${m[1]}` }),
  },
  {
    type: "number",
    regex: /^\s*(\d{1,3})\.\s+(.*)$/,
    buildLabel: (m) => ({ number: m[1], label: `Nr. ${m[1]}` }),
  },
  {
    type: "letter",
    regex: /^\s*([a-z])\)\s*(.*)$/,
    buildLabel: (m) => ({ number: m[1], label: `lit. ${m[1]}` }),
  },
];

export function detectLineType(line: string): PatternHit | null {
  for (const rule of RULES) {
    const m = rule.regex.exec(line);
    if (!m) continue;
    const { number, label } = rule.buildLabel(m);
    const rest = (m[m.length - 1] ?? "").trim();
    return {
      type: rule.type,
      number,
      label,
      restOfLine: rest,
      matchedText: line.slice(0, m[0].length).trim(),
    };
  }
  return null;
}

/** Reference regexes (detected inside text bodies). */
export const REFERENCE_PATTERNS = {
  paragraph: /§\s*(\d+[a-z]?)(?:\s*Abs\.?\s*(\d+[a-z]?))?(?:\s*Satz\s*(\d+))?(?:\s*Nr\.?\s*(\d+))?/g,
  article: /Art(?:ikel|\.)\s*(\d+[a-z]?)(?:\s*Abs\.?\s*(\d+[a-z]?))?/g,
  annex: /Anlage\s+(\d+[a-z]?)/g,
} as const;
