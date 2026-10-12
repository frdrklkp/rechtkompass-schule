/**
 * Extrahiert § / Art.-Zitate aus einem Fließtext (z.B. legal_explanation
 * eines Praxisfalls), damit sie als Karten mit dem tatsächlichen
 * Rechtsquellen-Bestand verknüpft werden können.
 *
 * Fund 2026-08-18 (Nutzerrückmeldung): die im Fließtext genannten Paragrafen
 * und die separat kuratierten "Rechtsgrundlagen"-Karten eines Falls werden
 * unabhängig voneinander erzeugt und können auseinanderlaufen - der Text
 * zitiert z.B. § 37/§ 53 SchulG NRW, während die Karten ein völlig anderes
 * § 1 zeigen. Diese Extraktion liest direkt aus dem bereits geschriebenen,
 * redaktionell geprüften Text statt aus einem separaten Matching-Schritt.
 *
 * Bewusst eine kuratierte Abkürzungs-Whitelist statt freier Erkennung:
 * das Feld `short_name` in legal_sources ist für Runderlasse/Verwaltungs-
 * vorschriften unzuverlässig (viele fachlich unterschiedliche BASS-Dokumente
 * tragen denselben Platzhalter-Wert "SchulG NRW" oder "VV") - freies Raten
 * würde Falsch-Zuordnungen erzeugen. Nur echte, im Registry kuratiert
 * importierte Gesetze werden erkannt.
 */

export interface ExtractedCitation {
  /** Wie im Text gefunden, z.B. "§ 37 SchulG NRW". */
  raw: string;
  /** Paragraf-/Artikelnummer, z.B. "37", "8a". */
  paragraph: string;
  /** Erkannte Gesetzesabkürzung, z.B. "SchulG NRW". */
  lawAbbrev: string;
  kind: "paragraph" | "article";
}

/** Längste zuerst, damit z.B. "SchulG NRW" vor dem kürzeren Präfix "SchulG" matcht. */
const LAW_ABBREVIATIONS = [
  "SchulG NRW",
  "VwVfG NRW",
  "DSG NRW",
  "SGB VIII",
  "SGB IX",
  "SGB X",
  "SGB I",
  "APO-BK",
  "KunstUrhG",
  "SchulG",
  "VwVfG",
  "StGB",
  "BGB",
  "BBiG",
  "HwO",
  "LPVG NRW",
  "LPVG",
  "BGG",
  "DSGVO",
  "GG",
  "BASS",
];

/**
 * Fund 2026-08-18 (Nutzerrückmeldung): Fließtext zitiert Gesetze nicht immer
 * über ihre Abkürzung ("§ 37 SchulG NRW"), sondern oft ausgeschrieben
 * ("§ 4 Abs. 4 des Schulgesetzes NRW", "im Grundgesetz (Artikel 2 Abs. 1)")
 * - ohne diese Aliase blieb die Extraktion leer und die Seite fiel auf die
 * alte, vom Text unabhängige Kartenliste zurück (der ursprünglich gemeldete
 * Bug). Jeder Alias bildet auf dieselbe kanonische Abkürzung ab, die
 * legalCitationResolver.ts zur Quellen-Auflösung nutzt.
 */
const SPELLED_OUT_ALIASES: Record<string, string[]> = {
  "SchulG NRW": [
    "Schulgesetzes für das Land Nordrhein-Westfalen",
    "Schulgesetz für das Land Nordrhein-Westfalen",
    "Schulgesetzes NRW",
    "Schulgesetz NRW",
  ],
  SchulG: ["Schulgesetzes", "Schulgesetz"],
  "VwVfG NRW": [
    "Verwaltungsverfahrensgesetzes für das Land Nordrhein-Westfalen",
    "Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen",
    "Verwaltungsverfahrensgesetzes NRW",
    "Verwaltungsverfahrensgesetz NRW",
  ],
  VwVfG: ["Verwaltungsverfahrensgesetzes", "Verwaltungsverfahrensgesetz"],
  GG: ["Grundgesetzes", "Grundgesetz"],
  DSGVO: ["Datenschutz-Grundverordnung", "Datenschutzgrundverordnung"],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "Abs. 4" oder ausgeschrieben "Absatz 1 u. 2" - wird beim Matchen übersprungen, nicht extrahiert.
 * Fund 12.10.2026: auch Satz-/Nummer-/Buchstaben-Angaben ("§ 10 Abs. 1 Nr. 1
 * JArbSchG", "§ 53 Abs. 3 Satz 2 SchulG NRW") - sonst blieb genau diese, in
 * Fällen häufige präzise Zitierweise unerkannt.
 */
const ABS_SKIP = `(?:(?:Abs(?:\\.|atz)?|Satz|S\\.|Nr\\.?|Nummer|Buchst(?:\\.|abe)?|lit\\.)\\s*\\d*[a-z]?(?:\\s*(?:u\\.|und|,|bis)\\s*\\d+[a-z]?)*\\s*)*`;
/** "§§ 9, 76 SchulG NRW" - weitere kommagetrennte Nummern vor dem Gesetzesnamen überspringen (nur die erste wird extrahiert). */
const EXTRA_NUMBERS_SKIP = `(?:\\s*,\\s*\\d+[a-z]?)*`;
/** Klammern/Leerraum zwischen Name und §/Artikel, z.B. "LPVG) § 67" oder "DSGVO (Artikel 8". */
const NAME_SYMBOL_GAP = `[\\s()]*`;
/**
 * Fund 2026-08-19: "Schulgesetz NRW regelt § 48 ..." bzw. "... sieht in
 * § 11 ... vor" - ein kurzes Verb (+ optionale Präposition) steht zwischen
 * Gesetzesname und §, ohne Klammern/reines Leerzeichen. Nur eine
 * kuratierte, kurze Verbliste erlaubt (kein freier Text), damit nicht
 * versehentlich über einen ganzen unabhängigen Satz hinweg gematcht wird.
 */
const CONNECTOR_SKIP = `(?:\\s*(?:regelt|regeln|bestimmt|bestimmen|normiert|sieht|schreibt|verlangt|fordert|vor|in)\\b){0,3}\\s*`;

type Extractor = (text: string | null | undefined) => ExtractedCitation[];

function buildExtractor(abbreviations: string[], spelledOut: Record<string, string[]>): Extractor {
  /** Jede erkennbare Textform (Abkürzung oder ausgeschriebener Alias) -> kanonische Abkürzung. */
  const aliasToCanonical = new Map<string, string>();
  for (const abbrev of abbreviations) aliasToCanonical.set(abbrev, abbrev);
  for (const [canonical, aliases] of Object.entries(spelledOut)) {
    for (const alias of aliases) aliasToCanonical.set(alias, canonical);
  }
  const namePattern = [...aliasToCanonical.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");

  const paragraphRe = new RegExp(
    `§§?\\s*(\\d+[a-z]?)${EXTRA_NUMBERS_SKIP}\\s*${ABS_SKIP}(?:des\\s+|der\\s+)?(${namePattern})`,
    "g",
  );
  const articleRe = new RegExp(`Art(?:ikel|\\.)?\\s*(\\d+[a-z]?)\\s*${ABS_SKIP}(?:des\\s+|der\\s+)?(${namePattern})`, "g");
  /** Umgekehrte Reihenfolge, z.B. "DSGVO (Artikel 8 ...)" oder "im Grundgesetz (Artikel 2 Abs. 1 ...)". */
  const articleReversedRe = new RegExp(`(${namePattern})${NAME_SYMBOL_GAP}Art(?:ikel|\\.)?\\s*(\\d+[a-z]?)`, "g");
  /**
   * Fund 2026-08-18 (Audit über alle veröffentlichten Fälle): mindestens
   * ebenso häufig wie "§ N LawName" steht im Fließtext die umgekehrte
   * Reihenfolge "LawName (§ N)" bzw. "LawName § N" (z.B. "Schulgesetz NRW
   * (§ 43)"). Ohne dieses Muster blieb die Extraktion für ~6% der Fälle mit
   * eindeutig vorhandenem §-Bezug leer.
   */
  const paragraphReversedRe = new RegExp(`(${namePattern})${NAME_SYMBOL_GAP}${CONNECTOR_SKIP}§§?\\s*(\\d+[a-z]?)`, "g");

  return (text) => {
    if (!text) return [];
    const results: ExtractedCitation[] = [];
    const seen = new Set<string>();

    const push = (raw: string, paragraph: string, aliasOrAbbrev: string, kind: "paragraph" | "article") => {
      const canonical = aliasToCanonical.get(aliasOrAbbrev);
      if (!canonical) return;
      const key = `${kind[0]}:${paragraph}:${canonical}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ raw: raw.trim(), paragraph, lawAbbrev: canonical, kind });
    };

    for (const m of text.matchAll(paragraphRe)) push(m[0], m[1], m[2], "paragraph");
    for (const m of text.matchAll(paragraphReversedRe)) push(m[0], m[2], m[1], "paragraph");
    for (const m of text.matchAll(articleRe)) push(m[0], m[1], m[2], "article");
    for (const m of text.matchAll(articleReversedRe)) push(m[0], m[2], m[1], "article");

    return results;
  };
}

export const extractLegalCitations: Extractor = buildExtractor(LAW_ABBREVIATIONS, SPELLED_OUT_ALIASES);

/**
 * Fund 12.10.2026: Das Anlege-Skript hat zweimal Normen zitiert, die im
 * Bestand liegen, aber nicht verknüpft wurden (§ 241 StGB, § 10 JArbSchG) -
 * die Claim-Validierung kannte deren Wortlaut nicht und stufte den Fall rot.
 * Für den Abgleich "zitiert vs. verknüpft" (caseCitationCoverage.ts) daher
 * zusätzlich alle weiteren kuratiert importierten Gesetze erkennen.
 *
 * Bewusst eine eigene Funktion: die Fallseite (faelle.$id.tsx) löst Zitate
 * über legalCitationResolver.ts nur für die dort kuratierten Titel auf -
 * die erweiterte Liste dort einzuspeisen, würde vorhandene Normen
 * fälschlich als "nicht im Bestand" anzeigen.
 */
const COVERAGE_EXTRA_ABBREVIATIONS = [
  "JArbSchG",
  "SGB VII",
  "KKG",
  "BeamtStG",
  "LBG NRW",
  "LDG NRW",
  "BGG NRW",
  "AGG",
  "UrhG",
  "JuSchG",
  "BZRG",
  "APO-GOSt",
  "KI-VO",
  "VersMedV",
];

const COVERAGE_EXTRA_ALIASES: Record<string, string[]> = {
  JArbSchG: ["Jugendarbeitsschutzgesetzes", "Jugendarbeitsschutzgesetz"],
  BBiG: ["Berufsbildungsgesetzes", "Berufsbildungsgesetz"],
  StGB: ["Strafgesetzbuches", "Strafgesetzbuchs", "Strafgesetzbuch"],
  BGB: ["Bürgerlichen Gesetzbuches", "Bürgerlichen Gesetzbuchs", "Bürgerliches Gesetzbuch"],
  BeamtStG: ["Beamtenstatusgesetzes", "Beamtenstatusgesetz"],
  "LBG NRW": ["Landesbeamtengesetzes NRW", "Landesbeamtengesetz NRW", "Landesbeamtengesetzes", "Landesbeamtengesetz", "LBG"],
  AGG: ["Allgemeinen Gleichbehandlungsgesetzes", "Allgemeinen Gleichbehandlungsgesetz", "Allgemeines Gleichbehandlungsgesetz"],
  JuSchG: ["Jugendschutzgesetzes", "Jugendschutzgesetz"],
  UrhG: ["Urheberrechtsgesetzes", "Urheberrechtsgesetz"],
  "KI-VO": ["KI-Verordnung"],
};

export const extractLegalCitationsForCoverage: Extractor = buildExtractor(
  [...LAW_ABBREVIATIONS, ...COVERAGE_EXTRA_ABBREVIATIONS],
  { ...SPELLED_OUT_ALIASES, ...COVERAGE_EXTRA_ALIASES },
);
