/**
 * Deterministischer Query-Normalizer.
 * Aufgaben:
 *  - Groß-/Kleinschreibung, Whitespace, Sonderzeichen
 *  - Abkürzungen (LRS → Lese-Rechtschreib-Schwäche, DSGVO → Datenschutz-Grundverordnung)
 *  - Synonyme (Elternhaus → Erziehungsberechtigte …)
 *  - einfache Plural-/Kompositum-Regeln
 * Keine KI.
 */

const ABBREVIATIONS: Record<string, string> = {
  lrs: "Lese-Rechtschreib-Schwäche",
  dsgvo: "Datenschutz-Grundverordnung",
  ao: "Ausbildungs- und Prüfungsordnung",
  bass: "Bereinigte Amtliche Sammlung der Schulvorschriften",
  schulg: "Schulgesetz",
  vera: "Vergleichsarbeit",
  aoso: "Ausbildungsordnung sonderpädagogische Förderung",
  bng: "Bildungs- und Erziehungsauftrag",
  vwv: "Verwaltungsvorschrift",
  gsvo: "Grundschulverordnung",
  soforder: "sonderpädagogische Förderung",
  soforderb: "sonderpädagogischer Förderbedarf",
  soap: "sonderpädagogische Ausbildung",
  s1: "Sekundarstufe I",
  s2: "Sekundarstufe II",
  bg: "Berufsschule",
  ovg: "Oberverwaltungsgericht",
  vg: "Verwaltungsgericht",
  gg: "Grundgesetz",
  sgb: "Sozialgesetzbuch",
};

const SYNONYMS: Record<string, string[]> = {
  elternhaus: ["Erziehungsberechtigte", "Eltern"],
  schueler: ["Schülerin", "Schüler"],
  lehrer: ["Lehrkraft", "Lehrerin", "Lehrer"],
  klassenfahrt: ["Schulfahrt", "Schulwanderung"],
  mobbing: ["Bullying", "Ausgrenzung"],
  nachteilsausgleich: ["Nachteilsausgleich", "Ausgleich"],
  attest: ["ärztliches Attest", "Bescheinigung"],
  krankmeldung: ["Entschuldigung", "Fehlmeldung"],
  hausaufgabe: ["Hausaufgaben"],
  zeugnis: ["Halbjahreszeugnis", "Endzeugnis"],
};

const PLURAL_SUFFIXES = [
  ["innen", ""],
  ["nen", ""],
  ["en", ""],
  ["er", ""],
  ["es", ""],
  ["s", ""],
] as const;

const STOP_WORDS = new Set([
  "der", "die", "das", "und", "oder", "aber", "ein", "eine", "einen", "einer",
  "im", "in", "an", "auf", "zu", "von", "vom", "mit", "bei", "für", "auch",
  "ist", "sind", "wird", "werden", "kann", "muss", "sollen", "wenn", "dann",
  "wie", "was", "wer", "wo", "durch", "über", "unter", "nach", "zwischen",
]);

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeToken(t: string): string {
  return stripDiacritics(t.toLowerCase())
    .replace(/[^a-z0-9äöüß\-]/gi, "")
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c] ?? c));
}

function baseForm(word: string): string {
  const key = normalizeToken(word);
  for (const [suf, rep] of PLURAL_SUFFIXES) {
    if (key.endsWith(suf) && key.length > suf.length + 3) {
      return key.slice(0, -suf.length) + rep;
    }
  }
  return key;
}

export interface NormalizedQuery {
  original: string;
  normalized: string;
  tokens: string[];
  keywords: string[];
  expansions: string[];
}

export const QueryNormalizer = {
  normalize(input: string): NormalizedQuery {
    const original = (input ?? "").toString();
    const cleaned = original
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    const rawTokens = cleaned
      .split(/[\s,;:!?()"'\[\]{}\/\\]+/)
      .filter((t) => t.length > 0);

    const keywords: string[] = [];
    const expansions: string[] = [];
    const seen = new Set<string>();

    for (const raw of rawTokens) {
      const lower = raw.toLowerCase();
      const abbrev = ABBREVIATIONS[lower] ?? ABBREVIATIONS[normalizeToken(raw)];
      if (abbrev) {
        for (const w of abbrev.split(/\s+/)) pushKeyword(w);
        expansions.push(`${raw} → ${abbrev}`);
        continue;
      }
      pushKeyword(raw);
      const base = baseForm(raw);
      const syns = SYNONYMS[base] ?? SYNONYMS[normalizeToken(raw)];
      if (syns) {
        for (const s of syns) pushKeyword(s);
        expansions.push(`${raw} ~ ${syns.join(", ")}`);
      }
    }

    function pushKeyword(w: string) {
      const cleanWord = w.trim();
      if (!cleanWord) return;
      const key = normalizeToken(cleanWord);
      if (!key || key.length < 2) return;
      if (STOP_WORDS.has(key)) return;
      if (seen.has(key)) return;
      seen.add(key);
      keywords.push(cleanWord);
    }

    const normalized = [cleaned, ...keywords].join(" ").trim();
    return {
      original,
      normalized,
      tokens: rawTokens,
      keywords,
      expansions,
    };
  },
};
