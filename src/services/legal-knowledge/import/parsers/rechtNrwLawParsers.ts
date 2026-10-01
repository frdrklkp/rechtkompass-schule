/**
 * Weitere NRW-Landesgesetze von recht.nrw.de (gleiche "LRGV"-Seitenvorlage
 * wie DSG/LBG/LDG NRW). Statt einen weiteren Klon zu pflegen, delegiert der
 * Wrapper an die Kernlogik des dsgNrwParser (Teil/Kapitel/Abschnitt/§/Absatz)
 * und ersetzt nur die dokumentspezifischen Metadaten.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";
import { dsgNrwParser } from "./dsgNrwParser";

interface RechtNrwLawOptions {
  id: string;
  label: string;
  shortName: string;
  fallbackTitle: string;
  /** Erkennung über die offizielle URL, z.B. /landespersonalvertretungsgesetz/. */
  urlRe: RegExp;
  /** Erkennung über die ersten 6000 Zeichen des Rohtexts. */
  detectRe: RegExp;
}

const AMENDMENT_NOTE_RE = /\b(zuletzt geändert|geändert durch|neu gefasst|eingefügt|aufgehoben|in Kraft getreten|GV\.\s*N)/i;
const NO_HEADING = "⟦ohne Titel⟧";
const PAGE_NOISE = new Set(["Mehr", "Paragraph ausdrucken", "Paragraph Link kopieren", "Fußnoten", "Link kopiert"]);

// Fußnoten ("§ 62 neu gefasst durch ...") stehen auf recht.nrw.de direkt nach
// dem Marker "Fußnoten". Der DSG-Kernparser würde sie als Paragraphentitel
// bzw. Fließtext übernehmen und damit Titel und Retrieval verunreinigen.
// Älteren Gesetzen (LPVG) fehlt zudem der Paragraphentitel: beginnt nach den
// Fußnoten sofort der Gesetzestext, bekommt der Parser einen Platzhalter, damit
// die erste Textzeile nicht als Titel verschluckt wird.
function stripFootnotes(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (lines[i].trim() !== "Fußnoten") continue;
    let dropped = 0;
    let j = i + 1;
    for (;;) {
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && AMENDMENT_NOTE_RE.test(lines[j]) && /^§/.test(lines[j].trim())) { dropped++; j++; } else break;
    }
    if (dropped === 0) continue;
    // Hat der Paragraph schon einen Titel? Dann steht er zwischen der
    // "§ N"-Zeile und dem Marker "Fußnoten" (BGG NRW); sonst (LPVG) fehlt er.
    let k = i - 1;
    while (k >= 0 && !/^§\s*\d+[a-z]?\s*$/.test(lines[k].trim())) k--;
    const hasHeading = k >= 0 && lines.slice(k + 1, i).some((l) => l.trim() && !PAGE_NOISE.has(l.trim()));
    if (!hasHeading) out.push("", NO_HEADING);
    i = j - 1;
  }
  return out.join("\n");
}

function clearPlaceholderHeadings(node: LegalNode): void {
  if (node.heading === NO_HEADING) node.heading = null;
  for (const child of node.children) clearPlaceholderHeadings(child);
}

function makeRechtNrwLawParser(opts: RechtNrwLawOptions): LegalImportParser {
  return {
    id: opts.id,
    label: opts.label,
    kind: "law",
    canParse(input: LegalImportInput): boolean {
      const url = input.hint?.officialUrl ?? "";
      if (url.includes("recht.nrw.de") && opts.urlRe.test(url)) return true;
      return opts.detectRe.test(input.raw.slice(0, 6000));
    },
    parse(input: LegalImportInput): NormalizedLegalDocument {
      const doc = dsgNrwParser.parse({ ...input, raw: stripFootnotes(input.raw) });
      clearPlaceholderHeadings(doc.root);
      return {
        ...doc,
        source: {
          ...doc.source,
          key: opts.id,
          title: input.hint?.detectedTitle ?? opts.fallbackTitle,
          shortName: opts.shortName,
        },
      };
    },
  };
}

export const bggNrwParser = makeRechtNrwLawParser({
  id: "bgg-nrw",
  label: "BGG NRW",
  shortName: "BGG NRW",
  fallbackTitle: "Gesetz des Landes Nordrhein-Westfalen zur Gleichstellung von Menschen mit Behinderung (Behindertengleichstellungsgesetz Nordrhein-Westfalen - BGG NRW)",
  urlRe: /gleichstellung-von-menschen-mit/i,
  detectRe: /Behindertengleichstellungsgesetz Nordrhein-Westfalen|BGG NRW/i,
});

export const lpvgNrwParser = makeRechtNrwLawParser({
  id: "lpvg-nrw",
  label: "LPVG NRW",
  shortName: "LPVG NRW",
  fallbackTitle: "Personalvertretungsgesetz für das Land Nordrhein-Westfalen (Landespersonalvertretungsgesetz - LPVG)",
  urlRe: /personalvertretungsgesetz/i,
  detectRe: /Landespersonalvertretungsgesetz|Personalvertretungsgesetz für das Land Nordrhein-Westfalen/i,
});
