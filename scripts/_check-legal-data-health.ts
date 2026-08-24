/**
 * Wiederholbarer Konsistenz-Check für den Rechtsquellen-Bestand.
 *
 * Hintergrund (2026-08-18/19): drei reale Bugs in dieser Session wurden
 * ausschließlich durch Nutzer-Screenshots gefunden, nicht durch
 * systematische Prüfung: (1) Dubletten-Auswahl in legalCitationResolver.ts
 * bevorzugte teils veraltete Paragrafenfassungen, (2) die generische
 * BASS-Parser-Priorität verschluckte APO-BK-Anlagen-Struktur, (3)
 * kuratierte "Wissenskarten" liefen bei 87% der Fälle am tatsächlichen
 * Fließtext vorbei. Dieses Skript bündelt die drei Ad-hoc-Audits, mit
 * denen diese Klassen von Fehlern gefunden wurden, zu einem wiederholbaren
 * Check.
 *
 * WANN AUSFÜHREN: nach jedem BASS-Reimport (_import-bass-all.ts), nach
 * jedem größeren Batch an neuen Praxisfällen, oder bei Verdacht auf
 * Rechtsgrundlagen-Inkonsistenzen.
 *
 * Aufruf: bun run scripts/_check-legal-data-health.ts
 *
 * Manche gemeldeten Zahlen sind KEIN Fehler, sondern eine bekannte,
 * akzeptierte Restmenge (z.B. APO-BK-Anlagen ohne eindeutige Nummerierung -
 * echte strukturelle Mehrdeutigkeit, kein Bug). Das Skript meldet Zahlen
 * zum Beobachten von Veränderungen (Regression), nicht als hartes
 * Pass/Fail-Gate - Interpretation obliegt der lesenden Person.
 */
import { createClient } from "@supabase/supabase-js";
import { extractLegalCitations } from "../src/lib/legalCitationExtractor";
import { resolveLegalCitations, normalizeParagraph } from "../src/lib/legalCitationResolver";

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function checkExtractionCoverage(cases: any[]) {
  console.log("\n=== 1/3: Extraktionsabdeckung ===");
  console.log('Prüft: enthält legal_explanation "§"/"Artikel", aber extractLegalCitations() findet NICHTS?');

  const PARA_OR_ART = /§|Art(?:ikel|\.)\s*\d/;
  let withText = 0,
    withCitations = 0,
    zeroCitations = 0;
  const samples: any[] = [];

  for (const c of cases) {
    const text = c.legal_explanation as string | null;
    if (!text || !text.trim()) continue;
    withText++;
    const citations = extractLegalCitations(text);
    if (citations.length > 0) {
      withCitations++;
    } else if (PARA_OR_ART.test(text)) {
      zeroCitations++;
      if (samples.length < 10) samples.push({ id: c.id, title: c.title, text: text.slice(0, 200) });
    }
  }

  console.log(`  Fälle mit Text: ${withText}, mit erkannten Zitaten: ${withCitations}`);
  console.log(`  §/Artikel im Text, aber NICHTS erkannt: ${zeroCitations}`);
  if (zeroCitations > 0) {
    console.log("  Beispiele:");
    for (const s of samples) console.log(`    - ${s.id} "${s.title}": ${s.text}…`);
  }
  return { withText, withCitations, zeroCitations };
}

async function checkCuratedLinkConsistency(cases: any[]) {
  console.log("\n=== 2/3: Kuratierte Verknüpfungen vs. Fließtext ===");
  console.log("Prüft: zeigt case_legal_links Paragrafen, die im Fließtext NICHT vorkommen?");

  const linkRows = await fetchAll<{ case_id: string; legal_section_id: string }>(
    "case_legal_links",
    "case_id,legal_section_id",
  );
  const linksByCase = new Map<string, string[]>();
  for (const l of linkRows) {
    const arr = linksByCase.get(l.case_id) ?? [];
    arr.push(l.legal_section_id);
    linksByCase.set(l.case_id, arr);
  }

  const allSectionIds = [...new Set(linkRows.map((l) => l.legal_section_id))];
  let sectionRows: any[] = [];
  for (let i = 0; i < allSectionIds.length; i += 500) {
    const { data } = await supabase
      .from("legal_sections")
      .select("id,section_number,legal_sources(name)")
      .in("id", allSectionIds.slice(i, i + 500));
    sectionRows = sectionRows.concat(data ?? []);
  }
  const sectionById = new Map(sectionRows.map((s: any) => [s.id, s]));

  let casesWithCuratedCards = 0,
    fullyMismatched = 0,
    partiallyMismatched = 0,
    fullyMatched = 0;
  const mismatchSamples: any[] = [];

  for (const c of cases) {
    const sectionIds = linksByCase.get(c.id) ?? [];
    if (sectionIds.length === 0) continue;
    casesWithCuratedCards++;

    const citations = extractLegalCitations(c.legal_explanation);
    const resolved = citations.length > 0 ? await resolveLegalCitations(citations) : [];
    const citedKeys = new Set(
      resolved
        .filter((r) => r.section)
        .map((r) => `${r.section!.source?.name ?? ""}::${normalizeParagraph(r.section!.section_number)}`),
    );

    const curatedKeys = sectionIds
      .map((id) => {
        const s = sectionById.get(id);
        if (!s) return null;
        return `${s.legal_sources?.name ?? ""}::${normalizeParagraph(s.section_number ?? "")}`;
      })
      .filter(Boolean) as string[];

    const matchedCount = curatedKeys.filter((k) => citedKeys.has(k)).length;
    if (matchedCount === 0) {
      fullyMismatched++;
      if (mismatchSamples.length < 10) mismatchSamples.push({ id: c.id, title: c.title, curatedCount: curatedKeys.length });
    } else if (matchedCount < curatedKeys.length) {
      partiallyMismatched++;
    } else {
      fullyMatched++;
    }
  }

  console.log(`  Fälle mit kuratierten Karten: ${casesWithCuratedCards}`);
  console.log(`  Vollständig passend: ${fullyMatched}, teilweise: ${partiallyMismatched}, komplett unpassend: ${fullyMismatched}`);
  if (fullyMismatched > 0) {
    console.log("  Beispiele komplett unpassend:");
    for (const s of mismatchSamples) console.log(`    - ${s.id} "${s.title}" (${s.curatedCount} Karten)`);
  }
  return { casesWithCuratedCards, fullyMatched, partiallyMismatched, fullyMismatched };
}

async function checkSourceDuplication() {
  console.log("\n=== 3/3: Interne Dubletten in Rechtsquellen ===");
  console.log("Prüft: pro Gesetzestitel - Paragrafen mit mehreren Zeilen UNTERSCHIEDLICHEN Inhalts.");

  const sources = await fetchAll<{ id: string; title: string }>("legal_sources", "id,title");
  const byTitle = new Map<string, string[]>();
  for (const s of sources) {
    const arr = byTitle.get(s.title) ?? [];
    arr.push(s.id);
    byTitle.set(s.title, arr);
  }
  const duplicatedTitles = [...byTitle.entries()].filter(([, ids]) => ids.length > 1);

  console.log(`  Gesetzestitel mit mehreren Quellen-Zeilen: ${duplicatedTitles.length}`);

  let totalDivergentGroups = 0;
  for (const [title, ids] of duplicatedTitles) {
    let sections: any[] = [];
    for (const id of ids) {
      const { data } = await supabase.from("legal_sections").select("section_number,reference,title,full_text").eq("source_id", id);
      sections = sections.concat(data ?? []);
    }
    const byNum = new Map<string, any[]>();
    for (const s of sections) {
      const key = normalizeParagraph(String(s.section_number || s.reference || ""));
      if (!key) continue;
      const l = byNum.get(key) ?? [];
      l.push(s);
      byNum.set(key, l);
    }
    let divergentGroups = 0;
    for (const [, rows] of byNum) {
      if (rows.length <= 1) continue;
      const distinctTexts = new Set(rows.map((r: any) => (r.full_text ?? "").trim()));
      if (distinctTexts.size > 1) divergentGroups++;
    }
    if (divergentGroups > 0) {
      console.log(`    - "${title.slice(0, 60)}": ${sections.length} Zeilen, ${divergentGroups} Paragrafen mit abweichendem Inhalt`);
      totalDivergentGroups += divergentGroups;
    }
  }
  console.log(`  Gesamt: ${totalDivergentGroups} Paragrafen mit abweichendem Inhalt über alle mehrfach vorliegenden Quellen.`);
  return { duplicatedTitleCount: duplicatedTitles.length, totalDivergentGroups };
}

async function fetchPublishedCases(): Promise<any[]> {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("practice_cases")
      .select("id,title,legal_explanation")
      .eq("status", "published")
      .range(from, from + 999);
    if (error) throw new Error(`practice_cases: ${error.message}`);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  console.log("Lade veröffentlichte Fälle...");
  const pub = await fetchPublishedCases();
  console.log(`${pub.length} veröffentlichte Fälle geladen.`);

  const r1 = await checkExtractionCoverage(pub);
  const r2 = await checkCuratedLinkConsistency(pub);
  const r3 = await checkSourceDuplication();

  console.log("\n=== Gesamtübersicht ===");
  console.log(JSON.stringify({ extraktion: r1, kuration: r2, dubletten: r3 }, null, 2));
}

main().catch((e) => {
  console.error("Skript fehlgeschlagen:", e);
  process.exit(1);
});
