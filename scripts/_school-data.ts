/**
 * Mandantenkonzept Stufe 3: Export und Löschung je Schule (05.10.2026).
 *
 * Export (Art. 15/20 DSGVO, Austritt):
 *   bun run scripts/_school-data.ts export --school "BK Olsberg" [--out exports]
 *   → exports/<kurzname>_<datum>.json (vollständig) und .md (lesbare Fassung)
 *
 * Löschung (30 Tage nach Austritt, nach Export):
 *   bun run scripts/_school-data.ts delete --school "BK Olsberg" --confirm "BK Olsberg" [--dry-run] [--force]
 *   Voraussetzungen: Status "left", Austritt ≥ 30 Tage her, Exportdatei vorhanden
 *   (--force übergeht die Fristprüfung, NIE den Export). --dry-run zählt nur.
 *   Löscht alle schulgebundenen Zeilen (Kindtabellen per CASCADE), die
 *   Mitgliedschaften und Einladungen, die Nutzerkonten der Mitglieder
 *   (user_profiles folgt per CASCADE) und anonymisiert audit_logs. Die Schule
 *   selbst bleibt als Stammsatz (Status "left") für die Vertragsakte erhalten.
 *   Schreibt ein Löschprotokoll ohne Personendaten nach exports/.
 *
 * Läuft mit der Service-Rolle (RLS gilt nicht) - nur vom Betreiber auszuführen.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name: string) => args.includes(name);
const schoolKey = opt("--school");
const outDir = opt("--out") ?? "exports";
if (!cmd || !["export", "delete"].includes(cmd) || !schoolKey) {
  console.error("Aufruf: bun run scripts/_school-data.ts export|delete --school <Kurzname> [--out dir] [--confirm <Kurzname>] [--dry-run] [--force]");
  process.exit(2);
}

const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

// Schulgebundene Tabellen (school_id); Kindtabellen hängen per CASCADE daran.
const SCHOOL_TABLES = [
  "copilot_conversations",
  "workflow_execution_sessions",
  "case_documents",
  "case_files",
  "pilot_survey_responses",
  "case_feedback_reports",
  "favorites",
] as const;

async function all(table: string, filter: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(db.from(table).select("*")).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadSchool() {
  const { data, error } = await db.from("schools").select("*").eq("short_name", schoolKey).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Schule mit Kurzname "${schoolKey}" nicht gefunden.`);
  return data as { id: string; name: string; short_name: string; status: string; left_at: string | null; [k: string]: unknown };
}

async function collect(school: { id: string }) {
  const members = await all("school_members", (q) => q.eq("school_id", school.id));
  const userIds = members.map((m) => m.user_id);
  const profiles = userIds.length ? await all("user_profiles", (q) => q.in("id", userIds)) : [];
  const invitations = await all("school_invitations", (q) => q.eq("school_id", school.id));
  const perTable: Record<string, any[]> = {};
  for (const t of SCHOOL_TABLES) perTable[t] = await all(t, (q) => q.eq("school_id", school.id));
  const sessionIds = perTable.copilot_conversations.map((c) => c.session_id);
  const turns = sessionIds.length ? await all("copilot_conversation_turns", (q) => q.in("session_id", sessionIds)) : [];
  const wfIds = perTable.workflow_execution_sessions.map((s) => s.id);
  const wfSteps = wfIds.length ? await all("workflow_execution_steps", (q) => q.in("session_id", wfIds)) : [];
  const wfDocs = wfIds.length ? await all("workflow_session_documents", (q) => q.in("session_id", wfIds)) : [];
  const wfEvents = wfIds.length ? await all("workflow_events", (q) => q.in("session_id", wfIds)) : [];
  return { members, profiles, invitations, perTable, turns, wfSteps, wfDocs, wfEvents, userIds };
}

const d = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("de-DE") : "–");

function renderMarkdown(school: any, c: Awaited<ReturnType<typeof collect>>): string {
  const prof = new Map(c.profiles.map((p) => [p.id, p]));
  const lines: string[] = [];
  lines.push(`# Datenexport ${school.name}`, "", `Stand: ${new Date().toLocaleString("de-DE")} · Status der Schule: ${school.status}${school.left_at ? ` · Austritt ${d(school.left_at)}` : ""}`, "");
  lines.push("Dieser Export enthält alle Daten, die RechtKompass Schule dieser Schule zuordnet. Die gemeinsamen Inhalte (Fallsammlung, Rechtsquellen, Vorlagen) enthalten keine Personendaten und sind nicht Teil des Exports.", "");
  lines.push("## Mitglieder", "", "| Name | E-Mail | Rolle | Status | Mitglied seit |", "| --- | --- | --- | --- | --- |");
  for (const m of c.members) { const p = prof.get(m.user_id); lines.push(`| ${p?.display_name ?? "–"} | ${p?.email ?? m.user_id} | ${m.school_role} | ${m.status} | ${d(m.created_at)} |`); }
  lines.push("", `## Offene und vergangene Einladungen (${c.invitations.length})`, "");
  for (const i of c.invitations) lines.push(`- ${i.email} · eingeladen ${d(i.created_at)} · ${i.accepted_at ? "angenommen " + d(i.accepted_at) : i.revoked_at ? "widerrufen" : "offen bis " + d(i.expires_at)}`);
  const turnsBySession = new Map<string, any[]>();
  for (const t of c.turns) turnsBySession.set(t.session_id, [...(turnsBySession.get(t.session_id) ?? []), t]);
  for (const m of c.members) {
    const p = prof.get(m.user_id);
    const who = p?.display_name ? `${p.display_name} (${p.email})` : (p?.email ?? m.user_id);
    lines.push("", `## ${who}`, "");
    const conv = c.perTable.copilot_conversations.filter((x) => x.user_id === m.user_id);
    lines.push(`### Copilot-Gespräche (${conv.length})`, "");
    for (const s of conv) {
      lines.push(`- Sitzung vom ${d(s.created_at)}${s.case_id ? ` · Fall ${s.case_id}` : ""}`);
      for (const t of (turnsBySession.get(s.session_id) ?? []).sort((a, b) => a.seq - b.seq)) lines.push(`    - ${t.role === "user" ? "Frage" : "Antwort"} (${d(t.at)}): ${(t.question ?? t.answer_summary ?? "").toString().replace(/\s+/g, " ")}`);
    }
    const wf = c.perTable.workflow_execution_sessions.filter((x) => x.user_id === m.user_id);
    lines.push("", `### Vorgänge (${wf.length})`, "");
    for (const s of wf) {
      lines.push(`- Vorgang ${s.id} · Status ${s.session_status} · angelegt ${d(s.created_at)}`);
      for (const st of c.wfSteps.filter((x) => x.session_id === s.id)) if (st.note) lines.push(`    - Notiz: ${String(st.note).replace(/\s+/g, " ")}`);
      for (const doc of c.wfDocs.filter((x) => x.session_id === s.id)) lines.push(`    - Dokument „${doc.title}" (${doc.status}, ${d(doc.created_at)}):`, "", "```", String(doc.markdown ?? ""), "```", "");
    }
    const docs = c.perTable.case_documents.filter((x) => x.created_by === m.user_id);
    lines.push(`### Dokumente zu Fällen (${docs.length})`, "");
    for (const doc of docs) lines.push(`- „${doc.title}" (${doc.status}, ${d(doc.created_at)}):`, "", "```", String(doc.content ?? ""), "```", "");
    const files = c.perTable.case_files.filter((x) => x.owner_id === m.user_id);
    if (files.length) { lines.push(`### Fallakten (${files.length})`, ""); for (const f of files) lines.push(`- ${f.file_no ?? f.id} · „${f.title}" · ${f.category ?? "–"} · angelegt ${d(f.created_at)}${f.closed_at ? ` · geschlossen ${d(f.closed_at)}` : ""} (Inhalt im JSON-Export)`); }
    const sv = c.perTable.pilot_survey_responses.filter((x) => x.user_id === m.user_id);
    if (sv.length) { lines.push("", "### Umfrageantworten", ""); for (const r of sv) lines.push(`- Nutzung ${r.nutzung} · hilfreich ${r.hilfreich}/5 · wichtigste Funktion ${r.top_funktion} · Empfehlung ${r.empfehlung}${r.fehlendes_thema ? ` · fehlendes Thema: ${r.fehlendes_thema}` : ""}${r.verbesserung ? ` · Verbesserung: ${r.verbesserung}` : ""}`); }
    const fb = c.perTable.case_feedback_reports.filter((x) => x.user_id === m.user_id);
    if (fb.length) { lines.push("", "### Fehlermeldungen", ""); for (const r of fb) lines.push(`- ${d(r.created_at)} · ${r.report_type} · ${String(r.message).replace(/\s+/g, " ")}`); }
  }
  return lines.join("\n");
}

async function doExport() {
  const school = await loadSchool();
  const c = await collect(school);
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const base = join(outDir, `${school.short_name.replace(/[^\w-]+/g, "_")}_${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), school, ...c }, null, 1));
  writeFileSync(`${base}.md`, renderMarkdown(school, c));
  const counts = Object.fromEntries(Object.entries(c.perTable).map(([k, v]) => [k, v.length]));
  console.log(`Export geschrieben: ${base}.json und ${base}.md`);
  console.log(`Mitglieder ${c.members.length} · Einladungen ${c.invitations.length} · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")} · Gesprächsbeiträge ${c.turns.length} · Vorgangsschritte ${c.wfSteps.length}`);
}

async function doDelete() {
  const school = await loadSchool();
  const dry = flag("--dry-run");
  const force = flag("--force");
  if (opt("--confirm") !== school.short_name) throw new Error(`Bestätigung fehlt: --confirm "${school.short_name}"`);
  if (!dry) {
    if (school.status !== "left") throw new Error(`Schule hat Status "${school.status}", nicht "left". Erst Austritt setzen.`);
    const days = school.left_at ? (Date.now() - Date.parse(school.left_at)) / 864e5 : -1;
    if (days < 30 && !force) throw new Error(`Austritt liegt erst ${Math.max(0, Math.floor(days))} Tage zurück (Frist 30 Tage). --force nur mit dokumentiertem Grund.`);
    const prefix = school.short_name.replace(/[^\w-]+/g, "_") + "_";
    const exports = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.startsWith(prefix) && f.endsWith(".json")) : [];
    if (exports.length === 0) throw new Error(`Kein Export für ${school.short_name} in ${outDir}/ gefunden. Erst exportieren.`);
  }
  const c = await collect(school);
  const plan: Array<[string, number]> = [
    ...SCHOOL_TABLES.map((t) => [t, c.perTable[t].length] as [string, number]),
    ["copilot_conversation_turns (per CASCADE)", c.turns.length],
    ["workflow_execution_steps/documents/events (per CASCADE)", c.wfSteps.length + c.wfDocs.length + c.wfEvents.length],
    ["school_invitations", c.invitations.length],
    ["school_members", c.members.length],
    ["auth.users + user_profiles der Mitglieder", c.userIds.length],
  ];
  console.log(`${dry ? "TROCKENLAUF" : "LÖSCHUNG"} ${school.name}:`);
  for (const [t, n] of plan) console.log(`  ${t}: ${n}`);
  if (dry) return;

  for (const t of SCHOOL_TABLES) {
    const { error } = await db.from(t).delete().eq("school_id", school.id);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  const { error: e1 } = await db.from("school_invitations").delete().eq("school_id", school.id); if (e1) throw new Error(e1.message);
  const { error: e2 } = await db.from("school_members").delete().eq("school_id", school.id); if (e2) throw new Error(e2.message);
  let deletedUsers = 0;
  for (const uid of c.userIds) {
    // Nutzerkonto nur löschen, wenn es keine Redaktionsrolle trägt (Betreiberkonten bleiben).
    const prof = c.profiles.find((p) => p.id === uid);
    if (prof && prof.role !== "teacher") { console.log(`  Konto ${prof.email} behält Rolle ${prof.role}, nicht gelöscht.`); continue; }
    const { error } = await db.auth.admin.deleteUser(uid);
    if (error) console.log(`  Konto ${uid}: ${error.message}`); else deletedUsers++;
  }
  if (c.userIds.length) { const { error } = await db.from("audit_logs").update({ user_id: null }).in("user_id", c.userIds); if (error) console.log("  audit_logs:", error.message); }
  mkdirSync(outDir, { recursive: true });
  const protocol = { deletedAt: new Date().toISOString(), school: { id: school.id, name: school.name, short_name: school.short_name, left_at: school.left_at }, counts: Object.fromEntries(plan), deletedUsers };
  const file = join(outDir, `${school.short_name.replace(/[^\w-]+/g, "_")}_loeschprotokoll_${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify(protocol, null, 1));
  console.log(`Gelöscht. Konten entfernt: ${deletedUsers}. Löschprotokoll: ${file}`);
}

(cmd === "export" ? doExport() : doDelete()).catch((e) => { console.error("FEHLER:", e instanceof Error ? e.message : e); process.exit(1); });
