/**
 * KunstUrhG – Gesetz betreffend das Urheberrecht an Werken der bildenden
 * Künste und der Photographie. Bundesrecht; §§ 22 ff. (Recht am eigenen
 * Bild, Einwilligung, Ausnahmen) sind die zentrale Rechtsgrundlage für
 * Schulfälle zu Fotos/Videos von Schülerinnen und Schülern (Fund Nachtlauf
 * 2026-08-26: mehrere rote Fälle zitieren das fehlende KunstUrhG).
 *
 * gesetze-im-internet.de liefert dieses Dokument über dieselbe Seitenvorlage
 * wie BeamtStG/GG (siehe beamtstgParser.ts, dessen Kernlogik hier unverändert
 * übernommen wird). Die Abschnitte des KunstUrhG tragen ausgeschriebene
 * Ordnungswörter ("Erster Abschnitt") - sie matchen bewusst nicht und die
 * Paragraphen hängen dann flach am Dokument, was für Chunking/Verlinkung
 * ausreicht.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";

const SECTION_START_RE = /^Nichtamtliches\s+Inhaltsverzeichnis(.*)$/;
const PARAGRAPH_RE = /^§\s*(\d+[a-z]?)\s*(.*)$/;
const ABSCHNITT_RE = /^Abschnitt\s+(\d+[a-z]?)\s*[-–—]?\s*(.*)$/i;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;
const AUSFERTIGUNG_RE = /^Ausfertigungsdatum:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const STAND_DATE_RE = /Zuletzt\s+ge[aä]ndert.*?(\d{1,2})\.(\d{1,2})\.(\d{4})/;

function mkNode(node: Omit<LegalNode, "localId" | "children"> & { children?: LegalNode[] }): LegalNode {
  return { localId: "", children: node.children ?? [], ...node };
}

const FALLBACK_TITLE = "Gesetz betreffend das Urheberrecht an Werken der bildenden Künste und der Photographie (KunstUrhG)";

export const kunsturhgParser: LegalImportParser = {
  id: "kunsturhg",
  label: "KunstUrhG",
  kind: "law",

  canParse(input: LegalImportInput): boolean {
    if (input.hint?.officialUrl?.includes("gesetze-im-internet.de/kunsturhg")) return true;
    const raw = input.raw.slice(0, 4000);
    return /Urheberrecht an Werken der bildenden Künste und der Photographie|KunstUrhG/i.test(raw);
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const root: LegalNode = mkNode({
      kind: "document",
      heading: input.hint?.detectedTitle ?? FALLBACK_TITLE,
    });

    let currentAbschnitt: LegalNode | null = null;
    let currentParagraph: LegalNode | null = null;
    let currentSubsection: LegalNode | null = null;
    let publishedAt: string | null = null;
    let amendedAt: string | null = null;

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
          (currentAbschnitt ?? root).children.push(currentParagraph);
          currentSubsection = null;
          continue;
        }
        const am = ABSCHNITT_RE.exec(rest);
        if (am) {
          currentAbschnitt = mkNode({ kind: "section", number: `Abschnitt ${am[1]}`, heading: am[2]?.trim() || null });
          root.children.push(currentAbschnitt);
          currentParagraph = currentSubsection = null;
          continue;
        }
        if (rest === "Eingangsformel") {
          currentParagraph = mkNode({ kind: "paragraph", number: "Eingangsformel", heading: null });
          root.children.push(currentParagraph);
          currentSubsection = null;
          continue;
        }
        continue;
      }

      if ((m = ABSCHNITT_RE.exec(line))) {
        currentAbschnitt = mkNode({ kind: "section", number: `Abschnitt ${m[1]}`, heading: m[2]?.trim() || null });
        root.children.push(currentAbschnitt);
        currentParagraph = currentSubsection = null;
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
        key: "kunsturhg",
        kind: "law",
        title: input.hint?.detectedTitle ?? FALLBACK_TITLE,
        shortName: "KunstUrhG",
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
