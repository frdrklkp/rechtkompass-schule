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

export function expandSearch(q: string): string[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const terms = new Set<string>([needle]);
  for (const group of SYNONYM_GROUPS) {
    if (group.some((w) => needle.includes(w))) {
      for (const w of group) terms.add(w);
    }
  }
  return Array.from(terms);
}

export function matches(haystack: string, q: string): boolean {
  const hay = haystack.toLowerCase();
  const terms = expandSearch(q);
  if (terms.length === 0) return true;
  return terms.some((t) => hay.includes(t));
}
