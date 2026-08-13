/**
 * Grundgesetz für die Bundesrepublik Deutschland (gesetze-im-internet.de,
 * amtliche Gesamtausgabe des Bundesministeriums der Justiz - eine einzelne
 * HTML-Seite mit allen Artikeln, kein mehrseitiger Crawl nötig).
 *
 * Deutlich sauberere Struktur als die NRW-Quellen: jeder Artikel/Abschnitt
 * ist durch einen eindeutigen, mit dem Namen des Abschnitts verketteten
 * Sprungmarken-Text "Nichtamtliches Inhaltsverzeichnis<Name>" markiert
 * (z.B. "Nichtamtliches InhaltsverzeichnisArt 1", ohne Leerzeichen zwischen
 * "Inhaltsverzeichnis" und "Art"). Keine Paragraphen-Werkzeugleiste, keine
 * doppelte Inhaltsübersicht - jeder Artikel kommt nur einmal vor.
 */
import type { LegalImportInput, LegalImportParser, LegalNode, NormalizedLegalDocument } from "../types";

/** Sprungmarken-Präfix, das jedem Abschnitt/Artikel auf der Seite vorangestellt wird. */
const SECTION_START_RE = /^Nichtamtliches\s+Inhaltsverzeichnis(.*)$/;
const ARTICLE_RE = /^Art\s*(\d+[a-z]?)\s*(.*)$/;
/** Römisch nummerierte Hauptabschnitte, z.B. "I.", "IV a.", "VIIIa.". */
const CHAPTER_RE = /^([IVXLCDM]+)\s*([a-z])?\.$/;
const SUBSECTION_RE = /^\((\d+[a-z]?)\)\s*(.*)$/;
const AUSFERTIGUNG_RE = /^Ausfertigungsdatum:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const STAND_DATE_RE = /Zuletzt\s+ge[aä]ndert.*?(\d{1,2})\.(\d{1,2})\.(\d{4})/;

function mkNode(node: Omit<LegalNode, "localId" | "children"> & { children?: LegalNode[] }): LegalNode {
  return { localId: "", children: node.children ?? [], ...node };
}

export const grundgesetzParser: LegalImportParser = {
  id: "grundgesetz",
  label: "Grundgesetz",
  kind: "law",

  canParse(input: LegalImportInput): boolean {
    const raw = input.raw.slice(0, 4000);
    if (input.hint?.officialUrl?.includes("gesetze-im-internet.de/gg")) return true;
    // Der generische Inhalts-Fallback trifft auch auf BASS-Runderlasse, die
    // "das Grundgesetz für die Bundesrepublik Deutschland" nur als Zitat in
    // einem Satz erwähnen, nicht als eigenen Dokumenttitel (Fund beim
    // BASS-Vollimport, 2026-08-13, Bsp. "15-02 Nr. 9.6"). Domain daher
    // explizit ausschließen; das eigentliche GG kommt nur von
    // gesetze-im-internet.de (siehe Fall oben).
    if (input.hint?.officialUrl?.includes("bass.schule.nrw") || input.hint?.officialUrl?.includes("bass.schul-welt.de")) {
      return false;
    }
    return /Grundgesetz\s+für\s+die\s+Bundesrepublik\s+Deutschland/i.test(raw);
  },

  parse(input: LegalImportInput): NormalizedLegalDocument {
    const lines = input.raw.split(/\r?\n/);
    const root: LegalNode = mkNode({
      kind: "document",
      heading: input.hint?.detectedTitle ?? "Grundgesetz für die Bundesrepublik Deutschland",
    });

    let currentChapter: LegalNode | null = null;
    let currentArticle: LegalNode | null = null;
    let currentSubsection: LegalNode | null = null;
    let awaitingChapterHeading = false;
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
        const am = ARTICLE_RE.exec(rest);
        if (am) {
          currentArticle = mkNode({ kind: "article", number: `Art ${am[1]}`, heading: am[2]?.trim() || null });
          (currentChapter ?? root).children.push(currentArticle);
          currentSubsection = null;
          continue;
        }
        if (rest === "Eingangsformel" || rest === "Präambel") {
          currentArticle = mkNode({ kind: "article", number: rest, heading: null });
          root.children.push(currentArticle);
          currentSubsection = null;
          continue;
        }
        // Sonstige Sprungmarken (z.B. reiner Dokumenttitel-Anker "GG") - keine Rechtsnorm.
        continue;
      }

      if ((m = CHAPTER_RE.exec(line))) {
        currentChapter = mkNode({ kind: "chapter", number: `${m[1]}${m[2] ?? ""}.`, heading: null });
        root.children.push(currentChapter);
        currentArticle = currentSubsection = null;
        awaitingChapterHeading = true;
        continue;
      }
      if (awaitingChapterHeading && currentChapter) {
        currentChapter.heading = line;
        awaitingChapterHeading = false;
        continue;
      }

      if ((m = SUBSECTION_RE.exec(line)) && currentArticle) {
        currentSubsection = mkNode({ kind: "subsection", number: `(${m[1]})`, text: m[2]?.trim() || null });
        currentArticle.children.push(currentSubsection);
        continue;
      }

      const target = currentSubsection ?? currentArticle;
      if (target) {
        target.text = [(target.text ?? ""), line].join(" ").trim();
      }
    }

    return {
      source: {
        key: "grundgesetz",
        kind: "law",
        title: input.hint?.detectedTitle ?? "Grundgesetz für die Bundesrepublik Deutschland",
        shortName: "GG",
        jurisdiction: "Bund",
        authority: "Bundesrepublik Deutschland",
        officialUrl: input.hint?.officialUrl ?? null,
        language: "de",
        metadata: { amendedAt },
      },
      version: {
        // Reihenfolge bewusst umgekehrt zu anderen Parsern: der generische
        // Crawler-Versionshinweis greift auf dieser Seite unzuverlässig -
        // er fand einmal "11. August 1919" (Weimarer Reichsverfassung, im
        // Fließtext von Art. 140 zitiert) und hielt das für die Fassung des
        // Grundgesetzes selbst. Das aus der "Stand:"-Zeile geparste
        // amendedAt ist hier die verlässlichere Quelle.
        label: amendedAt ? `Fassung ${amendedAt}` : (input.hint?.detectedVersion ?? "Unbekannte Fassung"),
        publishedAt,
        validFrom: amendedAt,
      },
      root,
      rawText: input.raw,
    };
  },
};
