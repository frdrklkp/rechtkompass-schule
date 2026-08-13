/**
 * DSGVO – Verordnung (EU) 2016/679 (Datenschutz-Grundverordnung), amtlicher
 * deutscher Volltext auf eur-lex.europa.eu (CELEX 32016R0679).
 *
 * eur-lex.europa.eu ist per AWS-WAF-Challenge gegen einfache serverseitige
 * Abrufe geschützt (der App-eigene Crawler kann diese Domain deshalb nicht
 * automatisiert erreichen) - der Rohtext für den einmaligen Import wurde
 * über einen echten Browser (der die Challenge besteht) abgerufen und wird
 * hier wie ein normaler Crawl-Rohtext geparst.
 *
 * Struktur: die 173 Erwägungsgründe ("Präambel", Nummern in Klammern) sind
 * Auslegungshilfen ohne eigene Rechtsverbindlichkeit und werden bewusst
 * übersprungen - erst ab "HABEN FOLGENDE VERORDNUNG ERLASSEN:" beginnt der
 * verbindliche, zitierfähige Verordnungstext (Kapitel/Abschnitt/Artikel).
 * Das Dokument endet mit "Geschehen zu Brüssel am ..." gefolgt von
 * nummerierten Fußnoten, die exakt wie Absätze ("(1)  ...") aussehen und
 * sonst fälschlich als weitere Absätze des letzten Artikels landen würden.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";

const OPERATIVE_START_RE = /^HABEN FOLGENDE VERORDNUNG ERLASSEN:?$/;
const OPERATIVE_END_RE = /^Geschehen zu\b/;
const CHAPTER_RE = /^KAPITEL\s+([IVXLCDM]+)$/;
const SECTION_RE = /^Abschnitt\s+(\d+)$/;
const ARTICLE_RE = /^Artikel\s+(\d+)$/;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;

function mkNode(node: Omit<LegalNode, "localId" | "children"> & { children?: LegalNode[] }): LegalNode {
  return { localId: "", children: node.children ?? [], ...node };
}

export const dsgvoParser: LegalImportParser = {
  id: "dsgvo",
  label: "DSGVO",
  kind: "law",

  canParse(input: LegalImportInput): boolean {
    const raw = input.raw.slice(0, 6000);
    if (input.hint?.officialUrl?.includes("eur-lex.europa.eu") && /32016R0679/i.test(input.hint.officialUrl)) {
      return true;
    }
    return /Datenschutz-Grundverordnung/i.test(raw) || /VERORDNUNG\s*\(EU\)\s*2016\/679/i.test(raw);
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const root: LegalNode = mkNode({
      kind: "document",
      heading: "Verordnung (EU) 2016/679 (Datenschutz-Grundverordnung – DSGVO)",
    });

    let inOperativeSection = false;
    let currentChapter: LegalNode | null = null;
    let currentSection: LegalNode | null = null;
    let currentArticle: LegalNode | null = null;
    let currentSubsection: LegalNode | null = null;
    let awaitingHeading = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (!inOperativeSection) {
        if (OPERATIVE_START_RE.test(line)) inOperativeSection = true;
        continue;
      }
      if (OPERATIVE_END_RE.test(line)) break;

      let m: RegExpExecArray | null;

      if ((m = CHAPTER_RE.exec(line))) {
        currentChapter = mkNode({ kind: "chapter", number: `Kapitel ${m[1]}`, heading: null });
        root.children.push(currentChapter);
        currentSection = currentArticle = currentSubsection = null;
        awaitingHeading = true;
        continue;
      }
      if ((m = SECTION_RE.exec(line))) {
        currentSection = mkNode({ kind: "section", number: `Abschnitt ${m[1]}`, heading: null });
        (currentChapter ?? root).children.push(currentSection);
        currentArticle = currentSubsection = null;
        awaitingHeading = true;
        continue;
      }
      if ((m = ARTICLE_RE.exec(line))) {
        currentArticle = mkNode({ kind: "article", number: `Art ${m[1]}`, heading: null });
        (currentSection ?? currentChapter ?? root).children.push(currentArticle);
        currentSubsection = null;
        awaitingHeading = true;
        continue;
      }
      if ((m = SUBSECTION_RE.exec(line)) && currentArticle) {
        currentSubsection = mkNode({ kind: "subsection", number: `(${m[1]})`, text: m[2]?.trim() || null });
        currentArticle.children.push(currentSubsection);
        awaitingHeading = false;
        continue;
      }
      if (awaitingHeading) {
        // Die zuletzt erzeugte Ebene (Artikel > Abschnitt > Kapitel) erhält
        // die Überschrift auf der nächsten inhaltlichen Zeile.
        const target = currentArticle ?? currentSection ?? currentChapter;
        if (target) target.heading = line;
        awaitingHeading = false;
        continue;
      }

      const target = currentSubsection ?? currentArticle;
      if (target) {
        target.text = [(target.text ?? ""), line].join(" ").trim();
      }
    }

    return {
      source: {
        key: "dsgvo",
        kind: "law",
        title: "Verordnung (EU) 2016/679 (Datenschutz-Grundverordnung – DSGVO)",
        shortName: "DSGVO",
        jurisdiction: "EU",
        authority: "Europäisches Parlament und Rat der Europäischen Union",
        officialUrl: input.hint?.officialUrl ?? null,
        language: "de",
        metadata: { celex: "32016R0679" },
      },
      version: {
        label: "27.4.2016 (ABl. L 119)",
        publishedAt: "2016-04-27",
        validFrom: "2018-05-25",
      },
      root,
      rawText: input.raw,
    };
  },
};
