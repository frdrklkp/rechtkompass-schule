/**
 * Datenbank-Anbindung für citationIntegrity.ts: Norm-Lookup und Belegtexte
 * je Fall. Gemeinsam genutzt vom Bestandsscan, der Zahlenbereinigung und dem
 * Anlegeskript, damit alle drei dieselben Regeln anwenden.
 */
import { extractLegalCitationsForCoverage } from "./legalCitationExtractor";
import { fieldText, INTEGRITY_FIELDS, type LawSectionLookup } from "./citationIntegrity";
import { lawSourceKey } from "./caseCitationCoverage";

const SCHULG_SOURCE_ID = "c03ef1d3-084b-4dcf-a398-6ca0c4d98ceb";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function all<T>(db: Db, table: string, select: string, filter: (q: any) => any = (q) => q): Promise<T[]> {
  let out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(db.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data);
    if (data.length < 1000) break;
  }
  return out;
}

export interface IntegrityContext {
  lookup: LawSectionLookup;
  contentById: Map<string, string>;
  /** Belegtexte: verknüpfte Abschnitte plus jede im Fall zitierte Norm aus dem Bestand. */
  evidenceFor(caseRow: Record<string, unknown>, linkedSectionIds: string[]): string[];
}

export async function loadIntegrityContext(db: Db): Promise<IntegrityContext> {
  const sources = await all<any>(db, "legal_sources", "id,title,short_name,source_type", (q) => q.eq("status", "active"));
  const sections = await all<any>(db, "legal_sections", "id,source_id,reference,content,metadata");
  const contentById = new Map<string, string>(sections.map((s) => [s.id, s.content ?? ""]));
  const absatzCountById = new Map<string, number>(sections.filter((s) => s.metadata?.absatz_count).map((s) => [s.id, Number(s.metadata.absatz_count)]));
  const bySource = new Map<string, Map<string, string[]>>();
  for (const s of sections) {
    const last = String(s.reference ?? "").split(".").pop()!.trim();
    const m = last.match(/^(§|Art\.?)\s*(\d+[a-z]?)$/);
    if (!m) continue;
    const key = `${m[1].startsWith("§") ? "p" : "a"}${m[2]}`;
    if (!bySource.has(s.source_id)) bySource.set(s.source_id, new Map());
    const mm = bySource.get(s.source_id)!;
    mm.set(key, [...(mm.get(key) ?? []), s.id]);
  }
  const sourceCache = new Map<string, string | null>();
  const sourceFor = (law: string): string | null => {
    if (sourceCache.has(law)) return sourceCache.get(law)!;
    const k = lawSourceKey(law);
    let id: string | null = null;
    if (k) {
      const match = (s: any) => ("title" in k ? s.title === k.title : s.short_name === k.shortName);
      const laws = sources.filter((s) => match(s) && s.source_type === "law");
      const any = laws.length ? laws : sources.filter(match);
      id = any.length === 1 ? any[0].id : null;
    }
    sourceCache.set(law, id);
    return id;
  };
  const lookup: LawSectionLookup = {
    find(law, paragraph, kind) {
      const src = sourceFor(law);
      if (!src) return null;
      const ids = bySource.get(src)?.get(`${kind === "article" ? "a" : "p"}${paragraph}`) ?? [];
      if (ids.length !== 1) return null; // mehrdeutig (APO-BK-Anlagen): nicht raten
      return { content: contentById.get(ids[0])!, lineStructured: src === SCHULG_SOURCE_ID, absatzCount: absatzCountById.get(ids[0]) };
    },
  };
  return {
    lookup,
    contentById,
    evidenceFor(caseRow, linkedSectionIds) {
      const texts = linkedSectionIds.map((id) => contentById.get(id) ?? "");
      for (const f of INTEGRITY_FIELDS) for (const c of extractLegalCitationsForCoverage(fieldText(caseRow[f]))) {
        const sec = lookup.find(c.lawAbbrev, c.paragraph, c.kind);
        if (sec) texts.push(sec.content);
      }
      return texts;
    },
  };
}
