// Simple synonym expansion for the search
const SYNONYM_GROUPS: string[][] = [
  ["handy", "smartphone", "iphone", "mobiltelefon", "telefon"],
  ["filmen", "video", "aufnahme", "aufnehmen", "mitschneiden", "aufzeichnung"],
  ["foto", "bild", "fotografieren", "aufnahme"],
  ["ki", "chatgpt", "künstliche intelligenz", "ai", "copilot", "gemini"],
  ["mobbing", "cybermobbing", "ausgrenzung", "schikane"],
  ["gewalt", "schlägerei", "prügelei", "körperverletzung"],
  ["prüfung", "klausur", "test", "arbeit", "leistungsüberprüfung"],
  ["täuschung", "abschreiben", "cheaten", "spicken", "betrug"],
  ["eltern", "erziehungsberechtigte", "sorgeberechtigte"],
  ["ausbildungsbetrieb", "betrieb", "arbeitgeber"],
  ["krank", "krankheit", "attest", "erkrankung"],
  ["fehlzeit", "fehlen", "unentschuldigt", "abwesenheit"],
  ["klassenfahrt", "exkursion", "wandertag", "studienfahrt"],
  ["pause", "hofpause", "pausenaufsicht"],
  ["schulleitung", "schulleiter", "direktion", "sl"],
  ["datenschutz", "dsgvo", "privatsphäre"],
  ["waffe", "messer", "pistole"],
  ["drohung", "bedrohung"],
  ["alkohol", "trinken", "betrunken"],
  ["drogen", "cannabis", "kiffen", "marihuana"],
  ["rechtsextrem", "nazi", "hakenkreuz", "symbole"],
  ["beleidigung", "beschimpfung", "beschimpfen"],
  ["kindeswohl", "gefährdung", "misshandlung"],
  ["schüler", "schueler", "schülerin", "schuelerin", "lernender", "lernende"],
  ["lehrkraft", "lehrer", "lehrerin", "pädagoge", "paedagoge"],
];

// Sehr häufige Füllwörter - für sich allein kein sinnvolles Suchkriterium
// und würden bei AND-Verknüpfung über mehrere Wörter jedes Ergebnis blockieren.
const STOPWORDS = new Set([
  "der", "die", "das", "und", "oder", "für", "von", "mit", "bei", "im", "in", "zu", "auf",
  "ist", "sind", "des", "dem", "den", "ein", "eine", "einer", "eines", "nach", "über", "als",
  "an", "am", "um", "ohne", "durch", "wird", "werden", "kann", "können", "soll", "sollen",
  "muss", "müssen", "nicht", "auch", "sich", "sie", "es", "vom", "zur", "zum",
]);

/** Gemeinsame Wortstamm-Länge, ab der eine Konjugation/Deklination noch als
 * dieselbe Synonymgruppe gilt (z.B. "filmt" -> "filmen"). */
const STEM_PREFIX_LEN = 4;

function sharesStem(a: string, b: string): boolean {
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const len = Math.min(STEM_PREFIX_LEN, a.length, b.length);
  if (len < STEM_PREFIX_LEN) return false;
  return a.slice(0, len) === b.slice(0, len);
}

/** Erwartet EIN einzelnes Wort/Token (nicht eine ganze Suchphrase) - so
 * verwenden es auch alle anderen Aufrufer (intelligentSearch.ts,
 * searchDiagnostics.ts, searchDocument.ts tokenisieren jeweils zuerst). */
export function expandSearch(q: string): string[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const terms = new Set<string>([needle]);
  for (const group of SYNONYM_GROUPS) {
    if (group.some((w) => sharesStem(needle, w))) {
      for (const w of group) terms.add(w);
    }
  }
  return Array.from(terms);
}

function tokenize(q: string): string[] {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Fund 2026-08-18 (Nutzerrückmeldung): matches() rief expandSearch() bisher
 * auf der KOMPLETTEN, unzerlegten Suchphrase auf. Sobald darin ein Wort wie
 * "Schüler" oder "Lehrer" vorkam (in praktisch jedem Praxisfall vorhanden),
 * wurde dessen ganze Synonymgruppe als zusätzliche Treffer-Bedingung
 * hinzugefügt - bei der bestehenden ODER-Verknüpfung über ALLE Begriffe
 * matchte dadurch fast jeder Fall, unabhängig vom Rest der Suchanfrage.
 * Jetzt: pro Wort einzeln synonymerweitern (ODER innerhalb eines Wortes),
 * aber ALLE Wörter der Anfrage müssen einen Treffer haben (UND zwischen
 * den Wörtern) - Mehrwort-Suchen grenzen jetzt tatsächlich ein.
 */
export function matches(haystack: string, q: string): boolean {
  const hay = haystack.toLowerCase();
  const tokens = tokenize(q);
  if (tokens.length === 0) return true;
  return tokens.every((tok) => expandSearch(tok).some((t) => hay.includes(t)));
}
