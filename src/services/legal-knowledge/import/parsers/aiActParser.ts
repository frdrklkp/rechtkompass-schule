/**
 * EU-KI-Verordnung – Verordnung (EU) 2024/1689 ("AI Act"), amtlicher
 * deutscher Volltext auf eur-lex.europa.eu (CELEX 32024R1689).
 *
 * Quellenerweiterung Runde 2 (2026-09-02): 24 Rot-Fälle der Kategorie
 * "KI im Unterricht" scheitern an der zentralen Zulässigkeitsfrage, die
 * nur diese Verordnung beantwortet (Bildung ist Hochrisiko-Bereich nach
 * Anhang III Nr. 3; Emotionserkennung in Bildungseinrichtungen ist nach
 * Art. 5 verboten; Schulen sind "Betreiber" nach Art. 26).
 *
 * Wie die DSGVO (siehe dsgvoParser.ts) ist eur-lex.europa.eu per
 * AWS-WAF-Challenge gegen serverseitige Abrufe geschützt - der Rohtext
 * wird über einen echten Browser geholt und dem Import-Skript als Datei
 * übergeben (rawFile-Ziel in scripts/_import-backlog-sources.ts).
 *
 * Struktur wie DSGVO: Erwägungsgründe bis "HABEN FOLGENDE VERORDNUNG
 * ERLASSEN:" überspringen; danach KAPITEL/ABSCHNITT/Artikel; am Ende
 * "Geschehen zu ..." als Schlussmarke. Zusätzlich gegenüber der DSGVO:
 * die ANHÄNGE (insbesondere Anhang III "Hochrisiko-KI-Systeme") folgen
 * NACH der Schlussformel und werden als eigene Artikel-Knoten erfasst.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";

const OPERATIVE_START_RE = /^HABEN FOLGENDE VERORDNUNG ERLASSEN:?$/;
const SIGNATURE_RE = /^Geschehen zu\b/;
const CHAPTER_RE = /^KAPITEL\s+([IVXLCDM]+)$/;
const SECTION_RE = /^ABSCHNITT\s+(\d+)$/i;
const ARTICLE_RE = /^Artikel\s+(\d+)$/;
const ANNEX_RE = /^ANHANG\s+([IVXLCDM]+)$/;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;

function mkNode(node: Omit<LegalNode, "localId" | "children"> & { children?: LegalNode[] }): LegalNode {
  return { localId: "", children: node.children ?? [], ...node };
}

export const aiActParser: LegalImportParser = {
  id: "ai-act",
  label: "KI-VO",
  kind: "law",

  canParse(input: LegalImportInput): boolean {
    const raw = input.raw.slice(0, 8000);
    if (input.hint?.officialUrl?.includes("eur-lex.europa.eu") && /32024R1689/i.test(input.hint.officialUrl)) {
      return true;
    }
    return /VERORDNUNG\s*\(EU\)\s*2024\/1689/i.test(raw) || /Gesetz über künstliche Intelligenz/i.test(raw);
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const root: LegalNode = mkNode({
      kind: "document",
      heading: "Verordnung (EU) 2024/1689 (KI-Verordnung – AI Act)",
    });

    let inOperativeSection = false;
    let afterSignature = false;
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

      let m: RegExpExecArray | null;

      if (SIGNATURE_RE.test(line)) {
        // Anders als bei der DSGVO NICHT abbrechen: nach der Schlussformel
        // (und den Fußnoten) folgen die Anhänge. Bis zum nächsten
        // ANHANG-Marker wird nichts mehr gesammelt.
        afterSignature = true;
        currentChapter = currentSection = currentArticle = currentSubsection = null;
        awaitingHeading = false;
        continue;
      }

      if ((m = ANNEX_RE.exec(line))) {
        afterSignature = false;
        currentArticle = mkNode({ kind: "paragraph", number: `Anhang ${m[1]}`, heading: null });
        root.children.push(currentArticle);
        currentChapter = currentSection = currentSubsection = null;
        awaitingHeading = true;
        continue;
      }

      if (afterSignature) continue;

      if ((m = CHAPTER_RE.exec(line))) {
        currentChapter = mkNode({ kind: "section", number: `Kapitel ${m[1]}`, heading: null });
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
        currentArticle = mkNode({ kind: "paragraph", number: `Art ${m[1]}`, heading: null });
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
        key: "ai-act",
        kind: "law",
        title: "Verordnung (EU) 2024/1689 (KI-Verordnung – AI Act)",
        shortName: "KI-VO",
        jurisdiction: "EU",
        authority: "Europäisches Parlament und Rat der Europäischen Union",
        officialUrl: input.hint?.officialUrl ?? null,
        language: "de",
        metadata: { celex: "32024R1689" },
      },
      version: {
        label: "13.6.2024 (ABl. L, 2024/1689)",
        publishedAt: "2024-06-13",
        validFrom: "2024-08-01",
      },
      root,
      rawText: input.raw,
    };
  },
};
