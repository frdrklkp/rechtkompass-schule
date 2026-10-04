/**
 * Phase 1, Paket C: Quellen-Relink für rote Fälle (04.10.2026).
 *
 * Die Prüfung der 25-Fälle-Charge zeigte: Die Rot-Fälle hängen an falschen oder
 * fehlenden VERKNÜPFUNGEN, nicht (nur) an fehlenden Quellen - z. B. war für einen
 * Haftungsfall "VV 6 Unwetterwarnung" statt VV zu § 57 Aufsicht verlinkt, und
 * mehrfach stand "VwVfG NRW § 65/§ 66" statt § 28 (Anhörung).
 *
 * Aufruf: bun run scripts/_relink-red-quellen.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";

const dry = process.argv.includes("--dry-run");
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

type Ref = { law: string; ref: string } | { id: string };
interface Add { to: Ref; why: string; relevance?: "high" | "medium" }
const PLAN: Record<string, { add: Add[]; removeSectionIds?: string[]; removeRefs?: Array<{ law: string; ref: string }> }> = {
  "d821113c": { // Freistunde / Haftung
    removeSectionIds: [],
    add: [
      { to: { id: "975386e9-ed6b-1f48-8966-4b9f47f9ab8b" }, why: "VV zu § 57 SchulG Nr. 1: Umfang der Aufsichtspflicht der Schule (Unterricht und sonstige Schulveranstaltungen) - Ausgangspunkt für die Frage, ob in der Freistunde eine Aufsichtslücke bestand.", relevance: "high" },
      { to: { id: "dcd63fce-6713-ae97-6e17-3dd5b91e038d" }, why: "VV zu § 57 SchulG Nr. 6: Regelung zum Verlassen des Schulgrundstücks in Freistunden (Aufsichtsorganisation).", relevance: "medium" },
      { to: { law: "GG", ref: "Art 34" }, why: "Art. 34 GG: Bei Amtspflichtverletzung (z. B. verletzte Aufsichtspflicht) haftet grundsätzlich der Dienstherr - nicht die Lehrkraft persönlich.", relevance: "high" },
      { to: { law: "BGB", ref: "§ 839" }, why: "§ 839 BGB: Haftung bei Amtspflichtverletzung; zusammen mit Art. 34 GG Grundlage der Amtshaftung für Aufsichtsfehler.", relevance: "high" },
      { to: { law: "BGB", ref: "§ 832" }, why: "§ 832 BGB: Haftung des Aufsichtspflichtigen für Schäden, die ein Minderjähriger Dritten zufügt.", relevance: "medium" },
      { to: { law: "SGB VII", ref: "§ 106" }, why: "§ 106 SGB VII: Haftungsbeschränkung bei Schülerunfällen zwischen Versicherten - beantwortet, ob der verletzte Schüler den Mitschüler zivilrechtlich in Anspruch nehmen kann.", relevance: "high" },
      { to: { id: "5059a10e-45f2-5d99-ce25-954f5659f45d" }, why: "RdErl. Unfallverhütung/Schülerunfallversicherung: jeder Unfall mit ärztlicher Behandlung ist unverzüglich der Unfallkasse NRW anzuzeigen.", relevance: "high" },
    ],
  },
  "ecd30660": { // Klassenfahrt abgängig
    add: [
      { to: { id: "e17017a0-d3f8-bcdf-f4e5-335ca5f1ecbe" }, why: "Richtlinien für Schulfahrten Nr. 6: Aufsicht, Gefahrvermeidung und Unfallverhütung auf Schulfahrten.", relevance: "high" },
      { to: { id: "1a4cdd57-9367-0318-a51f-daaaedbd0bc8" }, why: "Richtlinien für Schulfahrten Nr. 6.1: Art und Umfang der Aufsicht richten sich nach Gegebenheiten, Alter und Entwicklungsstand - Maßstab für zeitweise Abwesenheit von Schülern.", relevance: "high" },
      { to: { id: "dff8344e-5bb2-50ac-24fa-df02c52390d7" }, why: "Richtlinien für Schulfahrten: bei schwierigen Aufsichtsverhältnissen und mehrtägigen Fahrten ist in der Regel eine weitere Begleitperson mitzunehmen.", relevance: "medium" },
      { to: { id: "975386e9-ed6b-1f48-8966-4b9f47f9ab8b" }, why: "VV zu § 57 SchulG Nr. 1: Umfang der Aufsichtspflicht bei Schulveranstaltungen.", relevance: "medium" },
      { to: { law: "BGB", ref: "§ 832" }, why: "§ 832 BGB: Haftung des Aufsichtspflichtigen für Schäden, die ein Minderjähriger Dritten zufügt.", relevance: "medium" },
    ],
  },
  "967455c2": { // tätlicher Angriff gegen Lehrkraft
    add: [
      { to: { law: "StGB", ref: "§ 223" }, why: "§ 223 StGB: Körperverletzung - strafrechtlicher Rahmen des Angriffs; Strafantrag/Strafanzeige ist Entscheidung der betroffenen Lehrkraft bzw. des Dienstherrn.", relevance: "medium" },
      { to: { law: "StGB", ref: "§ 185" }, why: "§ 185 StGB: Beleidigung - bei begleitenden Beschimpfungen.", relevance: "medium" },
    ],
  },
  "d67d7dc0": { // familiäre Pflicht / Schulpflicht
    add: [
      { to: { law: "KKG", ref: "§ 4" }, why: "§ 4 KKG: Lehrkräfte haben bei Anhaltspunkten für eine Kindeswohlgefährdung Anspruch auf Beratung durch eine insoweit erfahrene Fachkraft und dürfen unter den Voraussetzungen des Absatzes 3 das Jugendamt informieren.", relevance: "high" },
      { to: { law: "SGB VIII", ref: "§ 8a" }, why: "§ 8a SGB VIII: Schutzauftrag der Jugendhilfe bei Kindeswohlgefährdung - Adressat der Mitteilung nach § 4 KKG.", relevance: "medium" },
    ],
  },
  "6fe93ec1": { // ungeklärtes Sorgerecht
    add: [
      { to: { law: "BGB", ref: "§ 1626" }, why: "§ 1626 BGB: Elterliche Sorge - Grundsatz der gemeinsamen Sorge beider Elternteile.", relevance: "high" },
      { to: { law: "BGB", ref: "§ 1629" }, why: "§ 1629 BGB: Vertretung des Kindes - beide Eltern vertreten gemeinschaftlich, bei Gefahr im Verzug Alleinentscheidung.", relevance: "medium" },
      { to: { law: "BGB", ref: "§ 1687" }, why: "§ 1687 BGB: Getrenntlebende Eltern - Alleinentscheidung in Angelegenheiten des täglichen Lebens; Abgrenzung zu Angelegenheiten von erheblicher Bedeutung.", relevance: "high" },
    ],
  },
  "204dbbeb": { // Datenaustausch Betrieb / Gefährdung
    add: [
      { to: { law: "StGB", ref: "§ 34" }, why: "§ 34 StGB: Rechtfertigender Notstand - mögliche Rechtfertigung einer Offenbarung bei gegenwärtiger, nicht anders abwendbarer Gefahr für Leib oder Leben; strikte Verhältnismäßigkeit.", relevance: "medium" },
      { to: { law: "KKG", ref: "§ 4" }, why: "§ 4 KKG: Beratungs- und Mitteilungsbefugnis von Lehrkräften bei Kindeswohlgefährdung (Minderjährige Auszubildende) - Adressat ist das Jugendamt, nicht der Betrieb.", relevance: "medium" },
    ],
  },
  "075f593e": {
    add: [
      { to: { law: "BGB", ref: "§ 1626" }, why: "§ 1626 BGB: Elterliche Sorge - Grundsatz der gemeinsamen Sorge beider Elternteile.", relevance: "high" },
      { to: { law: "BGB", ref: "§ 1687" }, why: "§ 1687 BGB: Getrenntlebende Eltern - Alleinentscheidung in Angelegenheiten des täglichen Lebens; Abgrenzung zu Angelegenheiten von erheblicher Bedeutung.", relevance: "high" },
      { to: { law: "BGB", ref: "§ 1629" }, why: "§ 1629 BGB: Vertretung des Kindes - beide Eltern vertreten gemeinschaftlich, bei Gefahr im Verzug Alleinentscheidung.", relevance: "medium" },
    ],
  },
  "866f6f6f": {
    add: [
      { to: { law: "BGB", ref: "§ 1626" }, why: "§ 1626 BGB: Elterliche Sorge - Grundsatz der gemeinsamen Sorge beider Elternteile.", relevance: "high" },
      { to: { law: "BGB", ref: "§ 1687" }, why: "§ 1687 BGB: Getrenntlebende Eltern - Alleinentscheidung in Angelegenheiten des täglichen Lebens; Abgrenzung zu Angelegenheiten von erheblicher Bedeutung.", relevance: "high" },
      { to: { law: "BGB", ref: "§ 1629" }, why: "§ 1629 BGB: Vertretung des Kindes - beide Eltern vertreten gemeinschaftlich, bei Gefahr im Verzug Alleinentscheidung.", relevance: "medium" },
    ],
  },
  "77be9f6c": {
    add: [
      { to: { law: "BGB", ref: "§ 1626" }, why: "§ 1626 BGB: Elterliche Sorge - Grundsatz der gemeinsamen Sorge beider Elternteile.", relevance: "high" },
      { to: { law: "BGB", ref: "§ 1629" }, why: "§ 1629 BGB: Vertretung des Kindes - beide Eltern vertreten gemeinschaftlich, bei Gefahr im Verzug Alleinentscheidung.", relevance: "medium" },
      { to: { id: "1a4cdd57-9367-0318-a51f-daaaedbd0bc8" }, why: "Richtlinien für Schulfahrten Nr. 6.1: Art und Umfang der Aufsicht richten sich nach Alter, Entwicklungsstand und Gegebenheiten.", relevance: "high" },
      { to: { id: "975386e9-ed6b-1f48-8966-4b9f47f9ab8b" }, why: "VV zu § 57 SchulG Nr. 1: Umfang der Aufsichtspflicht bei Schulveranstaltungen.", relevance: "medium" },
    ],
  },
  "cd6c27e7": {
    add: [
      { to: { law: "KunstUrhG", ref: "§ 22" }, why: "§ 22 KunstUrhG: Bildnisse dürfen nur mit Einwilligung des Abgebildeten verbreitet oder öffentlich zur Schau gestellt werden.", relevance: "high" },
      { to: { law: "KunstUrhG", ref: "§ 23" }, why: "§ 23 KunstUrhG: Ausnahmen vom Einwilligungserfordernis (Zeitgeschichte, Beiwerk, Versammlungen) - mit berechtigtem-Interessen-Vorbehalt.", relevance: "medium" },
      { to: { law: "StGB", ref: "§ 201a" }, why: "§ 201a StGB: Verletzung des höchstpersönlichen Lebensbereichs durch Bildaufnahmen.", relevance: "medium" },
    ],
  },
  "d0c8e68b": {
    add: [
      { to: { law: "KunstUrhG", ref: "§ 22" }, why: "§ 22 KunstUrhG: Bildnisse dürfen nur mit Einwilligung des Abgebildeten verbreitet oder öffentlich zur Schau gestellt werden.", relevance: "high" },
      { to: { law: "StGB", ref: "§ 201" }, why: "§ 201 StGB: Verletzung der Vertraulichkeit des Wortes - Aufnahmen des nichtöffentlich gesprochenen Wortes ohne Einwilligung sind strafbar.", relevance: "high" },
      { to: { law: "StGB", ref: "§ 201a" }, why: "§ 201a StGB: Verletzung des höchstpersönlichen Lebensbereichs durch Bildaufnahmen.", relevance: "medium" },
    ],
  },
  "0e51d263": {
    add: [
      { to: { law: "StGB", ref: "§ 201" }, why: "§ 201 StGB: Verletzung der Vertraulichkeit des Wortes - Aufnahmen des nichtöffentlich gesprochenen Wortes ohne Einwilligung sind strafbar.", relevance: "high" },
      { to: { law: "StGB", ref: "§ 201a" }, why: "§ 201a StGB: Verletzung des höchstpersönlichen Lebensbereichs durch Bildaufnahmen.", relevance: "medium" },
    ],
  },
  "d5e26a6d": {
    add: [
      { to: { law: "StGB", ref: "§ 201" }, why: "§ 201 StGB: Verletzung der Vertraulichkeit des Wortes - Aufnahmen des nichtöffentlich gesprochenen Wortes ohne Einwilligung sind strafbar.", relevance: "high" },
    ],
  },
  "bf2b18c1": {
    add: [
      { to: { law: "DSGVO", ref: "Art 6" }, why: "Art. 6 DSGVO: Rechtmäßigkeit der Verarbeitung - Prüfmaßstab (Einwilligung, Aufgabenerfüllung, berechtigtes Interesse), soweit § 120 SchulG NRW nicht abschließend greift.", relevance: "high" },
      { to: { law: "DSGVO", ref: "Art 22" }, why: "Art. 22 DSGVO: Keine ausschließlich automatisierte Einzelentscheidung mit erheblicher Wirkung - Grenze für KI-Ergebnisse als alleinige Bewertungsgrundlage.", relevance: "medium" },
      { to: { law: "KI-VO", ref: "Kapitel I.Art 4" }, why: "Art. 4 KI-VO: KI-Kompetenz - Betreiber und Nutzer von KI-Systemen müssen über ausreichende Kenntnisse verfügen.", relevance: "medium" },
    ],
  },
  "9591a6d4": {
    add: [
      { to: { law: "DSGVO", ref: "Art 22" }, why: "Art. 22 DSGVO: Keine ausschließlich automatisierte Einzelentscheidung mit erheblicher Wirkung - Grenze für KI-Ergebnisse als alleinige Bewertungsgrundlage.", relevance: "medium" },
      { to: { law: "KI-VO", ref: "Kapitel I.Art 4" }, why: "Art. 4 KI-VO: KI-Kompetenz - Betreiber und Nutzer von KI-Systemen müssen über ausreichende Kenntnisse verfügen.", relevance: "medium" },
      { to: { law: "KI-VO", ref: "Kapitel III.Abschnitt 3.Art 26" }, why: "Art. 26 KI-VO: Pflichten der Betreiber von Hochrisiko-KI-Systemen (Bildung/Bewertung, Anhang III) - Aufsicht, Information der Betroffenen.", relevance: "medium" },
    ],
  },
  "af41ecb0": {
    add: [
      { to: { law: "DSGVO", ref: "Art 6" }, why: "Art. 6 DSGVO: Rechtmäßigkeit der Verarbeitung - Prüfmaßstab (Einwilligung, Aufgabenerfüllung, berechtigtes Interesse), soweit § 120 SchulG NRW nicht abschließend greift.", relevance: "high" },
      { to: { law: "DSGVO", ref: "Art 22" }, why: "Art. 22 DSGVO: Keine ausschließlich automatisierte Einzelentscheidung mit erheblicher Wirkung - Grenze für KI-Ergebnisse als alleinige Bewertungsgrundlage.", relevance: "medium" },
      { to: { law: "KI-VO", ref: "Kapitel I.Art 4" }, why: "Art. 4 KI-VO: KI-Kompetenz - Betreiber und Nutzer von KI-Systemen müssen über ausreichende Kenntnisse verfügen.", relevance: "medium" },
    ],
  },
  "d1bf56f7": {
    add: [
      { to: { law: "DSGVO", ref: "Art 6" }, why: "Art. 6 DSGVO: Rechtmäßigkeit der Verarbeitung - Prüfmaßstab (Einwilligung, Aufgabenerfüllung, berechtigtes Interesse), soweit § 120 SchulG NRW nicht abschließend greift.", relevance: "high" },
      { to: { law: "DSGVO", ref: "Art 7" }, why: "Art. 7 DSGVO: Bedingungen der Einwilligung (Freiwilligkeit, Nachweis, Widerruf).", relevance: "medium" },
    ],
  },
  "f17ffb66": {
    add: [
      { to: { law: "BGB", ref: "§ 823" }, why: "§ 823 BGB: Schadensersatzpflicht - Verkehrssicherungspflicht als Grundlage der Haftung für mangelhafte Spielgeräte.", relevance: "high" },
      { to: { law: "BGB", ref: "§ 839" }, why: "§ 839 BGB: Haftung bei Amtspflichtverletzung (hier: Verkehrssicherungspflicht des Schulträgers als öffentlich-rechtliche Amtspflicht).", relevance: "high" },
      { to: { law: "GG", ref: "Art 34" }, why: "Art. 34 GG: Haftung des Dienstherrn bei Amtspflichtverletzung.", relevance: "high" },
      { to: { law: "SGB VII", ref: "§ 106" }, why: "§ 106 SGB VII: Haftungsbeschränkung bei Schülerunfällen zwischen Versicherten.", relevance: "medium" },
      { to: { law: "SGB VII", ref: "§ 193" }, why: "§ 193 SGB VII: Unfallanzeige - Anzeigepflicht des Unternehmers (Schulträger) bei Unfällen mit mehr als drei Tagen Arbeitsunfähigkeit.", relevance: "medium" },
      { to: { id: "5059a10e-45f2-5d99-ce25-954f5659f45d" }, why: "RdErl. Unfallverhütung/Schülerunfallversicherung: Unfälle mit ärztlicher Behandlung sind unverzüglich der Unfallkasse NRW anzuzeigen.", relevance: "high" },
    ],
  },
  "a237e35f": {
    add: [
      { to: { law: "StGB", ref: "§ 223" }, why: "§ 223 StGB: Körperverletzung - strafrechtlicher Rahmen von Gewalt zwischen Schülern.", relevance: "medium" },
      { to: { law: "StGB", ref: "§ 32" }, why: "§ 32 StGB: Notwehr - Verteidigung gegen einen gegenwärtigen rechtswidrigen Angriff; Grenzen (Erforderlichkeit) sind für die Bewertung von Gegenwehr maßgeblich.", relevance: "medium" },
      { to: { law: "StGB", ref: "§ 185" }, why: "§ 185 StGB: Beleidigung - strafrechtliche Einordnung ehrverletzender Äußerungen.", relevance: "medium" },
    ],
  },
  "4af5f1fa": {
    add: [
      { to: { law: "StGB", ref: "§ 223" }, why: "§ 223 StGB: Körperverletzung - strafrechtlicher Rahmen von Gewalt zwischen Schülern.", relevance: "medium" },
      { to: { law: "StGB", ref: "§ 32" }, why: "§ 32 StGB: Notwehr - Verteidigung gegen einen gegenwärtigen rechtswidrigen Angriff; Grenzen (Erforderlichkeit) sind für die Bewertung von Gegenwehr maßgeblich.", relevance: "medium" },
    ],
  },
  "71c8a9d1": {
    add: [
      { to: { law: "StGB", ref: "§ 185" }, why: "§ 185 StGB: Beleidigung - strafrechtliche Einordnung ehrverletzender Äußerungen.", relevance: "medium" },
      { to: { law: "GG", ref: "Art 3" }, why: "Art. 3 GG: Gleichheitssatz und Diskriminierungsverbote (u. a. Herkunft, Behinderung).", relevance: "medium" },
    ],
  },
  "5dd59479": {
    add: [
      { to: { law: "BeamtStG", ref: "Abschnitt 6.§ 37" }, why: "§ 37 BeamtStG: Verschwiegenheitspflicht der Beamtinnen und Beamten über dienstlich bekannt gewordene Angelegenheiten; Ausnahmen und Aussagegenehmigung.", relevance: "high" },
    ],
  },
  "505bf2ed": {
    add: [
      { to: { law: "BeamtStG", ref: "Abschnitt 6.§ 50" }, why: "§ 50 BeamtStG: Personalakte - Führung, Akteneinsicht und Grundsatz der Vollständigkeit/Wahrheitspflicht.", relevance: "high" },
      { to: { law: "LBG NRW", ref: "Abschnitt 5.§ 86" }, why: "§ 86 LBG NRW: Auskunft aus der Personalakte und Einsichtsrecht der Beamtin/des Beamten.", relevance: "high" },
      { to: { law: "LBG NRW", ref: "Abschnitt 5.§ 83" }, why: "§ 83 LBG NRW: Personalakten - allgemeine Regeln (Zugang, Zweckbindung, Vertraulichkeit).", relevance: "medium" },
    ],
    removeRefs: [{ law: "VwVfG NRW", ref: "§ 4" }],
  },
  "491a57b5": {
    add: [
      { to: { id: "488388bc-70bf-425b-a3c3-630039c0b23e" }, why: "SchulG § 41: Schulpflicht und Pflichten zur Teilnahme - Grundlage für das Handeln bei Fehlzeiten.", relevance: "high" },
      { to: { id: "fb4dc94e-3bb1-492a-abc0-bc450091066a" }, why: "SchulG § 43: Pflichten der Schülerinnen und Schüler (u. a. regelmäßige Teilnahme, Entschuldigung).", relevance: "high" },
    ],
    removeRefs: [{ law: "VwVfG NRW", ref: "§ 1" }],
  },
  "d41e220a": {
    add: [
      { to: { law: "VwVfG NRW", ref: "§ 23" }, why: "§ 23 VwVfG NRW: Amtssprache ist Deutsch; Regelungen zu fremdsprachigen Eingaben und zur Übersetzung - einschlägig für die Frage der Verständigung und der Dolmetscherkosten.", relevance: "high" },
    ],
    removeRefs: [{ law: "VwVfG NRW", ref: "§ 8" }],
  },
};

const ANHOERUNG_ID = "7c3e3454-22ec-0423-e26d-c038c0f9f869"; // VwVfG NRW § 28

function sentenceStart(text: string, max = 260): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return (i > 80 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, "")) + (i > 80 ? "" : " …");
}

async function resolve(ref: Ref): Promise<{ id: string; content: string; label: string }> {
  if ("id" in ref) {
    const { data } = await db.from("legal_sections").select("id,content,reference").eq("id", ref.id).maybeSingle();
    if (!data) throw new Error("Abschnitt nicht gefunden: " + ref.id);
    return { id: data.id, content: data.content, label: data.reference };
  }
  const { data: srcs } = await db.from("legal_sources").select("id").eq("short_name", ref.law).eq("status", "active");
  const { data: all } = await db.from("legal_sections").select("id,content,reference").in("source_id", (srcs ?? []).map((s: any) => s.id));
  // BGB-Referenzen tragen ein "Titel N."-Präfix ("Titel 27.§ 839").
  const data = (all ?? []).filter((r: any) => r.reference === ref.ref || r.reference.endsWith("." + ref.ref));
  if (!data?.length) throw new Error(`Abschnitt nicht gefunden: ${ref.law} ${ref.ref}`);
  return { id: data[0].id, content: data[0].content, label: `${ref.law} ${ref.ref}` };
}

async function main() {
  const { data: reds } = await db.from("practice_cases").select("id,title").in("legal_review_status", ["rot"]).eq("workflow_status", "published");
  const batchIds: string[] = JSON.parse(await Bun.file(process.env.IDS_FILE ?? "").text().catch(() => "[]"));
  const targets = (reds ?? []).filter((c: any) => batchIds.includes(c.id));
  console.log(`${targets.length} rote Fälle aus der Liste.`);
  const anh = await resolve({ id: ANHOERUNG_ID });
  for (const c of targets) {
    const plan = PLAN[c.id.slice(0, 8)];
    const { data: links } = await db.from("case_legal_links").select("id,legal_section_id,legal_sections(reference,source_id,legal_sources(short_name))").eq("case_id", c.id);
    const have = new Set((links ?? []).map((l: any) => l.legal_section_id));
    // 1) falsche VwVfG-Verweise (§ 65/§ 66) → § 28
    const wrongVw = (links ?? []).filter((l: any) => l.legal_sections?.legal_sources?.short_name === "VwVfG NRW" && ["§ 65", "§ 66"].includes(l.legal_sections.reference));
    const rows: any[] = [];
    if (wrongVw.length && !have.has(anh.id)) rows.push({ case_id: c.id, legal_section_id: anh.id, relevance: "high", explanation: "§ 28 VwVfG NRW: Anhörung vor Maßnahmen, die in Rechte eines Beteiligten eingreifen (ersetzt den fälschlich verknüpften § 65/§ 66).", content_summary: sentenceStart(anh.content), content_summary_kind: "wortlaut" });
    // 2) geplante Ergänzungen
    for (const a of plan?.add ?? []) {
      const s = await resolve(a.to);
      if (have.has(s.id)) continue;
      rows.push({ case_id: c.id, legal_section_id: s.id, relevance: a.relevance ?? "medium", explanation: a.why, content_summary: sentenceStart(s.content), content_summary_kind: "wortlaut" });
    }
    // 3) themenfremde Alt-Links (nur wo ausdrücklich benannt)
    const remove = (links ?? []).filter((l: any) => wrongVw.includes(l) || (plan?.removeSectionIds ?? []).includes(l.legal_section_id)
      || (plan?.removeRefs ?? []).some((r) => l.legal_sections?.legal_sources?.short_name === r.law && l.legal_sections?.reference === r.ref));
    if (c.id.startsWith("d821113c")) {
      const { data: unw } = await db.from("case_legal_links").select("id,legal_sections(content)").eq("case_id", c.id);
      for (const l of unw ?? []) if (/Unwetter/i.test(l.legal_sections?.content ?? "")) remove.push(l);
    }
    console.log(`${c.id.slice(0, 8)} ${c.title.slice(0, 50)}: +${rows.length} Links, -${remove.length}`);
    for (const r of rows) console.log("   +", r.explanation.slice(0, 90));
    if (dry) continue;
    if (rows.length) { const { error } = await db.from("case_legal_links").insert(rows); if (error) throw new Error(error.message); }
    if (remove.length) { const { error } = await db.from("case_legal_links").delete().in("id", remove.map((r: any) => r.id)); if (error) throw new Error(error.message); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
