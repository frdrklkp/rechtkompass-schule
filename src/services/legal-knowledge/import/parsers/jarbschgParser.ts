/**
 * JArbSchG – Jugendarbeitsschutzgesetz. Bundesrecht; Arbeitszeiten,
 * Ruhepausen, Beschäftigungsverbote und Berufsschulfreistellung für
 * minderjährige Auszubildende - zweite ausbildungsrechtliche Kernquelle
 * neben dem BBiG (Fund 2026-09-01, fehlte komplett).
 *
 * gesetze-im-internet.de liefert dieses Dokument über dieselbe Seitenvorlage
 * wie BeamtStG/KunstUrhG (siehe beamtstgParser.ts); Abschnitte/Titel mit
 * ausgeschriebenen Ordnungswörtern fallen bewusst auf flache §-Struktur
 * zurück.
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

const FALLBACK_TITLE = "Gesetz zum Schutze der arbeitenden Jugend (Jugendarbeitsschutzgesetz - JArbSchG)";

export const jarbschgParser: LegalImportParser = {
  id: "jarbschg",
  label: "JArbSchG",
  kind: "law",

  canParse(input: LegalImportInput): boolean {
    if (input.hint?.officialUrl?.includes("gesetze-im-internet.de/jarbschg")) return true;
    const raw = input.raw.slice(0, 4000);
    return /Jugendarbeitsschutzgesetz|Gesetz zum Schutze der arbeitenden Jugend/i.test(raw);
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
        key: "jarbschg",
        kind: "law",
        title: input.hint?.detectedTitle ?? FALLBACK_TITLE,
        shortName: "JArbSchG",
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
