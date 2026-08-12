/**
 * Sprint 4.6E – Deterministische Normalisierung und Hashing.
 * Keine Sprachmodelle, keine Semantik: reine Zeichen- und Tokenarbeit.
 */

const UMLAUTS: Array<[RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

/** Deutsche Füllwörter, die für das Matching keinen Beitrag leisten. */
export const STOP_WORDS = new Set([
  "der","die","das","den","dem","des","ein","eine","einen","einem","einer","eines",
  "und","oder","aber","auch","als","am","an","auf","aus","bei","bis","durch","fuer",
  "gegen","hat","haben","hatte","ich","im","in","ist","kann","mit","nach","nicht",
  "noch","nur","ohne","sich","sie","sind","so","ueber","um","von","vor","war","werden",
  "wie","wird","zu","zum","zur","dass","es","er","wir","man","eines","beim","dabei",
  "sowie","wenn","dann","doch","schon","sehr","mehr","alle","allen","diese","dieser",
  "dieses","dem","ihre","ihren","seine","seinen","einem","etwa","wurde","wurden",
]);

/** Kleinschreibung, Umlaut-Transliteration, Entfernen von Sonderzeichen. */
export function normalizeText(input: string): string {
  let out = (input ?? "").toLowerCase();
  for (const [pattern, replacement] of UMLAUTS) out = out.replace(pattern, replacement);
  return out.replace(/[^a-z0-9§\s-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Einzelbegriff normalisieren (für Kategorien, Schlagwörter, Rollen). */
export function normalizeTerm(input: string): string {
  return normalizeText(input).replace(/\s+/g, " ").trim();
}

/**
 * Tokenisierung mit Stoppwortfilter und Mindestlänge.
 * Zusätzlich wird eine einfache, regelbasierte Endungsnormalisierung angewendet
 * (keine Lemmatisierung, nur deterministische Suffixkürzung).
 */
export function tokenize(input: string): string[] {
  const raw = normalizeText(input).split(/[\s-]+/);
  const out: string[] = [];
  for (const token of raw) {
    if (token.length < 4 && !token.startsWith("§")) continue;
    if (STOP_WORDS.has(token)) continue;
    const stem = stemTerm(token);
    if (stem.length >= 4 || stem.startsWith("§")) out.push(stem);
  }
  return unique(out);
}

/** Deterministische Suffixkürzung für deutsche Wortformen. */
export function stemTerm(token: string): string {
  if (token.length <= 5) return token;
  for (const suffix of ["ungen", "innen", "enden", "erung", "ende", "ungs", "ung", "isch", "lich", "keit", "heit", "ern", "en", "er", "es", "em", "s"]) {
    if (token.length - suffix.length >= 4 && token.endsWith(suffix)) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Sortierte, stabile JSON-Darstellung (identisch zur Assessment-Engine). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** djb2-Hash, konsistent mit der projektweiten Delta-Berechnung. */
export function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function hashOf(value: unknown): string {
  return djb2(stableStringify(value));
}

/** Jaccard-ähnlicher Deckungsgrad: Anteil der Profilmerkmale, die belegt sind. */
export function coverageRatio(expected: string[], present: string[]): number {
  if (expected.length === 0) return 0;
  const set = new Set(present);
  const hits = expected.filter((item) => set.has(item)).length;
  return hits / expected.length;
}
