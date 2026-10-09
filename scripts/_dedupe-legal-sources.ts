/**
 * Doppelt importierte Rechtsquellen bereinigen (09.10.2026).
 *
 * BASS veröffentlicht Verordnung und Verwaltungsvorschrift oft auf zwei Seiten
 * mit identischem Text (VV-Seite enthält die VO mit). Beide wurden importiert,
 * dazu ein Gesetz zweimal mit derselben Adresse. Folge: doppelte Suchtreffer
 * und Fall-Links, die sich auf zwei Kopien verteilen.
 *
 * Vorgehen je Gruppe mit wortgleichem Inhalt:
 *  - Original wählen: mehr Fall-Links > "Verordnung" statt "Verwaltungsvorschriften"
 *    im Titel > früher importiert.
 *  - Abschnitte der Kopie per Fundstelle (reference) dem Original zuordnen und
 *    alle Verweise umhängen: case_legal_links, case_legal_review_flags,
 *    workflow_step_sources, legal_section_references.resolved_section_id.
 *    Hat ein Fall die Original-Fundstelle schon verknüpft, entfällt der doppelte Link.
 *  - Kopie stilllegen statt löschen: lifecycle_status 'archived', status
 *    'superseded' (aufgehobene: 'repealed'), replaced_by_source_id = Original; Chunks inaktiv, Suchvektoren
 *    ungültig. Damit bleibt alles nachvollziehbar und umkehrbar.
 * Zusätzlich: aufgehobene Erlasse, deren BASS-Seite nur "bereinigt" enthält,
 * und der GG-Auszug auf der BASS-Seite 1077 (Volltext GG ist importiert).
 *
 * Aufruf: bun run scripts/_dedupe-legal-sources.ts [--dry-run]
 */
import { SQL } from "bun";
import { createHash } from "node:crypto";

const dry = process.argv.includes("--dry-run");
const sql = new SQL(process.env.SUPABASE_DB_URL!);
const norm = (t: string) => t.replace(/\s+/g, " ").replace(/\d+(?=\s|$)/g, "").trim().toLowerCase();

const srcs = await sql`select id, title, short_name, official_url, created_at from public.legal_sources where status='active'`;
const secs = await sql`select id, source_id, reference, content from public.legal_sections where source_id in (select id from public.legal_sources where status='active')`;
const linkCounts = await sql`select s.source_id, count(*)::int as n from public.case_legal_links l join public.legal_sections s on s.id=l.legal_section_id group by 1`;
const links = new Map(linkCounts.map((r: any) => [r.source_id, r.n]));
const bySrc = new Map<string, any[]>();
for (const s of secs) bySrc.set(s.source_id, [...(bySrc.get(s.source_id) ?? []), s]);

// Fingerprint ohne die nachträglich erzeugten Split-Abschnitte (die sind in beiden Kopien gleich aufgebaut).
const fpOf = (sid: string) => createHash("sha1").update((bySrc.get(sid) ?? []).filter((x) => x.reference !== "Anlagen").map((x) => norm(x.content)).sort().join("\n")).digest("hex");
const groups = new Map<string, string[]>();
for (const s of srcs) { if (!bySrc.has(s.id)) continue; const h = fpOf(s.id); groups.set(h, [...(groups.get(h) ?? []), s.id]); }

const REPEALED_URLS = ["https://bass.schule.nrw/100.htm", "https://bass.schule.nrw/8811.htm", "https://bass.schule.nrw/1059.htm"];
const plan: Array<{ dup: any; canon: any | null; kind: "duplicate" | "repealed" | "excerpt" }> = [];
for (const ids of groups.values()) {
  if (ids.length < 2) continue;
  const members = ids.map((id) => srcs.find((s: any) => s.id === id));
  if (members.every((m: any) => REPEALED_URLS.includes(m.official_url))) continue; // eigene Behandlung unten
  const rank = (s: any) => [-(links.get(s.id) ?? 0), /Verwaltungsvorschrift/i.test(s.title) ? 1 : 0, new Date(s.created_at).getTime()];
  members.sort((a: any, b: any) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]; return 0; });
  const [canon, ...dups] = members;
  for (const d of dups) plan.push({ dup: d, canon, kind: "duplicate" });
}
for (const u of REPEALED_URLS) { const s = srcs.find((x: any) => x.official_url === u); if (s) plan.push({ dup: s, canon: null, kind: "repealed" }); }
const ggExcerpt = srcs.find((x: any) => x.official_url === "https://bass.schule.nrw/1077.htm");
const ggFull = srcs.find((x: any) => x.official_url === "https://www.gesetze-im-internet.de/gg/BJNR000010949.html");
if (ggExcerpt && ggFull) plan.push({ dup: ggExcerpt, canon: ggFull, kind: "excerpt" });

let movedLinks = 0, droppedLinks = 0, movedOther = 0;
for (const p of plan) {
  const dupSecs = bySrc.get(p.dup.id) ?? [];
  const canonSecs = p.canon ? bySrc.get(p.canon.id) ?? [] : [];
  const mapping = new Map<string, string>();
  const unmatched: string[] = [];
  for (const ds of dupSecs) {
    const cands = canonSecs.filter((c: any) => c.reference === ds.reference);
    const exact = cands.find((c: any) => norm(c.content) === norm(ds.content)) ?? cands[0];
    if (exact) mapping.set(ds.id, exact.id); else unmatched.push(ds.reference);
  }
  const dupIds = dupSecs.map((s: any) => s.id);
  const dupLinks = dupIds.length ? await sql`select id, case_id, legal_section_id from public.case_legal_links where legal_section_id in ${sql(dupIds)}` : [];
  console.log(`${p.kind.padEnd(9)} ${p.dup.official_url.replace("https://", "")} (${p.dup.id.slice(0, 8)}) → ${p.canon ? p.canon.official_url.replace("https://", "") + " (" + p.canon.id.slice(0, 8) + ")" : "stilllegen"} | Abschnitte ${dupSecs.length}, zugeordnet ${mapping.size}${unmatched.length ? ", ohne Gegenstück: " + unmatched.join(",") : ""} | Fall-Links ${dupLinks.length}`);
  if (p.kind !== "repealed" && dupLinks.some((l: any) => !mapping.has(l.legal_section_id))) { console.log("   ABBRUCH für diese Quelle: Fall-Link auf Abschnitt ohne Gegenstück"); continue; }
  if (dry) continue;

  await sql.begin(async (tx: any) => {
    for (const l of dupLinks) {
      const target = mapping.get(l.legal_section_id)!;
      const exists = await tx`select 1 from public.case_legal_links where case_id=${l.case_id} and legal_section_id=${target} limit 1`;
      if (exists.length) { await tx`delete from public.case_legal_links where id=${l.id}`; droppedLinks++; }
      else { await tx`update public.case_legal_links set legal_section_id=${target} where id=${l.id}`; movedLinks++; }
    }
    for (const [from, to] of mapping) {
      const a = await tx`update public.case_legal_review_flags set legal_section_id=${to} where legal_section_id=${from}`;
      const b = await tx`update public.workflow_step_sources set legal_section_id=${to} where legal_section_id=${from}`;
      const c = await tx`update public.legal_section_references set resolved_section_id=${to} where resolved_section_id=${from}`;
      movedOther += (a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0);
    }
    // Enum legal_source_lifecycle kennt kein "superseded": stillgelegt = "archived";
    // die Art (Dublette/aufgehoben/Auszug) steht über replaced_by_source_id bzw. status fest.
    const lifecycle = "archived";
    const status = p.kind === "repealed" ? "repealed" : "superseded";
    await tx`update public.legal_sources set status=${status}, lifecycle_status=${lifecycle}, replaced_by_source_id=${p.canon?.id ?? null}, updated_at=now() where id=${p.dup.id}`;
    await tx`update public.legal_chunks set active=false where source_id=${p.dup.id}`;
    await tx`update public.legal_chunk_embeddings set invalidated_at=now() where source_id=${p.dup.id} and invalidated_at is null`;
  });
}
console.log(`\n${dry ? "TROCKENLAUF – nichts geschrieben." : "Fertig."} Quellen: ${plan.length} | Fall-Links umgehängt: ${movedLinks}, doppelte entfernt: ${droppedLinks} | sonstige Verweise umgehängt: ${movedOther}`);
await sql.end();
