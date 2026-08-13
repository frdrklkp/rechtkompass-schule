/**
 * Sprint 4.5G (Nachtrag, 2026-08-13) – Gemeinsame Kopf-/Datums-Erkennung für
 * alle bass.schule.nrw-Parser (BASS, APO-BK, VV-Schulrecht).
 *
 * Die Seite liefert für jedes Dokument:
 *   - denselben Cookie-Banner + Teilen-Werkzeugleiste vor dem Inhalt (generisch,
 *     keine Rechtstext-Inhalte),
 *   - einen HTML-<title> der auf jeder Seite schlicht "BASS" lautet (also nie
 *     als Dokumenttitel taugt),
 *   - ein BASS-Aktenzeichen ("13-33 Nr. 1.1" oder auch nur "1-8") gefolgt vom
 *     mehrzeiligen echten Titel bis zur "Vom ..."-Zeile,
 *   - Datumsangaben in ausgeschriebener Form ("26. Mai 1999", nicht "26.05.1999").
 */

export const BASS_CHROME_NOISE = new Set([
  "Datenschutzeinstellungen",
  "Diese Seite verwendet Cookies, um die Benutzerfreundlichkeit der Webseite zu verbessern.",
  "Welche Cookies wir setzen, erfahren Sie in unserer Datenschutzerklärung.",
  "Durch Klicken auf die untenstehenden Schaltflächen können Sie entscheiden, welche Cookies Sie neben den zwingend notwendigen Cookies zulassen.",
  "zwingend notwendig",
  "Technische Cookies, die für die Nutzung der Seite zwingend vorhanden sein müssen. Weitere Cookies, außer den technisch notwendigen, verwenden wir nicht.",
  "Ausgewählte Cookies akzeptieren",
  "Alle Cookies akzeptieren",
  "Drucken",
  "als PDF speichern",
  "als Word speichern",
  "als E-Mail verschicken",
  "auf Facebook teilen",
  "auf LinkedIn teilen",
  "auf WhatsApp teilen",
  "auf X (vormals Twitter) teilen",
]);

/** BASS-Aktenzeichen, z.B. "13-33 Nr. 1.1" oder nur "1-8" - markiert den Beginn des echten Titelblocks. */
export const CITATION_MARKER_RE = /^\d{1,2}-\d{1,2}(?:\s+Nr\.\s*[\d.]+)?$/;

const GERMAN_MONTHS: Record<string, string> = {
  januar: "01", februar: "02", märz: "03", maerz: "03", april: "04", mai: "05", juni: "06",
  juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
};

const DATE_FRAGMENT = String.raw`\d{1,2}\.\s*(?:\d{1,2}\.\d{4}|[A-Za-zÄÖÜäöüß]+\s+\d{4})`;

export const VOM_LINE_RE = new RegExp(`^Vom\\s+(${DATE_FRAGMENT})`, "i");

/** Parst sowohl "26.5.1999" als auch "26. Mai 1999" zu ISO YYYY-MM-DD. */
export function parseGermanDate(text: string): string | null {
  const numeric = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (numeric) {
    const [, dd, mm, yy] = numeric;
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const named = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/.exec(text);
  if (named) {
    const [, dd, monthName, yy] = named;
    const mm = GERMAN_MONTHS[monthName.toLowerCase()];
    if (mm) return `${yy}-${mm}-${dd.padStart(2, "0")}`;
  }
  return null;
}

export function findDate(line: string, prefixPattern: string): string | null {
  const re = new RegExp(`${prefixPattern}\\s*(${DATE_FRAGMENT})`, "i");
  const m = re.exec(line);
  return m ? parseGermanDate(m[1]) : null;
}

/**
 * Verweise wie "§ 10 findet entsprechende Anwendung." beginnen selbst mit
 * "§ N", sind aber ganze Sätze (enden auf Satzzeichen) und keine neue
 * Paragraphenüberschrift (die ist immer eine Nominalphrase ohne Punkt).
 */
export function looksLikeCrossReference(text: string): boolean {
  return /[.!?:]$/.test(text.trim());
}
