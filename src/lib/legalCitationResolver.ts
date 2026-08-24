/**
 * Löst im Fließtext gefundene § / Art.-Zitate (legalCitationExtractor.ts)
 * gegen den tatsächlichen Rechtsquellen-Bestand auf.
 *
 * Kuratierte Abkürzung -> exakter Quellen-Titel-Zuordnung, bewusst NICHT
 * über das short_name-Feld (siehe legalCitationExtractor.ts) - stattdessen
 * über den exakten, verifizierten Titel der jeweils dediziert importierten
 * Gesetze (siehe src/services/legal-knowledge/connectors/registry.ts).
 *
 * Fund 2026-08-18: mehrere Gesetzestitel liegen unter mehreren
 * legal_sources-Zeilen vor (Mehrfach-Import), und selbst INNERHALB einer
 * einzelnen Quelle taucht dieselbe Paragrafennummer wiederholt auf. Ein
 * naives "die Quelle mit den meisten Zeilen gewinnt" + "letzter Treffer
 * gewinnt" ist nachweislich unsicher:
 *  - SchulG NRW: ein und dieselbe Paragrafennummer (z.B. § 11) liegt mit
 *    ZWEI unterschiedlichen Gesetzesfassungen vor (Stand 2022 vs. Stand
 *    2026, gleicher Titel) - hier ist "neueste Fassung gewinnt" fachlich
 *    korrekt und wird über das im Fließtext stehende Datum entschieden.
 *  - APO-BK: dieselbe Paragrafennummer (z.B. "§ 1") taucht mit BIS ZU 6
 *    völlig unterschiedlichen Titeln/Inhalten auf, weil die Verordnung aus
 *    mehreren Anlagen (Fachoberschule, Berufsschule, Fachschule, ...)
 *    besteht, die je eigenständig bei § 1 neu zu zählen beginnen. Hier gibt
 *    es KEINE Rangfolge - eine automatische Auswahl wäre fachlich falsch.
 *    Solche Fälle werden bewusst als "ambiguous" markiert statt zu raten.
 *
 * Deshalb: Abschnitte aus ALLEN gleichnamigen Quellen zusammenführen und
 * pro Paragrafennummer selbst entscheiden (identisch -> trivial, gleicher
 * Titel + abweichender Text -> neueste Fassung, unterschiedlicher Titel ->
 * mehrdeutig, nicht auflösen).
 */
import { supabase } from "@/integrations/supabase/client";
import type { ExtractedCitation } from "./legalCitationExtractor";
import type { LegalSectionCard } from "@/data/cases";

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  märz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

/**
 * Extrahiert das Wirksamkeits-/Änderungsdatum aus dem Gesetzestext-Kopf,
 * z.B. "..., in Kraft getreten am 1. August 2026." oder
 * "zuletzt geändert durch ... vom 23. Februar 2022 ...". Wird genutzt, um
 * zwischen mehreren Fassungen DESSELBEN Paragrafen die aktuell gültige zu
 * wählen. Gibt null zurück, wenn kein Datum gefunden wird.
 */
function extractEffectiveDate(text: string | null | undefined): number | null {
  if (!text) return null;
  const patterns = [
    /in Kraft getreten am\s+(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/i,
    /zuletzt geändert[^.]*?vom\s+(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const day = Number.parseInt(m[1], 10);
    const month = GERMAN_MONTHS[m[2].toLowerCase()];
    const year = Number.parseInt(m[3], 10);
    if (month) return new Date(year, month - 1, day).getTime();
  }
  return null;
}

const CANONICAL_SOURCE_TITLES: Record<string, string> = {
  "SchulG NRW": "Schulgesetz für das Land Nordrhein-Westfalen (Schulgesetz NRW - SchulG)",
  SchulG: "Schulgesetz für das Land Nordrhein-Westfalen (Schulgesetz NRW - SchulG)",
  "VwVfG NRW":
    "Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen (Verwaltungsverfahrensgesetz NRW – VwVfG NRW)",
  VwVfG:
    "Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen (Verwaltungsverfahrensgesetz NRW – VwVfG NRW)",
  GG: "Grundgesetz für die Bundesrepublik Deutschland",
  DSGVO: "Verordnung (EU) 2016/679 (Datenschutz-Grundverordnung – DSGVO)",
  "APO-BK":
    "Verordnung über die Ausbildung und Prüfung in den Bildungsgängen des Berufskollegs (Ausbildungs- und Prüfungsordnung Berufskolleg - APO-BK)",
  // DSG NRW, StGB, SGB VIII/IX/X/I, KunstUrhG, BGB, BASS: kein kuratierter
  // Import im Bestand - Zitate dazu lösen bewusst nicht auf ("nicht im
  // Bestand") statt eine falsche Quelle zu raten.
};

export interface ResolvedCitation {
  citation: ExtractedCitation;
  section: LegalSectionCard | null;
  /**
   * true, wenn die Paragrafennummer im Bestand mehrfach mit fachlich
   * UNTERSCHIEDLICHEM Inhalt vorkommt (z.B. mehrere Anlagen derselben
   * Verordnung) und deshalb bewusst NICHT automatisch aufgelöst wurde.
   */
  ambiguous?: boolean;
}

const sourceIdsCache = new Map<string, Promise<string[]>>();

/** Liefert ALLE legal_sources-IDs mit exakt diesem Titel (auch bei Mehrfach-Import). */
async function resolveCanonicalSourceIds(title: string): Promise<string[]> {
  const cached = sourceIdsCache.get(title);
  if (cached) return cached;

  const promise = (async () => {
    const { data: sources } = await (supabase.from("legal_sources") as any)
      .select("id")
      .eq("title", title);
    return (sources ?? []).map((s: { id: string }) => s.id);
  })();

  sourceIdsCache.set(title, promise);
  return promise;
}

/**
 * Fund 2026-08-18: Artikel-Nummern liegen in legal_sections.section_number
 * mit Präfix vor ("Art 9", teils "Artikel 9"/"Art. 9"), während
 * legalCitationExtractor.ts nur die bloße Nummer liefert ("9"). Ohne das
 * Art-Präfix ebenfalls zu entfernen (wie schon für "§") würde JEDE
 * Artikel-Zitierung fälschlich als "nicht im Bestand" erscheinen, selbst
 * wenn der Artikel tatsächlich vorhanden ist.
 */
export function normalizeParagraph(p: string): string {
  return p
    .trim()
    .toLowerCase()
    .replace(/^§+\s*/, "")
    .replace(/^art(?:ikel)?\.?\s*/, "");
}

/**
 * Manche Importläufe schneiden lange Überschriften am ersten Komma ab und
 * hängen den Rest fälschlich vorn an den Fließtext (bekannter Parser-Bug,
 * z.B. "Erzieherische Einwirkungen," statt "Erzieherische Einwirkungen,
 * Ordnungsmaßnahmen"). Ohne diese Erkennung würde ein solcher Kürzungs-
 * Artefakt fälschlich als "andere Bestimmung" (strukturelle Mehrdeutigkeit
 * wie bei APO-BK-Anlagen) statt als Formatierungsfehler gewertet. Zwei
 * Titel gelten als dieselbe Bestimmung, wenn (nach Entfernen von
 * Leerzeichen) einer ein Präfix des anderen ist.
 */
function isSameProvisionTitle(a: string, b: string): boolean {
  const na = a.trim().toLowerCase().replace(/\s+/g, "");
  const nb = b.trim().toLowerCase().replace(/\s+/g, "");
  if (!na || !nb) return true; // fehlender Titel -> kein Widerspruchsbeweis, nicht blockieren
  return na.startsWith(nb) || nb.startsWith(na);
}

interface ResolvedGroup {
  row: any;
  ambiguous: boolean;
}

/**
 * Gruppiert alle Abschnitte (aus ggf. mehreren gleichnamigen Quellen) nach
 * normalisierter Paragrafennummer und entscheidet pro Gruppe deterministisch:
 *  - nur ein Eintrag, oder alle textgleich -> trivial
 *  - mehrere Einträge, gleiche/kompatible (siehe isSameProvisionTitle) Titel,
 *    abweichender Text -> das Datum "in Kraft getreten am" / "zuletzt
 *    geändert ... vom" entscheidet, welche Fassung aktuell gültig ist
 *    (neueste gewinnt, längster Text als deterministischer Tiebreak, falls
 *    kein Datum extrahierbar ist)
 *  - mehrere Einträge, fachlich UNTERSCHIEDLICHER Titel -> strukturell
 *    mehrdeutig (z.B. verschiedene Anlagen einer Verordnung), wird NICHT
 *    geraten
 */
function buildResolutionMap(sections: any[]): Map<string, ResolvedGroup> {
  const byNumber = new Map<string, any[]>();
  for (const s of sections) {
    for (const raw of [s.section_number, s.reference]) {
      if (!raw) continue;
      const key = normalizeParagraph(String(raw));
      const list = byNumber.get(key) ?? [];
      if (!list.includes(s)) list.push(s);
      byNumber.set(key, list);
    }
  }

  const result = new Map<string, ResolvedGroup>();
  for (const [key, rows] of byNumber) {
    if (rows.length === 1) {
      result.set(key, { row: rows[0], ambiguous: false });
      continue;
    }

    const distinctTexts = new Map<string, any>();
    for (const r of rows) distinctTexts.set((r.full_text ?? "").trim(), r);
    if (distinctTexts.size === 1) {
      result.set(key, { row: rows[0], ambiguous: false });
      continue;
    }

    const allTitlesCompatible = rows.every((r, i) =>
      rows.slice(i + 1).every((other) => isSameProvisionTitle(r.title ?? "", other.title ?? "")),
    );
    if (!allTitlesCompatible) {
      // Fachlich unterschiedliche Titel unter derselben Nummer = strukturell
      // unterschiedliche Bestimmungen (z.B. verschiedene Anlagen). Keine
      // sichere automatische Auswahl möglich.
      result.set(key, { row: rows[0], ambiguous: true });
      continue;
    }

    // Gleiche/kompatible Titel, abweichender Text = Versionierung derselben
    // Bestimmung über die Zeit. Neueste gültige Fassung gewinnt.
    let best = rows[0];
    let bestDate = extractEffectiveDate(best.full_text) ?? Number.NEGATIVE_INFINITY;
    for (const r of rows.slice(1)) {
      const d = extractEffectiveDate(r.full_text) ?? Number.NEGATIVE_INFINITY;
      const rLen = (r.full_text ?? "").length;
      const bestLen = (best.full_text ?? "").length;
      if (d > bestDate || (d === bestDate && rLen > bestLen)) {
        best = r;
        bestDate = d;
      }
    }
    result.set(key, { row: best, ambiguous: false });
  }
  return result;
}

export async function resolveLegalCitations(
  citations: ExtractedCitation[],
): Promise<ResolvedCitation[]> {
  const results: ResolvedCitation[] = [];
  const byLaw = new Map<string, ExtractedCitation[]>();
  for (const c of citations) {
    const list = byLaw.get(c.lawAbbrev) ?? [];
    list.push(c);
    byLaw.set(c.lawAbbrev, list);
  }

  for (const [lawAbbrev, cites] of byLaw) {
    const canonicalTitle = CANONICAL_SOURCE_TITLES[lawAbbrev];
    if (!canonicalTitle) {
      for (const c of cites) results.push({ citation: c, section: null });
      continue;
    }

    const sourceIds = await resolveCanonicalSourceIds(canonicalTitle);
    if (sourceIds.length === 0) {
      for (const c of cites) results.push({ citation: c, section: null });
      continue;
    }

    const { data: sourceRows } = await (supabase.from("legal_sources") as any)
      .select("id,title,jurisdiction,official_url")
      .in("id", sourceIds);
    const sourceById = new Map<string, any>((sourceRows ?? []).map((r: any) => [r.id, r]));

    const { data: sections } = await (supabase.from("legal_sections") as any)
      .select("*")
      .in("source_id", sourceIds);

    const resolutionMap = buildResolutionMap((sections ?? []) as any[]);

    for (const c of cites) {
      const resolved = resolutionMap.get(normalizeParagraph(c.paragraph));
      if (!resolved) {
        results.push({ citation: c, section: null });
        continue;
      }
      if (resolved.ambiguous) {
        results.push({ citation: c, section: null, ambiguous: true });
        continue;
      }
      const match = resolved.row;
      const sourceRow = sourceById.get(match.source_id);
      const commonMistakes = Array.isArray(match.common_mistakes)
        ? match.common_mistakes.join(" ")
        : (match.common_mistakes ?? null);
      results.push({
        citation: c,
        section: {
          id: match.id,
          section_number: match.section_number ?? match.reference ?? c.paragraph,
          title: match.title ?? null,
          summary: match.summary ?? null,
          practice_relevance: match.practice_relevance ?? null,
          recommendation: match.recommendation ?? null,
          common_mistakes: commonMistakes,
          full_text: match.full_text ?? null,
          official_url: match.official_url ?? null,
          version_label: match.version_label ?? null,
          valid_from: match.valid_from ?? null,
          valid_to: match.valid_to ?? null,
          last_reviewed_at: match.last_reviewed_at ?? null,
          status: match.status ?? null,
          explanation: null,
          source: sourceRow
            ? {
                id: sourceRow.id,
                name: sourceRow.title,
                jurisdiction: sourceRow.jurisdiction ?? null,
                official_url: sourceRow.official_url ?? null,
              }
            : null,
        },
      });
    }
  }

  return results;
}
