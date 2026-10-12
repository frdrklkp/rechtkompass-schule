/**
 * Abgleich "im Falltext zitiert" vs. "als Rechtsgrundlage verknüpft".
 *
 * Fund 12.10.2026: Das Anlege-Skript (scripts/_create-and-publish-case.ts)
 * hat zweimal Normen im Text zitiert, die im Bestand liegen, aber nicht
 * verknüpft waren (§ 241 StGB, § 10 JArbSchG, § 43 SchulG NRW). Die
 * Claim-Validierung prüft nur gegen verknüpfte Quellen - sie kannte den
 * Wortlaut nicht und stufte die Fälle rot bzw. ließ falsche Aussagen
 * ("§ 43 nicht Gegenstand der Quellen") stehen.
 *
 * Dieses Modul ist bewusst rein (keine Datenbank): das Skript lädt die
 * Abschnitte der zitierten Gesetze und übergibt sie hier. Entschieden wird:
 *  - eindeutig im Bestand und noch nicht verknüpft -> nachverknüpfen
 *  - mehrere fachlich verschiedene Abschnitte mit derselben Nummer (z.B.
 *    APO-BK-Anlagen, die je bei § 1 neu zählen) -> NICHT raten, melden
 *  - Gesetz im Bestand, Nummer nicht -> melden (erfundene oder nicht
 *    importierte Norm)
 *  - Gesetz gar nicht im Bestand -> melden
 */
import { extractLegalCitationsForCoverage, type ExtractedCitation } from "./legalCitationExtractor";

/**
 * Gesetz -> Quelle. Für die Kerngesetze über den exakten Titel (wie in
 * legalCitationResolver.ts: das short_name-Feld trägt bei vielen BASS-
 * Dokumenten den Platzhalter "SchulG NRW", und die SchulG-Volltextquelle
 * selbst hat keinen short_name). Für alle übrigen, je einmal kuratiert
 * importierten Gesetze über short_name.
 */
export type LawSourceKey = { title: string } | { shortName: string };

const SCHULG_TITLE = "Schulgesetz für das Land Nordrhein-Westfalen (Schulgesetz NRW - SchulG)";
const VWVFG_TITLE =
  "Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen (Verwaltungsverfahrensgesetz NRW – VwVfG NRW)";

export const LAW_SOURCE_KEYS: Record<string, LawSourceKey> = {
  "SchulG NRW": { title: SCHULG_TITLE },
  SchulG: { title: SCHULG_TITLE },
  "VwVfG NRW": { title: VWVFG_TITLE },
  VwVfG: { title: VWVFG_TITLE },
  GG: { title: "Grundgesetz für die Bundesrepublik Deutschland" },
  DSGVO: { title: "Verordnung (EU) 2016/679 (Datenschutz-Grundverordnung – DSGVO)" },
  "APO-BK": {
    title:
      "Verordnung über die Ausbildung und Prüfung in den Bildungsgängen des Berufskollegs (Ausbildungs- und Prüfungsordnung Berufskolleg - APO-BK)",
  },
  LPVG: { shortName: "LPVG NRW" },
};

/** BASS ist eine Sammlung, keine Einzelquelle - "§ N BASS" lässt sich nicht zuordnen. */
const UNRESOLVABLE_LAWS = new Set(["BASS"]);

export function lawSourceKey(lawAbbrev: string): LawSourceKey | null {
  if (UNRESOLVABLE_LAWS.has(lawAbbrev)) return null;
  return LAW_SOURCE_KEYS[lawAbbrev] ?? { shortName: lawAbbrev };
}

export interface CoverageSection {
  id: string;
  reference: string | null;
  section_number?: string | null;
  title?: string | null;
}

/**
 * Nummer aus einer Referenz wie "§ 43", "Art 9", "Titel 27.§ 839",
 * "Abschnitt 3.§ 13" oder "Kapitel I.Art 2" - nur das letzte Segment zählt.
 */
export function sectionNumberOf(reference: string | null | undefined): { kind: "paragraph" | "article"; number: string } | null {
  if (!reference) return null;
  const m = reference.trim().match(/(?:^|\.)\s*(§|Art(?:ikel|\.)?)\s*(\d+[a-z]?)\s*$/i);
  if (!m) return null;
  return { kind: m[1] === "§" ? "paragraph" : "article", number: m[2].toLowerCase() };
}

export interface CoverageInput {
  citations: ExtractedCitation[];
  /** Je Gesetzesabkürzung: Abschnitte der zugeordneten Quelle, oder null = Gesetz nicht (eindeutig) im Bestand. */
  sectionsByLaw: Map<string, CoverageSection[] | null>;
  linkedSectionIds: Set<string>;
}

export interface CoverageResult {
  /** Eindeutig aufgelöst, schon verknüpft. */
  covered: ExtractedCitation[];
  /** Eindeutig aufgelöst, fehlt -> nachverknüpfen. */
  toLink: Array<{ citation: ExtractedCitation; section: CoverageSection }>;
  /** Mehrere fachlich verschiedene Abschnitte, keiner verknüpft - nicht geraten. */
  ambiguous: Array<{ citation: ExtractedCitation; candidates: CoverageSection[] }>;
  /** Gesetz im Bestand, Nummer nicht. */
  sectionMissing: ExtractedCitation[];
  /** Gesetz nicht (eindeutig) im Bestand. */
  lawMissing: ExtractedCitation[];
}

function normTitle(t: string | null | undefined): string {
  return (t ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function planCitationCoverage({ citations, sectionsByLaw, linkedSectionIds }: CoverageInput): CoverageResult {
  const result: CoverageResult = { covered: [], toLink: [], ambiguous: [], sectionMissing: [], lawMissing: [] };
  const plannedIds = new Set<string>();

  for (const citation of citations) {
    if (!lawSourceKey(citation.lawAbbrev)) continue;
    const sections = sectionsByLaw.get(citation.lawAbbrev);
    if (!sections) {
      result.lawMissing.push(citation);
      continue;
    }
    const wanted = citation.paragraph.toLowerCase();
    const candidates = sections.filter((s) => {
      const n = sectionNumberOf(s.reference) ?? sectionNumberOf(s.section_number);
      return n !== null && n.kind === citation.kind && n.number === wanted;
    });
    if (candidates.length === 0) {
      result.sectionMissing.push(citation);
      continue;
    }
    if (candidates.some((c) => linkedSectionIds.has(c.id) || plannedIds.has(c.id))) {
      result.covered.push(citation);
      continue;
    }
    // Gleiche Nummer mehrfach: nur eindeutig, wenn alle Titel übereinstimmen
    // (Mehrfachimport derselben Norm) - dann den ersten nehmen.
    const titles = new Set(candidates.map((c) => normTitle(c.title)));
    if (candidates.length > 1 && titles.size > 1) {
      result.ambiguous.push({ citation, candidates });
      continue;
    }
    plannedIds.add(candidates[0].id);
    result.toLink.push({ citation, section: candidates[0] });
  }
  return result;
}

/**
 * Felder, die /api/ai-validate-legal-claims gegen den Normwortlaut prüft.
 * Fund 12.10.2026: Die FAQ eines Falls zitierte "§ 73 SchulG NRW" für ein
 * Beschwerderecht - § 73 regelt die Klassenpflegschaft. Die FAQ geht nicht
 * in die Validierung ein; eine nur dort zitierte Norm blind zu verknüpfen,
 * würde die Falschangabe legitimieren. Solche Zitate werden deshalb
 * verknüpft UND als Prüfhinweis gemeldet.
 */
export const VALIDATED_FIELDS = [
  "title", "short_answer", "recommendation", "legal_explanation",
  "practice_tip", "checklist", "documentation", "common_mistakes",
];
const ALL_TEXT_FIELDS = [
  ...VALIDATED_FIELDS, "short_description", "immediate_actions", "responsibilities", "faq",
];

/** Alle Freitext-Felder eines Falls (inkl. FAQ und optional Entscheidungsbaum) als ein Text. */
export function collectCaseText(
  row: Record<string, unknown>,
  opts: { includeDecisionTree?: boolean; fields?: string[] } = {},
): string {
  const fields = [...(opts.fields ?? ALL_TEXT_FIELDS)];
  if (opts.includeDecisionTree) fields.push("decision_tree");
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const f of fields) walk(row[f]);
  return parts.join("\n");
}

export function extractCaseCitations(
  row: Record<string, unknown>,
  opts: { includeDecisionTree?: boolean; fields?: string[] } = {},
): ExtractedCitation[] {
  return extractLegalCitationsForCoverage(collectCaseText(row, opts));
}

export function citationKey(c: ExtractedCitation): string {
  return `${c.kind}:${c.paragraph.toLowerCase()}:${c.lawAbbrev}`;
}

/** Erster Satz bzw. Satzanfang als Wortlaut-Kurzfassung für die neue Verknüpfung. */
export function sentenceStart(text: string | null | undefined, max = 260): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return i > 80 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, "") + " …";
}
