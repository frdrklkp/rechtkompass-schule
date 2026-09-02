/**
 * Quellenerweiterung Runde 1 (2026-09-02): gemeinsame Fabrik für
 * gesetze-im-internet.de-Volltextseiten. Die bisherigen Parser (BeamtStG,
 * KunstUrhG, SGB VIII, BBiG, JArbSchG) sind fast identische Klone derselben
 * Seitenvorlage - für die Bundesrecht-Auszüge (BGB, StGB, SGB VII, JuSchG)
 * wird die Logik hier einmal zentral gepflegt statt weiter geklont.
 *
 * Zusätzlich gegenüber den Klonen: BGB/StGB gliedern nicht nur in
 * "Abschnitt", sondern auch in Buch/Teil/Titel/Untertitel/Kapitel - diese
 * Ordnungswörter werden als section-Knoten erkannt, damit sie nicht als
 * Fließtext in den vorangehenden Paragraphen laufen.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";

const SECTION_START_RE = /^Nichtamtliches\s+Inhaltsverzeichnis(.*)$/;
const PARAGRAPH_RE = /^§\s*(\d+[a-z]?)\s*(.*)$/;
const STRUCTURE_RE = /^(Buch|Teil|Abschnitt|Titel|Untertitel|Kapitel)\s+(\d+[a-z]?)\s*[-–—]?\s*(.*)$/i;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;
const AUSFERTIGUNG_RE = /^Ausfertigungsdatum:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const STAND_DATE_RE = /Zuletzt\s+ge[aä]ndert.*?(\d{1,2})\.(\d{1,2})\.(\d{4})/;

function mkNode(node: Omit<LegalNode, "localId" | "children"> & { children?: LegalNode[] }): LegalNode {
  return { localId: "", children: node.children ?? [], ...node };
}

export interface GesetzeImInternetParserOptions {
  /** Parser-/Quellen-Schlüssel, z.B. "bgb". */
  id: string;
  /** Anzeigename, z.B. "BGB". */
  label: string;
  shortName: string;
  fallbackTitle: string;
  /** URL-Erkennung, z.B. "gesetze-im-internet.de/bgb". */
  urlFragment: string;
  /** Inhaltliche Erkennung auf den ersten 4000 Zeichen. */
  detectRe: RegExp;
}

export function makeGesetzeImInternetParser(opts: GesetzeImInternetParserOptions): LegalImportParser {
  return {
    id: opts.id,
    label: opts.label,
    kind: "law",

    canParse(input: LegalImportInput): boolean {
      if (input.hint?.officialUrl?.includes(opts.urlFragment)) return true;
      return opts.detectRe.test(input.raw.slice(0, 4000));
    },

    parse(input: LegalImportInput): NormalizedLegalDocument {
      const lines = input.raw.split(/\r?\n/);
      const root: LegalNode = mkNode({
        kind: "document",
        heading: input.hint?.detectedTitle ?? opts.fallbackTitle,
      });

      let currentStructure: LegalNode | null = null;
      let currentParagraph: LegalNode | null = null;
      let currentSubsection: LegalNode | null = null;
      let publishedAt: string | null = null;
      let amendedAt: string | null = null;

      const openStructure = (kindWord: string, num: string, heading: string) => {
        // Bewusst flach: nur die JEWEILS LETZTE Gliederungsebene wird als
        // Elternknoten geführt (wie in den bestehenden Klon-Parsern). Die
        // Referenz eines § bleibt damit "<Gliederung>.§ N" statt eines
        // tiefen Pfads - die Import-Pfade sind so kurz und stabil.
        currentStructure = mkNode({ kind: "section", number: `${kindWord} ${num}`, heading: heading || null });
        root.children.push(currentStructure);
        currentParagraph = currentSubsection = null;
      };

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const ausf = AUSFERTIGUNG_RE.exec(line);
        if (ausf) { publishedAt = `${ausf[3]}-${ausf[2].padStart(2, "0")}-${ausf[1].padStart(2, "0")}`; continue; }
        const stand = STAND_DATE_RE.exec(line);
        if (stand) { amendedAt = `${stand[3]}-${stand[2].padStart(2, "0")}-${stand[1].padStart(2, "0")}`; continue; }

        let m: RegExpExecArray | null;
        if ((m = SECTION_START_RE.exec(line))) {
          const rest = m[1].trim();
          const pm = PARAGRAPH_RE.exec(rest);
          if (pm) {
            currentParagraph = mkNode({ kind: "paragraph", number: `§ ${pm[1]}`, heading: pm[2]?.trim() || null });
            (currentStructure ?? root).children.push(currentParagraph);
            currentSubsection = null;
            continue;
          }
          const sm = STRUCTURE_RE.exec(rest);
          if (sm) { openStructure(sm[1], sm[2], sm[3]?.trim() ?? ""); continue; }
          if (rest === "Eingangsformel") {
            currentParagraph = mkNode({ kind: "paragraph", number: "Eingangsformel", heading: null });
            root.children.push(currentParagraph);
            currentSubsection = null;
            continue;
          }
          continue;
        }

        if ((m = STRUCTURE_RE.exec(line))) {
          openStructure(m[1], m[2], m[3]?.trim() ?? "");
          continue;
        }

        if ((m = SUBSECTION_RE.exec(line)) && currentParagraph) {
          currentSubsection = mkNode({ kind: "subsection", number: `(${m[1]})`, text: m[2]?.trim() || null });
          currentParagraph.children.push(currentSubsection);
          continue;
        }

        const target = currentSubsection ?? currentParagraph;
        if (target) {
          target.text = [(target.text ?? ""), line].join(" ").trim();
        }
      }

      return {
        source: {
          key: opts.id,
          kind: "law",
          title: input.hint?.detectedTitle ?? opts.fallbackTitle,
          shortName: opts.shortName,
          jurisdiction: "Bund",
          authority: "Bundesrepublik Deutschland",
          officialUrl: input.hint?.officialUrl ?? null,
          language: "de",
          metadata: { amendedAt },
        },
        version: {
          label: amendedAt ? `Fassung ${amendedAt}` : (input.hint?.detectedVersion ?? "Unbekannte Fassung"),
          publishedAt,
          validFrom: amendedAt,
        },
        root,
        rawText: input.raw,
      };
    },
  };
}

export const bgbParser = makeGesetzeImInternetParser({
  id: "bgb",
  label: "BGB",
  shortName: "BGB",
  fallbackTitle: "Bürgerliches Gesetzbuch (BGB)",
  urlFragment: "gesetze-im-internet.de/bgb",
  detectRe: /Bürgerliches Gesetzbuch/i,
});

export const stgbParser = makeGesetzeImInternetParser({
  id: "stgb",
  label: "StGB",
  shortName: "StGB",
  fallbackTitle: "Strafgesetzbuch (StGB)",
  urlFragment: "gesetze-im-internet.de/stgb",
  detectRe: /Strafgesetzbuch/i,
});

export const sgb7Parser = makeGesetzeImInternetParser({
  id: "sgb-7",
  label: "SGB VII",
  shortName: "SGB VII",
  fallbackTitle: "Sozialgesetzbuch (SGB) Siebtes Buch (VII) - Gesetzliche Unfallversicherung",
  urlFragment: "gesetze-im-internet.de/sgb_7",
  detectRe: /Gesetzliche Unfallversicherung|Siebtes Buch/i,
});

export const juschgParser = makeGesetzeImInternetParser({
  id: "juschg",
  label: "JuSchG",
  shortName: "JuSchG",
  fallbackTitle: "Jugendschutzgesetz (JuSchG)",
  urlFragment: "gesetze-im-internet.de/juschg",
  detectRe: /Jugendschutzgesetz/i,
});
