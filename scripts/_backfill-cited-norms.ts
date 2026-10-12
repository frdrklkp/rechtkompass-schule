/**
 * Einmaliger Bestandsabgleich "im Falltext zitiert" vs. "verknüpft" für alle
 * veröffentlichten Fälle (12.10.2026) - dieselbe Logik wie Schritt 4.2/6.5
 * im Anlege-Skript (src/lib/caseCitationCoverage.ts).
 *
 *  - eindeutig im Bestand, nicht verknüpft -> nachverknüpfen (Wortlaut-Kurzfassung)
 *  - nur in nicht validierten Feldern zitiert (FAQ, Baum, Sofortmaßnahmen)
 *    sowie Gesetz im Bestand, Nummer nicht -> Prüfliste (--review=<datei>)
 *  - mehrdeutig / Gesetz nicht importiert -> nur im Bericht
 *
 * Bewusst KEINE case_legal_review_flags: die Falldetailseite zeigt offene
 * Flags Lehrkräften ungefiltert als "Offene Rechtsfragen" - interne
 * Prüfhinweise auf veröffentlichten Fällen gehören dort nicht hin. Die
 * Prüfliste wird redaktionell abgearbeitet.
 *
 * Aufruf: bun run scripts/_backfill-cited-norms.ts [--apply] [--only-ids=a,b] [--review=pfad.tsv]
 * Ohne --apply nur Bericht, keine Änderung.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  collectCaseText, citationKey, extractCaseCitations, lawSourceKey, planCitationCoverage, sentenceStart, VALIDATED_FIELDS,
} from "../src/lib/caseCitationCoverage";

const apply = process.argv.includes("--apply");
const reviewPath = process.argv.find((a) => a.startsWith("--review="))?.slice(9);
const onlyIds = process.argv.find((a) => a.startsWith("--only-ids="))?.slice(11).split(",").filter(Boolean) ?? [];
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

const sourceCache = new Map<string, string | null>();
const sectionCache = new Map<string, any[]>();

async function sectionsFor(lawAbbrev: string, kind: "paragraph" | "article", paragraph: string): Promise<any[] | null> {
  const key = lawSourceKey(lawAbbrev)!;
  if (!sourceCache.has(lawAbbrev)) {
    let q = db.from("legal_sources").select("id").eq("status", "active");
    q = "title" in key ? q.eq("title", key.title) : q.eq("short_name", key.shortName);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    sourceCache.set(lawAbbrev, data.length === 1 ? data[0].id : null);
  }
  const sourceId = sourceCache.get(lawAbbrev);
  if (!sourceId) return null;
  const ck = `${sourceId}|${kind}|${paragraph}`;
  if (!sectionCache.has(ck)) {
    const forms = kind === "paragraph" ? [`§ ${paragraph}`] : [`Art ${paragraph}`, `Art. ${paragraph}`, `Artikel ${paragraph}`];
    const { data, error } = await db.from("legal_sections")
      .select("id, reference, section_number, title, content").eq("source_id", sourceId)
      .or(forms.flatMap((f) => [`reference.eq."${f}"`, `reference.like."%.${f}"`]).join(","));
    if (error) throw new Error(error.message);
    sectionCache.set(ck, data ?? []);
  }
  return sectionCache.get(ck)!;
}

async function main() {
  const cases: any[] = [];
  for (let from = 0; ; from += 500) {
    let q = db.from("practice_cases").select("*").order("id");
    q = onlyIds.length ? q.in("id", onlyIds) : q.eq("status", "published");
    const { data, error } = await q.range(from, from + 499);
    if (error) throw new Error(error.message);
    cases.push(...data);
    if (data.length < 500) break;
  }

  const total = { cases: cases.length, touched: 0, linked: 0, reviewUnvalidated: 0, reviewMissing: 0, ambiguous: 0, lawMissing: 0 };
  const missingList: string[] = [];
  const ambiguousList: string[] = [];
  const review: string[][] = [];

  for (const row of cases) {
    const citations = extractCaseCitations(row, { includeDecisionTree: true });
    if (!citations.length) continue;
    const validatedKeys = new Set(extractCaseCitations(row, { fields: VALIDATED_FIELDS }).map(citationKey));
    const { data: links } = await db.from("case_legal_links").select("legal_section_id").eq("case_id", row.id);
    const linked = new Set<string>((links ?? []).map((l: any) => l.legal_section_id));

    const sectionsByLaw = new Map<string, any[] | null>();
    for (const c of citations) {
      if (!lawSourceKey(c.lawAbbrev)) continue;
      const secs = await sectionsFor(c.lawAbbrev, c.kind, c.paragraph);
      sectionsByLaw.set(c.lawAbbrev, secs === null ? null : [...(sectionsByLaw.get(c.lawAbbrev) ?? []), ...secs]);
    }
    const plan = planCitationCoverage({ citations, sectionsByLaw, linkedSectionIds: linked });

    const linkRows = plan.toLink.map((t) => ({
      case_id: row.id, legal_section_id: t.section.id, relevance: "high",
      explanation: `Im Falltext zitiert: ${t.citation.raw}`,
      content_summary: sentenceStart((t.section as any).content), content_summary_kind: "wortlaut",
    }));
    const context = (raw: string) => {
      const t = collectCaseText(row, { includeDecisionTree: true }).replace(/\s+/g, " ");
      const i = t.indexOf(raw);
      return i < 0 ? "" : t.slice(Math.max(0, i - 160), i + raw.length + 160);
    };
    for (const t of plan.toLink) {
      if (validatedKeys.has(citationKey(t.citation))) {
        review.push(["validiert", row.id, row.title, t.citation.raw, `${t.section.reference} ${t.section.title ?? ""}`, context(t.citation.raw)]);
        continue;
      }
      total.reviewUnvalidated++;
      review.push(["nur-unvalidiert", row.id, row.title, t.citation.raw, `${t.section.reference} ${t.section.title ?? ""}`, context(t.citation.raw)]);
    }
    for (const c of plan.sectionMissing) {
      total.reviewMissing++;
      missingList.push(`${row.id.slice(0, 8)} ${c.raw}  (${row.title.slice(0, 55)})`);
      review.push(["nicht-im-bestand", row.id, row.title, c.raw, "", context(c.raw)]);
    }
    for (const a of plan.ambiguous) ambiguousList.push(`${row.id.slice(0, 8)} ${a.citation.raw} (${a.candidates.length} Kandidaten)`);
    total.ambiguous += plan.ambiguous.length;
    total.lawMissing += plan.lawMissing.length;

    if (!linkRows.length) continue;
    total.touched++;
    total.linked += linkRows.length;
    if (onlyIds.length) {
      console.log(`${row.id.slice(0, 8)} ${row.title.slice(0, 60)}`);
      for (const r of linkRows) console.log(`   + ${r.explanation}`);
    }
    if (!apply) continue;
    if (linkRows.length) {
      const { error } = await db.from("case_legal_links").insert(linkRows);
      if (error) throw new Error(`${row.id}: ${error.message}`);
    }
  }

  console.log(apply ? "=== ANGEWENDET ===" : "=== TROCKENLAUF (ohne --apply keine Änderung) ===");
  console.log(total);
  console.log("\nNicht im Bestand (Prüfliste):");
  for (const m of missingList) console.log("  " + m);
  console.log("\nMehrdeutig (nur Bericht):");
  for (const a of ambiguousList) console.log("  " + a);
  if (reviewPath) {
    writeFileSync(reviewPath, ["art\tfall_id\ttitel\tzitat\tverknuepfte_norm\tkontext", ...review.map((r) => r.map((x) => x.replace(/[\t\n]/g, " ")).join("\t"))].join("\n"));
    console.log(`\nPrüfliste: ${review.length} Zeilen -> ${reviewPath}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
