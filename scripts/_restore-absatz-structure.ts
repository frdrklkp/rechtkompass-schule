/**
 * Absatzgliederung der Gesetzestexte wiederherstellen (20.10.2026).
 *
 * Fund: Beim Import wurden die Absätze jedes Paragrafen zu einem Fließtext
 * zusammengefügt (collectText in _import-backlog-sources.ts) - "(1)", "(2)"
 * gingen verloren. Weder die Claim-Validierung noch die deterministische
 * Zitatprüfung (src/lib/citationIntegrity.ts) konnten so feststellen, ob
 * "§ 28 Abs. 2 VwVfG NRW" oder "Art. 6 Abs. 1 DSGVO" stimmt. Nur das SchulG
 * liegt zeilenweise je Absatz vor und bleibt unberührt.
 *
 * Vorgehen je Quelle: amtliche Fassung laden (gesetze-im-internet.de XML,
 * recht.nrw.de, bass.schule.nrw, EU-Amtsblatt), je Paragraf/Artikel die
 * Absätze bestimmen und dem gespeicherten Abschnitt über Textähnlichkeit
 * zuordnen (nicht nur über die Nummer - die APO-BK-Anlagen zählen je neu):
 *   Ähnlichkeit >= 0.85 -> Text mit Absatzmarken neu schreiben
 *   Ähnlichkeit >= 0.60 -> nur metadata.absatz_count setzen, Text bleibt
 *   darunter           -> nichts ändern (andere Fassung oder Fehlzuordnung)
 * Suchabschnitte (legal_chunks) erhalten denselben Text; die Suchvektoren
 * bleiben, weil sich nur die Marken ändern.
 *
 * Aufruf: bun run scripts/_restore-absatz-structure.ts [--apply] [--only GG,DSGVO] [--backup datei.json]
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null;
const backupIdx = args.indexOf("--backup");
const BACKUP = backupIdx >= 0 ? args[backupIdx + 1] : "absatz-backup.json";
const showIdx = args.indexOf("--show");
const SHOW = new Set(showIdx >= 0 ? args[showIdx + 1].split(",") : []);
const SCHULG_SOURCE_ID = "c03ef1d3-084b-4dcf-a398-6ca0c4d98ceb";
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

interface Block { key: string; absaetze: string[] }

const decode = (s: string) => s
  .replace(/&nbsp;|&#160;| /g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const segmentsOf = (html: string) => decode(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, "|"))
  .split("|").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
const keyOf = (kind: string, num: string) => `${/^(Art|Artikel)/i.test(kind) ? "a" : "p"}${num.toLowerCase()}`;

/** Absätze aus einer Segmentfolge: "(n) ..." beginnt einen neuen Absatz, alles andere hängt an. */
const UI_NOISE = /^(Mehr|Paragraph ausdrucken|Paragraph Link kopieren|Link kopiert|Der Link zum Pragraph wurde kopiert|Der Link zum Paragraph wurde kopiert|Schließen|Drucken|nach oben)$/i;
function absaetzeOf(rawSegs: string[]): string[] {
  let segs = rawSegs.filter((s) => !UI_NOISE.test(s));
  // Vorspann vor "(1)" (Fußnoten, Bedienelemente) gehört nicht zum ersten Absatz
  const first = segs.findIndex((s) => /^\(1\)\s/.test(s));
  if (first > 0) segs = segs.slice(first);
  const out: string[] = [];
  for (const s of segs) {
    if (/^\(\d+[a-z]?\)\s/.test(s) || out.length === 0) out.push(s);
    else out[out.length - 1] += " " + s;
  }
  return out.map((a) => a.replace(/\s+([,.;:)])/g, "$1").replace(/\(\s+/g, "(").trim());
}

/** HTML-Seite mit Überschriften "§ N" bzw. "Artikel N" in Blöcke zerlegen. */
function blocksFromHtml(html: string, headingRe: RegExp): Block[] {
  const segs = segmentsOf(html);
  const blocks: Block[] = [];
  let cur: { key: string; segs: string[] } | null = null;
  for (let i = 0; i < segs.length; i++) {
    const m = segs[i].match(headingRe);
    const prev = segs[i - 1] ?? "";
    const next = segs[i + 1] ?? "";
    // Querverweise "(§ 9)" als Link sind keine Überschrift
    const isHeading = m && !/[(\[]$|nach$|gemäß$|und$|des$|der$/.test(prev) && /^[A-ZÄÖÜ(]/.test(next) && !/^\)/.test(next);
    if (isHeading) {
      if (cur) blocks.push({ key: cur.key, absaetze: absaetzeOf(cur.segs) });
      cur = { key: keyOf(m![1], m![2]), segs: [] };
      // Überschrift (Titel) überspringen, wenn sie nicht schon ein Absatz ist
      if (!/^\(\d+\)/.test(next)) i++;
      continue;
    }
    if (cur) cur.segs.push(segs[i]);
  }
  if (cur) blocks.push({ key: cur.key, absaetze: absaetzeOf(cur.segs) });
  return blocks.filter((b) => b.absaetze.length && b.absaetze.join(" ").length > 20);
}

/** gesetze-im-internet.de: amtliche XML-Fassung, je <P> ein Absatz. */
function blocksFromGiiXml(xml: string): Block[] {
  const blocks: Block[] = [];
  for (const norm of xml.split("<norm ").slice(1)) {
    const enbez = norm.match(/<enbez>([^<]+)<\/enbez>/)?.[1]?.trim();
    const m = enbez?.match(/^(§|Art)\s*(\d+[a-z]?)$/);
    if (!m) continue;
    const content = norm.match(/<Content>([\s\S]*?)<\/Content>/)?.[1];
    if (!content) continue;
    const ps = [...content.matchAll(/<P>([\s\S]*?)<\/P>/g)].map((p) => decode(p[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()).filter(Boolean);
    const marked = ps.filter((p) => /^\(\d+[a-z]?\)\s/.test(p));
    blocks.push({ key: keyOf(m[1], m[2]), absaetze: marked.length ? absaetzeOf(ps) : [ps.join(" ")] });
  }
  return blocks;
}

async function officialBlocks(url: string): Promise<Block[]> {
  if (url.includes("gesetze-im-internet.de")) {
    const slug = new URL(url).pathname.split("/").filter(Boolean)[0];
    const dir = mkdtempSync(join(tmpdir(), "gii-"));
    const zip = join(dir, "x.zip");
    writeFileSync(zip, Buffer.from(await (await fetch(`https://www.gesetze-im-internet.de/${slug}/xml.zip`)).arrayBuffer()));
    execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
    const xmlFile = readdirSync(dir).find((f) => f.endsWith(".xml"))!;
    return blocksFromGiiXml(readFileSync(join(dir, xmlFile), "utf8"));
  }
  if (url.includes("eur-lex.europa.eu")) {
    const celex = url.match(/CELEX:(\w+)/)![1];
    const res = await fetch(`http://publications.europa.eu/resource/celex/${celex}`, { headers: { Accept: "application/xhtml+xml", "Accept-Language": "deu" } });
    return blocksFromHtml(await res.text(), /^(Artikel)\s+(\d+[a-z]?)$/);
  }
  const html = await (await fetch(url)).text();
  return blocksFromHtml(html, /^(§)\s*(\d+[a-z]?)$/);
}

const words = (s: string) => new Set(s.toLowerCase().replace(/\(\d+[a-z]?\)/g, " ").match(/[a-zäöüß]{4,}/g) ?? []);
function similarity(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.max(A.size, B.size);
}

const { data: sources } = await db.from("legal_sources").select("id,short_name,title,official_url,source_type").eq("status", "active");
const targets = sources.filter((s: any) => s.id !== SCHULG_SOURCE_ID && s.official_url && (s.source_type === "law" || /Ausbildung und Prüfung in den Bildungsgängen des Berufskollegs|Abiturprüfung in der gymnasialen Oberstufe/.test(s.title)))
  .filter((s: any) => !ONLY || ONLY.has(s.short_name));

const backup: any[] = [];
const total = { rewritten: 0, countOnly: 0, skipped: 0, noMatch: 0 };
for (const src of targets) {
  let blocks: Block[] = [];
  try { blocks = await officialBlocks(src.official_url); } catch (e: any) { console.log(`${src.short_name}: Abruf fehlgeschlagen (${e.message})`); continue; }
  const byKey = new Map<string, Block[]>();
  for (const b of blocks) byKey.set(b.key, [...(byKey.get(b.key) ?? []), b]);
  const { data: secs } = await db.from("legal_sections").select("id,reference,title,content,metadata").eq("source_id", src.id);
  const stat = { rewritten: 0, countOnly: 0, skipped: 0, noMatch: 0, multi: 0 };
  for (const sec of secs) {
    const last = String(sec.reference ?? "").split(".").pop()!.trim();
    const m = last.match(/^(§|Art\.?)\s*(\d+[a-z]?)$/);
    if (!m) { stat.noMatch++; continue; }
    const cands = byKey.get(keyOf(m[1], m[2])) ?? [];
    if (!cands.length) { stat.noMatch++; continue; }
    const scored = cands.map((b) => ({ b, sim: similarity(sec.content ?? "", b.absaetze.join(" ")) })).sort((x, y) => y.sim - x.sim);
    const best = scored[0];
    if (best.sim < 0.6) { stat.skipped++; continue; }
    const n = best.b.absaetze.length;
    const meta = { ...(sec.metadata ?? {}), absatz_count: n, absatz_basis: `amtlich ${new Date().toISOString().slice(0, 10)}` };
    const rewrite = best.sim >= 0.85 && n > 1;
    if (SHOW.has(`${src.short_name}:${last}`)) console.log(`  >> ${src.short_name} ${sec.reference} sim=${best.sim.toFixed(2)} Absätze=${n}\n${best.b.absaetze.map((x) => "     " + x.slice(0, 110)).join("\n")}`);
    const newContent = rewrite ? best.b.absaetze.join("\n") : sec.content;
    if (rewrite) stat.rewritten++; else stat.countOnly++;
    if (!APPLY) continue;
    backup.push({ id: sec.id, content: sec.content, metadata: sec.metadata });
    const upd: any = { metadata: meta };
    if (rewrite) { upd.content = newContent; upd.full_text = newContent; }
    const { error } = await db.from("legal_sections").update(upd).eq("id", sec.id);
    if (error) throw new Error(`${src.short_name} ${sec.reference}: ${error.message}`);
    if (rewrite) {
      const { data: chunks } = await db.from("legal_chunks").select("id,content").eq("primary_section_id", sec.id);
      for (const ch of chunks ?? []) {
        if (!ch.content?.includes(sec.content)) continue;
        const c = ch.content.replace(sec.content, newContent);
        await db.from("legal_chunks").update({ content: c, normalized_content: c }).eq("id", ch.id);
      }
    }
  }
  for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += (stat as any)[k];
  console.log(`${(src.short_name ?? src.title.slice(0, 20)).padEnd(10)} amtlich ${String(blocks.length).padStart(4)} | gespeichert ${String(secs.length).padStart(4)} | neu gegliedert ${stat.rewritten} | nur Absatzzahl ${stat.countOnly} | abweichend ${stat.skipped} | ohne Gegenstück ${stat.noMatch}`);
}
if (APPLY) writeFileSync(BACKUP, JSON.stringify(backup));
console.log(APPLY ? "ANGEWENDET" : "TROCKENLAUF", total);
