/**
 * Einheitliche Wissenskarten-Überschrift.
 * Aufbau: Rechtsquelle → Abschnittsnummer → offizielle Überschrift.
 */

type SourceLike = {
  name?: string | null;
  short_name?: string | null;
  jurisdiction?: string | null;
} | null | undefined;

type SectionLike = {
  section_number?: string | null;
  reference?: string | null;
  title?: string | null;
  legal_sources?: SourceLike;
  source?: SourceLike;
};

export function sourceLabel(src: SourceLike): string {
  if (!src) return "";
  return (src.name ?? src.short_name ?? "").trim();
}

export function sectionNumber(sec: SectionLike): string {
  return String(sec.section_number ?? sec.reference ?? "").trim();
}

/**
 * Zweizeilige Überschrift, z. B.:
 *   Schulgesetz NRW
 *   § 53 Erzieherische Einwirkungen und Ordnungsmaßnahmen
 */
export function formatSectionHeading(
  sec: SectionLike,
  srcOverride?: SourceLike,
): { source: string; line: string } {
  const src = srcOverride ?? sec.legal_sources ?? sec.source ?? null;
  const nr = sectionNumber(sec);
  const title = (sec.title ?? "").trim();
  const line = [nr, title].filter(Boolean).join(" ");
  return { source: sourceLabel(src), line };
}

/**
 * Einzeilige Variante für Listen / Chips:
 *   "Schulgesetz NRW · § 53 Erzieherische Einwirkungen und Ordnungsmaßnahmen"
 */
export function formatSectionInline(
  sec: SectionLike,
  srcOverride?: SourceLike,
): string {
  const h = formatSectionHeading(sec, srcOverride);
  return [h.source, h.line].filter(Boolean).join(" · ");
}
