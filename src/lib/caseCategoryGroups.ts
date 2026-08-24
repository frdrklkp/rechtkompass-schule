/**
 * Sprint 4.6L – Themen-Kacheln der Startseite (QUICK_TOPICS) und die
 * Klärfragen-Themenliste (intelligentSearch.ts) verwenden eine grobe,
 * sechs-/siebenteilige Bucket-Einteilung ("Unterricht & Verhalten",
 * "Eltern & Kommunikation" usw.), die tatsächliche practice_cases.category-
 * Werte sind aber feingranularer (z. B. "Mobbing", "Ordnungsmaßnahmen",
 * "Elternkommunikation") und stimmen nur teilweise mit den Bucket-Labels
 * überein.
 *
 * Fund 2026-08-15: /faelle filterte bislang per exakter String-Gleichheit
 * (c.category !== cat), wodurch drei der sechs Startseiten-Kacheln
 * ("Unterricht", "Eltern und Kommunikation", "Dienstrecht") trotz
 * vorhandener passender Fälle konstant null Treffer zeigten - "Eltern und
 * Kommunikation" traf z. B. nie auf die real genutzte Kategorie
 * "Elternkommunikation".
 *
 * Diese Datei bildet jeden Bucket-Schlüssel auf die tatsächlich verwendeten
 * category-Werte ab. /faelle.tsx nutzt diese Zuordnung beim Filtern; bei
 * einem Schlüssel ohne Eintrag hier bleibt das bisherige exakte Matching
 * (z. B. für die von /faelle selbst erzeugten Kategorie-Chips, die echte
 * category-Werte statt Bucket-Schlüsseln übergeben).
 */
export const CASE_CATEGORY_GROUPS: Record<string, string[]> = {
  Unterricht: ["KI im Unterricht", "Mobbing", "Ordnungsmaßnahmen", "Gewalt"],
  Prüfungen: ["Prüfungen", "Leistungsbewertung"],
  Aufsicht: ["Aufsicht", "Klassenfahrten"],
  Datenschutz: ["Datenschutz"],
  "Eltern und Kommunikation": ["Elternkommunikation"],
  Dienstrecht: ["Dienstrecht"],
  "Fehlzeiten und Schulpflicht": ["Fehlzeiten"],
};

/** Liefert die category-Werte, gegen die ein Bucket-Schlüssel matchen soll. */
export function resolveCategoryGroup(catOrGroup: string): string[] {
  return CASE_CATEGORY_GROUPS[catOrGroup] ?? [catOrGroup];
}
