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

/** Jede erkennbare Textform (Abkürzung oder ausgeschriebener Alias) -> kanonische Abkürzung. */
const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const abbrev of LAW_ABBREVIATIONS) ALIAS_TO_CANONICAL.set(abbrev, abbrev);
for (const [canonical, aliases] of Object.entries(SPELLED_OUT_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_CANONICAL.set(alias, canonical);
}
const NAME_PATTERN = [...ALIAS_TO_CANONICAL.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

/** "Abs. 4" oder ausgeschrieben "Absatz 1 u. 2" - wird beim Matchen übersprungen, nicht extrahiert. */
const ABS_SKIP = `(?:Abs(?:\\.|atz)?\\s*\\d+[a-z]?(?:\\s*(?:u\\.|und|,)\\s*\\d+[a-z]?)*\\s*)?`;
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

const PARAGRAPH_RE = new RegExp(
  `§§?\\s*(\\d+[a-z]?)${EXTRA_NUMBERS_SKIP}\\s*${ABS_SKIP}(?:des\\s+|der\\s+)?(${NAME_PATTERN})`,
  "g",
);
const ARTICLE_RE = new RegExp(`Art(?:ikel|\\.)?\\s*(\\d+[a-z]?)\\s*(?:des\\s+|der\\s+)?(${NAME_PATTERN})`, "g");
/** Umgekehrte Reihenfolge, z.B. "DSGVO (Artikel 8 ...)" oder "im Grundgesetz (Artikel 2 Abs. 1 ...)". */
const ARTICLE_REVERSED_RE = new RegExp(
  `(${NAME_PATTERN})${NAME_SYMBOL_GAP}Art(?:ikel|\\.)?\\s*(\\d+[a-z]?)`,
  "g",
);
/**
 * Fund 2026-08-18 (Audit über alle veröffentlichten Fälle): mindestens
 * ebenso häufig wie "§ N LawName" steht im Fließtext die umgekehrte
 * Reihenfolge "LawName (§ N)" bzw. "LawName § N" (z.B. "Schulgesetz NRW
 * (§ 43)"). Ohne dieses Muster blieb die Extraktion für ~6% der Fälle mit
 * eindeutig vorhandenem §-Bezug leer.
 */
const PARAGRAPH_REVERSED_RE = new RegExp(
  `(${NAME_PATTERN})${NAME_SYMBOL_GAP}${CONNECTOR_SKIP}§§?\\s*(\\d+[a-z]?)`,
  "g",
);

export function extractLegalCitations(text: string | null | undefined): ExtractedCitation[] {
  if (!text) return [];
  const results: ExtractedCitation[] = [];
  const seen = new Set<string>();

  const push = (raw: string, paragraph: string, aliasOrAbbrev: string, kind: "paragraph" | "article") => {
    const canonical = ALIAS_TO_CANONICAL.get(aliasOrAbbrev);
    if (!canonical) return;
    const key = `${kind[0]}:${paragraph}:${canonical}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ raw: raw.trim(), paragraph, lawAbbrev: canonical, kind });
  };

  for (const m of text.matchAll(PARAGRAPH_RE)) push(m[0], m[1], m[2], "paragraph");
  for (const m of text.matchAll(PARAGRAPH_REVERSED_RE)) push(m[0], m[2], m[1], "paragraph");
  for (const m of text.matchAll(ARTICLE_RE)) push(m[0], m[1], m[2], "article");
  for (const m of text.matchAll(ARTICLE_REVERSED_RE)) push(m[0], m[2], m[1], "article");

  return results;
}
