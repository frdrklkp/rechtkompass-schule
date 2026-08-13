/**
 * Sprint 4.5C – Referenz-Parser: Schulgesetz NRW.
 *
 * Deterministisch, ohne KI. Erkennt die Struktur „§ N – Titel" mit
 * Absätzen „(1) …" und einfacher Satznummerierung. Andere Gesetzestexte
 * (BASS, APO-BK, VV, Erlasse) lassen sich durch analoge Parser ergänzen –
 * die Domänenobjekte sind identisch.
 *
 * Hinweis (Fund beim Testimport, 2026-08-13): recht.nrw.de liefert „§ N"
 * nie mit Bindestrich-Titel auf derselben Zeile, sondern als eigene Zeile,
 * gefolgt von der echten Überschrift auf der NÄCHSTEN Zeile sowie einer
 * Werkzeugleiste ("Mehr", "Paragraph ausdrucken", "Paragraph Link kopieren",
 * "Fußnoten") und Kopier-Hinweisen ("Link kopiert", "Der Link zum Pragraph
 * wurde kopiert" – Tippfehler im Original) VOR jedem Paragraphen. Der
 * generische HtmlExtractor entfernt das nicht (bewusst quellenunabhängig,
 * kennt keine Bedienelemente einzelner Portale) – die Behandlung gehört
 * hierher, in den quellenspezifischen Parser.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";

const PARAGRAPH_RE = /^§\s*(\d+[a-z]?)\s*(?:[–—-]\s*(.+))?$/;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;

/** Wiederkehrende Bedienelemente/Meldungen der recht.nrw.de-Seite, keine Rechtstext-Inhalte. */
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

export const schulgesetzNrwParser: LegalImportParser = {
  id: "schulgesetz-nrw",
  label: "Schulgesetz NRW",
  kind: "law",

  canParse(input: LegalImportInput): boolean {
    const raw = input.raw.slice(0, 4000);
    if (input.hint?.officialUrl?.includes("recht.nrw.de")) return true;
    if (/Schulgesetz\s+(?:für\s+das\s+Land\s+)?Nordrhein[-\s]Westfalen/i.test(raw)) return true;
    // Fallback: „§ 1" gefolgt von „(1)" im Rohtext
    return /^§\s*\d/m.test(raw) && /^\(\d+\)/m.test(raw);
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const root: LegalNode = mkNode({ kind: "document", heading: input.hint?.detectedTitle ?? "Schulgesetz NRW" });
    let currentParagraph: LegalNode | null = null;
    let currentSubsection: LegalNode | null = null;
    // Direkt nach "§ N" (ohne Bindestrich-Titel) steht die echte Überschrift
    // auf der nächsten inhaltlichen Zeile - einmalig als Titel abgreifen.
    let awaitingHeading = false;
    // Die Inhaltsübersicht am Dokumentanfang listet jede "§ N ..."-Zeile
    // noch einmal auf; das sind keine Rechtsnormen, sondern Navigation.
    let inTableOfContents = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line === "Inhaltsübersicht") {
        inTableOfContents = true;
        continue;
      }
      if (NOISE_LINES.has(line)) {
        // "Link kopiert" markiert zuverlässig den Beginn der echten Vorschriften.
        if (line === "Link kopiert") inTableOfContents = false;
        continue;
      }
      if (inTableOfContents) continue;

      const paraMatch = PARAGRAPH_RE.exec(line);
      if (paraMatch) {
        currentParagraph = mkNode({
          kind: "paragraph",
          number: `§ ${paraMatch[1]}`,
          heading: paraMatch[2]?.trim() || null,
        });
        root.children.push(currentParagraph);
        currentSubsection = null;
        awaitingHeading = !currentParagraph.heading;
        continue;
      }

      const subMatch = SUBSECTION_RE.exec(line);
      if (subMatch && currentParagraph) {
        currentSubsection = mkNode({
          kind: "subsection",
          number: `(${subMatch[1]})`,
          text: subMatch[2]?.trim() || null,
        });
        currentParagraph.children.push(currentSubsection);
        awaitingHeading = false;
        continue;
      }

      if (awaitingHeading && currentParagraph) {
        currentParagraph.heading = line;
        awaitingHeading = false;
        continue;
      }

      if (currentSubsection) {
        currentSubsection.text = [(currentSubsection.text ?? ""), line].join(" ").trim();
      } else if (currentParagraph) {
        currentParagraph.text = [(currentParagraph.text ?? ""), line].join(" ").trim();
      } else {
        // Präambel: als Dokumenttitel merken, nicht als eigener Knoten.
        if (!root.heading) root.heading = line;
        else root.heading = `${root.heading} ${line}`.trim();
      }
    }

    return {
      source: {
        key: "schulgesetz-nrw",
        kind: "law",
        title: input.hint?.detectedTitle ?? "Schulgesetz für das Land Nordrhein-Westfalen",
        shortName: "SchulG NRW",
        jurisdiction: "NRW",
        authority: "Land Nordrhein-Westfalen",
        officialUrl: input.hint?.officialUrl ?? null,
        language: "de",
      },
      version: { label: input.hint?.detectedVersion ?? "Unbekannte Fassung" },
      root,
      rawText: input.raw,
    };
  },
};
