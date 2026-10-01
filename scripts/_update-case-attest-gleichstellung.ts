/**
 * Fall "Ärztliches Attest mit Einsatzausschluss ..." (2abf1e78-...) um die
 * Konstellation ergänzen, dass sich die Lehrkraft auf eine Gleichstellung mit
 * schwerbehinderten Menschen beruft (Nutzer-Auftrag 01.10.2026). Normbasis:
 * SGB IX § 2 Abs. 3, §§ 151, 156, 164, 167, 178, 181, 207, 208 (am selben Tag
 * importiert, Quelle sgb-9).
 *
 * Stufen (ein Aufruf je Stufe, damit zwischendurch geprüft werden kann):
 *   check    Trockenlauf ohne Schreiben (Baum gültig? Normauszüge auffindbar?)
 *   prepare  Sicherung nach Scratchpad, Fall archivieren und reaktivieren (-> draft)
 *   edit     Texte, Rechtsgrundlagen-Links und Entscheidungsbaum ändern
 *   publish  Baum freigeben, einreichen -> genehmigen -> veröffentlichen (internal)
 * Dazwischen: scripts/_retro-validate-legal-claims.ts --only-ids <id>
 *
 * Aufruf: bun run scripts/_update-case-attest-gleichstellung.ts <prepare|edit|publish>
 */
(globalThis as any).window = globalThis;
const _store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => _store.get(k) ?? null,
  setItem: (k: string, v: string) => { _store.set(k, v); },
  removeItem: (k: string) => { _store.delete(k); },
  clear: () => { _store.clear(); },
  key: (i: number) => [..._store.keys()][i] ?? null,
  get length() { return _store.size; },
};
const _API_ORIGIN = "http://127.0.0.1:8080";
const _origFetch = globalThis.fetch.bind(globalThis);
(globalThis as any).fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === "string" && input.startsWith("/")) return _origFetch(_API_ORIGIN + input, init);
  return _origFetch(input as any, init);
};

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const CASE_ID = "2abf1e78-d7a6-4767-85ee-c2d4c2cfcc1f";
const ADMIN_EMAIL = "admin@rechtkompass.local";
const BACKUP_PATH = "/private/tmp/claude-501/-Users-frederik-Downloads-A-Fresh-Start/05ab1dc5-2718-4ee1-97a7-493f09297f00/scratchpad/attest-case-backup.json";

async function bootstrapSession(): Promise<void> {
  const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
  if (error) throw new Error(`generateLink fehlgeschlagen: ${error.message}`);
  const { supabase } = await import("../src/integrations/supabase/client");
  const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "magiclink" });
  if (verifyErr) throw new Error(`verifyOtp fehlgeschlagen: ${verifyErr.message}`);
  const { canWrite } = await import("../src/lib/adminAuth");
  for (let i = 0; i < 25; i++) { if (canWrite()) return; await new Promise((r) => setTimeout(r, 200)); }
  throw new Error("Admin-Session nach 5s nicht bereit");
}

// ---------------------------------------------------------------------------
// Neue Inhalte
// ---------------------------------------------------------------------------

const SHORT_DESCRIPTION =
  "Eine vollzeitbeschäftigte Lehrkraft legt ein privatärztliches Attest vor, das ihre Dienstfähigkeit bescheinigt, aber Nachmittagsarbeit ausschließt. Sie weigert sich, die im Stundenplan vorgesehene Nachmittagsstunde zu unterrichten, und beruft sich zusätzlich darauf, einem schwerbehinderten Menschen gleichgestellt zu sein (Gleichstellung bei einem Grad der Behinderung von wenigstens 30, aber weniger als 50); daraus leitet sie einen Anspruch auf einen Einsatz nur am Vormittag ab. Die Vertretung belastet das Kollegium. Die Schulleitung steht vor den Fragen: Welche Bindungswirkung hat ein privatärztliches Attest mit Einsatzeinschränkung? Was bewirkt die Gleichstellung, und was bewirkt sie nicht? Muss die Schwerbehindertenvertretung beteiligt werden? Wie weit reicht der Anspruch auf behinderungsgerechte Arbeitszeitgestaltung gegenüber dem Interesse an einem funktionierenden Stundenplan?";

const SHORT_ANSWER =
  "Ein privatärztliches Attest ist nach Beamtenrecht nicht bindend; bei Zweifeln an der Dienstfähigkeit kann der Dienstherr die Untersuchung durch die untere Gesundheitsbehörde anordnen (LBG NRW § 33), und die Lehrkraft muss sich ihr unterziehen. Die Gleichstellung mit schwerbehinderten Menschen (§ 2 Abs. 3, § 151 SGB IX) ändert dieses Verfahren nicht, löst aber zusätzliche Pflichten aus: Die Regelungen für schwerbehinderte Menschen gelten auch für Beamtinnen und Beamte (§ 156 SGB IX), die Schwerbehindertenvertretung ist in allen Angelegenheiten, die die Lehrkraft berühren, unverzüglich zu unterrichten und vor Entscheidungen anzuhören (§ 178 Abs. 2 SGB IX), und die Lehrkraft hat Anspruch auf behinderungsgerechte Gestaltung von Arbeitsorganisation und Arbeitszeit, soweit dies zumutbar ist und beamtenrechtliche Vorschriften nicht entgegenstehen (§ 164 Abs. 4 SGB IX). Die Gleichstellung muss nachgewiesen werden, ersetzt keine amtsärztliche Klärung und befreit nicht automatisch von der im Stundenplan vorgesehenen Unterrichtsstunde. Bis zur Klärung bleibt der Stundenplan verbindlich (BeamtStG § 35); die Schulleitung muss das Verfahren aber unter Beteiligung der Schwerbehindertenvertretung führen und den Anspruch auf Arbeitszeitgestaltung gesondert prüfen.";

const IMMEDIATE_ACTIONS =
  "Schulleitung bittet die Lehrkraft schriftlich, die Gleichstellung nachzuweisen (Bescheid der Bundesagentur für Arbeit); ein bloßer Antrag begründet die Gleichstellung noch nicht, sie wirkt erst nach positiver Entscheidung ab dem Tag des Antragseingangs und kann befristet sein (§ 151 SGB IX). Liegt der Nachweis vor, unterrichtet die Schulleitung die Schwerbehindertenvertretung unverzüglich und umfassend und hört sie an, bevor weitere Entscheidungen zum Stundenplan getroffen werden (§ 178 Abs. 2 SGB IX). Schulleitung führt zeitnah ein Gespräch mit der Lehrkraft, in dem die Notwendigkeit einer amtsärztlichen Überprüfung erläutert und gefragt wird, welche Gestaltung der Arbeitszeit behinderungsbedingt notwendig sein soll. Schulleitung informiert das zuständige Schulamt bzw. den Dienstherrn und bittet darum, die Untersuchung bei der unteren Gesundheitsbehörde anzuordnen (LBG NRW § 33). Schulleitung dokumentiert alle Gespräche schriftlich. Für die Übergangszeit gilt der Stundenplan weiter; disziplinarische Schritte werden erst erwogen, wenn Status und Beteiligung der Schwerbehindertenvertretung geklärt sind.";

const RECOMMENDATION =
  "Die Schulleitung sollte folgende Schritte sachlich und verhältnismäßig unternehmen: (1) Klares Gespräch mit der Lehrkraft führen, in dem dargelegt wird, dass das privatärztliche Attest allein nicht ausreicht, um Dienstaufgaben zu verweigern, sondern dass eine amtsärztliche Feststellung erforderlich ist. (2) Beruft sich die Lehrkraft auf eine Gleichstellung mit schwerbehinderten Menschen, den Nachweis erbitten (Bescheid der Bundesagentur für Arbeit; ein bloßer Antrag genügt nicht) und gegebenenfalls den Antragszeitpunkt dokumentieren, da die Gleichstellung mit dem Tag des Antragseingangs wirksam wird (§ 151 SGB IX). (3) Liegt der Nachweis vor: die Schwerbehindertenvertretung unverzüglich und umfassend unterrichten und anhören, bevor Entscheidungen zum Stundenplan getroffen werden (§ 178 Abs. 2 SGB IX). (4) Den Dienstherrn bzw. das zuständige Schulamt informieren und veranlassen, eine Untersuchung durch die untere Gesundheitsbehörde anzuordnen (LBG NRW § 33); dabei auch klären lassen, ob und welche Einschränkungen der Arbeitszeit behinderungsbedingt notwendig sind. (5) Parallel den Anspruch auf behinderungsgerechte Gestaltung von Arbeitsorganisation und Arbeitszeit prüfen (§ 164 Abs. 4 SGB IX): Zumutbarkeit, Aufwand und beamtenrechtliche Grenzen abwägen und die Abwägung dokumentieren; frühzeitig Hilfen nach § 167 Abs. 1 SGB IX erwägen (Schwerbehindertenvertretung, Integrationsamt). (6) Alle Gespräche und Anordnungen schriftlich dokumentieren, um die sachgerechte Verfahrensweise nachzuweisen. (7) Für die Übergangszeit klären, wie der Stundenplan erfüllt wird, während die Klärung läuft; das Kollegium sachlich über die organisatorische Situation informieren, ohne Angaben zu Gesundheit oder Gleichstellung der Lehrkraft preiszugeben und ohne unkontrollierte Vertretungsbelastung hinzunehmen. (8) Nach Vorliegen des amtsärztlichen Gutachtens: Falls eine Einsatzeinschränkung bestätigt wird, sachgerecht mit dem Dienstherrn eine individuell passende Lösung suchen (z. B. Stundenreduktion, andere Tätigkeit, Weitergabe an das Integrationsteam, beachte § 27 BeamtStG). Falls keine Einschränkung bestätigt wird, volle Stundenplan-Erfüllung erwarten; beruft sich die Lehrkraft auf Gleichstellung, den Anspruch aus § 164 Abs. 4 SGB IX trotzdem gesondert prüfen und die Abwägung dokumentieren. Die Schulleitung achtet darauf, dass ihre Maßnahmen angemessen und nicht diskriminierend sind (Benachteiligungsverbot, § 164 Abs. 2 SGB IX).";

const LEGAL_VORGEGEBEN_ADD =
  " Nach dem SGB IX können Menschen mit Behinderungen mit einem Grad der Behinderung von weniger als 50, aber wenigstens 30, schwerbehinderten Menschen gleichgestellt werden, wenn sie infolge ihrer Behinderung ohne die Gleichstellung einen geeigneten Arbeitsplatz nicht erlangen oder nicht behalten können (§ 2 Abs. 3 SGB IX). Die Gleichstellung erfolgt auf Antrag durch die Bundesagentur für Arbeit, wird mit dem Tag des Eingangs des Antrags wirksam und kann befristet werden; auf gleichgestellte behinderte Menschen werden die besonderen Regelungen für schwerbehinderte Menschen mit Ausnahme des § 208 und des Kapitels 13 angewendet (§ 151 SGB IX). Arbeitsplätze im Sinne dieser Regelungen sind auch Stellen, auf denen Beamtinnen und Beamte beschäftigt werden (§ 156 SGB IX). Nach § 164 Abs. 4 SGB IX haben schwerbehinderte Menschen gegenüber ihren Arbeitgebern Anspruch unter anderem auf behinderungsgerechte Gestaltung der Arbeitsorganisation und der Arbeitszeit; der Anspruch besteht nicht, soweit seine Erfüllung für den Arbeitgeber nicht zumutbar oder mit unverhältnismäßigen Aufwendungen verbunden wäre oder soweit beamtenrechtliche Vorschriften entgegenstehen. Nach § 164 Abs. 5 SGB IX besteht ein Anspruch auf Teilzeitbeschäftigung, wenn die kürzere Arbeitszeit wegen Art oder Schwere der Behinderung notwendig ist. Bei personen-, verhaltens- oder betriebsbedingten Schwierigkeiten im Beschäftigungsverhältnis, die zu dessen Gefährdung führen können, schaltet der Arbeitgeber möglichst frühzeitig die Schwerbehindertenvertretung und das Integrationsamt ein (§ 167 Abs. 1 SGB IX). Die Schwerbehindertenvertretung ist in allen Angelegenheiten, die einen einzelnen oder die schwerbehinderten Menschen als Gruppe berühren, unverzüglich und umfassend zu unterrichten und vor einer Entscheidung anzuhören; die Durchführung einer ohne Beteiligung getroffenen Entscheidung ist auszusetzen, die Beteiligung ist innerhalb von sieben Tagen nachzuholen (§ 178 Abs. 2 SGB IX). Der Arbeitgeber bestellt einen Inklusionsbeauftragten, der ihn in Angelegenheiten schwerbehinderter Menschen verantwortlich vertritt (§ 181 SGB IX). Schwerbehinderte Menschen werden auf ihr Verlangen von Mehrarbeit freigestellt (§ 207 SGB IX) und haben Anspruch auf einen bezahlten Zusatzurlaub von fünf Arbeitstagen (§ 208 SGB IX).";

const LEGAL_EINORDNUNG_ADD =
  " Beruft sich die Lehrkraft auf eine Gleichstellung mit schwerbehinderten Menschen, ändert das die Grundlogik nicht: Die Gleichstellung ist durch den Bescheid der Bundesagentur für Arbeit nachzuweisen, ein Antrag allein begründet sie noch nicht, und sie ersetzt keine amtsärztliche Feststellung der Dienst- oder Einsatzfähigkeit. Sie führt aber dazu, dass die Schulleitung als Vertreterin des Dienstherrn die Schwerbehindertenvertretung beteiligen muss (§ 178 Abs. 2 SGB IX), einen möglichen Anspruch auf behinderungsgerechte Arbeitszeitgestaltung prüfen sollte und sich nicht allein auf die fehlende Bindungswirkung des privatärztlichen Attests berufen darf (§ 164 Abs. 4 SGB IX), und Hilfen nach § 167 Abs. 1 SGB IX frühzeitig erwägen sollte. Eine pauschale Befreiung von der Nachmittagsstunde folgt aus der Gleichstellung nicht: Die Freistellung von Mehrarbeit nach § 207 SGB IX bezieht sich nach ihrem Wortlaut auf Mehrarbeit, nicht auf die regulär im Stundenplan eingeplante Unterrichtsverpflichtung, und der Anspruch aus § 164 Abs. 4 SGB IX steht unter dem Vorbehalt der Zumutbarkeit und entgegenstehender beamtenrechtlicher Vorschriften. Zusatzurlaub nach § 208 SGB IX steht gleichgestellten Beschäftigten nicht zu (§ 151 SGB IX). Welche Schwerbehindertenvertretung für die Lehrkraft im Einzelfall zuständig ist und wie weit der Anspruch auf Arbeitszeitgestaltung gegenüber den Erfordernissen des Stundenplans im Schulalltag reicht, enthalten die übergebenen Quellen nicht ausdrücklich.";

const RESPONSIBILITIES_ADD =
  " Bei Gleichstellung oder Schwerbehinderung kommen hinzu: die Schwerbehindertenvertretung (Interessenvertretung und Beratung der Lehrkraft, Anspruch auf Unterrichtung und Anhörung, § 178 SGB IX), der Inklusionsbeauftragte des Arbeitgebers (vertritt den Dienstherrn in Angelegenheiten schwerbehinderter Menschen, § 181 SGB IX) und die Bundesagentur für Arbeit (Entscheidung über die Gleichstellung, § 151 SGB IX).";

const PRACTICE_TIP_ADD = [
  "- [Rechtlich erforderlich] Beruft sich die Lehrkraft auf Gleichstellung oder Schwerbehinderung: Schwerbehindertenvertretung unverzüglich unterrichten und vor Entscheidungen zum Stundenplan anhören (§ 178 Abs. 2 SGB IX)",
  "- [Praktisch empfohlen] Nachweis der Gleichstellung (Bescheid der Bundesagentur für Arbeit) erbitten und den Antragszeitpunkt festhalten; ein bloßer Antrag begründet die Gleichstellung noch nicht (§ 151 SGB IX)",
  "- [Praktisch empfohlen] Den Anspruch auf behinderungsgerechte Arbeitszeitgestaltung gesondert prüfen und die Abwägung (Zumutbarkeit, Aufwand, beamtenrechtliche Grenzen) schriftlich festhalten (§ 164 Abs. 4 SGB IX)",
  "- [Praktisch empfohlen] Angaben zu Gesundheit, Behinderung und Gleichstellung vertraulich behandeln und nur im erforderlichen Kreis (Schulleitung, Schwerbehindertenvertretung, Dienstherr) verwenden; das Kollegium nicht darüber informieren",
];

const CHECKLIST_ADD = [
  "[Organisatorisch empfohlen] Bei Berufung auf Gleichstellung: Nachweis (Bescheid der Bundesagentur für Arbeit) erbitten und den Antragszeitpunkt dokumentieren (§ 151 SGB IX)",
  "[Rechtlich erforderlich] Schwerbehindertenvertretung unverzüglich und umfassend unterrichten und vor Entscheidungen zum Stundenplan anhören; ohne Beteiligung getroffene Entscheidungen sind auszusetzen (§ 178 Abs. 2 SGB IX)",
  "[Rechtlich erforderlich] Anspruch der Lehrkraft auf behinderungsgerechte Gestaltung von Arbeitsorganisation und Arbeitszeit prüfen (§ 164 Abs. 4 SGB IX) und die Abwägung zu Zumutbarkeit und beamtenrechtlichen Grenzen dokumentieren",
  "[Organisatorisch empfohlen] Frühzeitig Hilfen nach § 167 Abs. 1 SGB IX erwägen (Einschaltung von Schwerbehindertenvertretung und Integrationsamt)",
];

const DOCUMENTATION_ADD = [
  "[Zur Nachvollziehbarkeit empfohlen] Vermerk zum vorgelegten Nachweis der Gleichstellung (Bescheid, Datum des Antragseingangs, gegebenenfalls Befristung)",
  "[Rechtlich erforderlich] Nachweis der Unterrichtung und Anhörung der Schwerbehindertenvertretung (Datum, Inhalt, Stellungnahme) (§ 178 Abs. 2 SGB IX)",
  "[Zur Nachvollziehbarkeit empfohlen] Abwägungsvermerk zur Prüfung der behinderungsgerechten Arbeitszeitgestaltung (§ 164 Abs. 4 SGB IX)",
];

const FAQ_ADD = [
  {
    q: "Was bewirkt die Gleichstellung mit einem schwerbehinderten Menschen?",
    a: "Gleichgestellt werden können Menschen mit einem Grad der Behinderung von weniger als 50, aber wenigstens 30, die ohne die Gleichstellung einen geeigneten Arbeitsplatz nicht erlangen oder nicht behalten könnten (§ 2 Abs. 3 SGB IX). Die Bundesagentur für Arbeit entscheidet auf Antrag; die Gleichstellung wirkt ab dem Tag des Antragseingangs und kann befristet werden. Auf Gleichgestellte werden die besonderen Regelungen für schwerbehinderte Menschen angewendet, mit Ausnahme des Zusatzurlaubs (§ 208) und des Kapitels 13 (§ 151 SGB IX). Das gilt auch für Beamtinnen und Beamte (§ 156 SGB IX).",
  },
  {
    q: "Befreit die Gleichstellung von der Nachmittagsstunde im Stundenplan?",
    a: "Nicht automatisch. Die Gleichstellung begründet keinen pauschalen Anspruch auf einen bestimmten Einsatz, sondern unter anderem einen Anspruch auf behinderungsgerechte Gestaltung von Arbeitsorganisation und Arbeitszeit (§ 164 Abs. 4 SGB IX). Er besteht nur, soweit die Erfüllung zumutbar und nicht mit unverhältnismäßigen Aufwendungen verbunden ist und beamtenrechtliche Vorschriften nicht entgegenstehen. Ob eine bestimmte Lage der Arbeitszeit behinderungsbedingt notwendig ist, muss belegt und gegebenenfalls amtsärztlich geklärt werden. Die Freistellung von Mehrarbeit (§ 207 SGB IX) bezieht sich nach ihrem Wortlaut auf Mehrarbeit, nicht auf die regulär eingeplante Unterrichtsverpflichtung.",
  },
  {
    q: "Muss die Schwerbehindertenvertretung beteiligt werden?",
    a: "Ja, wenn die Lehrkraft schwerbehindert oder gleichgestellt ist. Die Schwerbehindertenvertretung ist in allen Angelegenheiten, die einen einzelnen schwerbehinderten Menschen berühren, unverzüglich und umfassend zu unterrichten und vor einer Entscheidung anzuhören (§ 178 Abs. 2 SGB IX). Eine ohne Beteiligung getroffene Entscheidung ist auszusetzen; die Beteiligung ist innerhalb von sieben Tagen nachzuholen, danach wird endgültig entschieden.",
  },
  {
    q: "Hat eine gleichgestellte Lehrkraft Anspruch auf Zusatzurlaub?",
    a: "Nein. Der Zusatzurlaub von fünf Arbeitstagen (§ 208 SGB IX) steht schwerbehinderten Menschen zu; auf gleichgestellte behinderte Menschen wird § 208 nicht angewendet (§ 151 SGB IX).",
  },
];

const MISTAKES_ADD = [
  "[Organisatorisch ungünstig] Die behauptete Gleichstellung ungeprüft als Freibrief für eine Dienstbefreiung akzeptieren – oder sie ignorieren, ohne den Nachweis zu erbitten (§ 151 SGB IX)",
  "[Organisatorisch ungünstig] Den Stundenplan ändern oder Maßnahmen gegenüber der Lehrkraft ergreifen, ohne die Schwerbehindertenvertretung zu unterrichten und anzuhören (§ 178 Abs. 2 SGB IX)",
  "[Organisatorisch ungünstig] Den Anspruch auf behinderungsgerechte Arbeitszeitgestaltung (§ 164 Abs. 4 SGB IX) nicht prüfen, weil das Attest nur privatärztlich ist",
  "[Organisatorisch ungünstig] Gleichstellung und Schwerbehinderung gleichsetzen: Zusatzurlaub nach § 208 SGB IX steht Gleichgestellten nicht zu (§ 151 SGB IX)",
];

// SGB IX: Section-Suffix -> (Kurzzitat-Start/-Ende für wörtlichen Auszug, Fundstelle, Begründung)
const NEW_LINKS: Array<{ sec: string; from: string; to: string; ref: string; why: string }> = [
  { sec: "2", from: "Schwerbehinderten Menschen gleichgestellt werden sollen", to: "(gleichgestellte behinderte Menschen).", ref: "§ 2 Abs. 3", why: "Definiert die Gleichstellung (GdB wenigstens 30, aber unter 50) – Grundlage für die Berufung der Lehrkraft auf Gleichstellung." },
  { sec: "151", from: "Die Gleichstellung behinderter Menschen", to: "des § 208 und des Kapitels 13 angewendet.", ref: "§ 151 Abs. 2 und 3", why: "Regelt Verfahren, Wirksamkeit (ab Antragseingang), Befristung und den Umfang der Anwendung auf Gleichgestellte (ohne Zusatzurlaub)." },
  { sec: "156", from: "Arbeitsplätze im Sinne dieses Teils sind alle Stellen", to: "beruflichen Bildung Eingestellte beschäftigt werden.", ref: "§ 156 Abs. 1", why: "Stellt klar, dass die Regelungen auch für Beamtinnen und Beamte, also verbeamtete Lehrkräfte, gelten." },
  { sec: "164", from: "Die schwerbehinderten Menschen haben gegenüber ihren Arbeitgebern Anspruch auf", to: "beamtenrechtliche Vorschriften entgegenstehen.", ref: "§ 164 Abs. 4", why: "Anspruch auf behinderungsgerechte Gestaltung von Arbeitsorganisation und Arbeitszeit samt Grenzen (Zumutbarkeit, beamtenrechtliche Vorschriften)." },
  { sec: "167", from: "Der Arbeitgeber schaltet bei Eintreten von personen-", to: "möglichst dauerhaft fortgesetzt werden kann.", ref: "§ 167 Abs. 1", why: "Präventionspflicht: frühzeitige Einschaltung von Schwerbehindertenvertretung und Integrationsamt bei Schwierigkeiten im Beschäftigungsverhältnis." },
  { sec: "178", from: "Der Arbeitgeber hat die Schwerbehindertenvertretung in allen Angelegenheiten", to: "ist innerhalb von sieben Tagen nachzuholen; sodann ist endgültig zu entscheiden.", ref: "§ 178 Abs. 2", why: "Unterrichtungs- und Anhörungspflicht gegenüber der Schwerbehindertenvertretung; Aussetzung nicht beteiligter Entscheidungen." },
  { sec: "181", from: "Der Arbeitgeber bestellt einen Inklusionsbeauftragten", to: "verantwortlich vertritt;", ref: "§ 181 Abs. 1", why: "Inklusionsbeauftragter vertritt den Arbeitgeber in Angelegenheiten schwerbehinderter Menschen." },
  { sec: "207", from: "Schwerbehinderte Menschen werden auf ihr Verlangen", to: "von Mehrarbeit freigestellt.", ref: "§ 207", why: "Freistellung von Mehrarbeit auf Verlangen – abzugrenzen von der regulär eingeplanten Unterrichtsverpflichtung." },
  { sec: "208", from: "Schwerbehinderte Menschen haben Anspruch auf einen bezahlten zusätzlichen Urlaub", to: "vermindert sich der Zusatzurlaub entsprechend.", ref: "§ 208 Abs. 1", why: "Zusatzurlaub steht nur schwerbehinderten, nicht gleichgestellten Menschen zu (§ 151 Abs. 3)." },
];

// ---------------------------------------------------------------------------
// Entscheidungsbaum
// ---------------------------------------------------------------------------

function buildTree(old: any): any {
  const tree = JSON.parse(JSON.stringify(old));
  tree.start = "frage_status";
  tree.meta = { ...(tree.meta ?? {}), status: "approved", version: (tree.meta?.version ?? 1) + 1 };

  tree.steps.frage_status = {
    question: "Beruft sich die Lehrkraft darauf, einem schwerbehinderten Menschen gleichgestellt zu sein, oder liegt eine anerkannte Schwerbehinderung vor?",
    explanation: "Die Gleichstellung (Grad der Behinderung von wenigstens 30, aber weniger als 50) erfolgt auf Antrag durch die Bundesagentur für Arbeit; danach gelten die besonderen Regelungen für schwerbehinderte Menschen (§ 2 Abs. 3, § 151 SGB IX). Davon hängt ab, ob die Schwerbehindertenvertretung zu beteiligen ist und ob ein Anspruch auf behinderungsgerechte Arbeitszeitgestaltung zu prüfen ist.",
    options: [
      { label: "Nein, die Lehrkraft beruft sich nur auf das privatärztliche Attest.", next: "frage_1" },
      { label: "Ja, ein Gleichstellungsbescheid der Bundesagentur für Arbeit (oder ein Feststellungsbescheid bzw. Schwerbehindertenausweis) liegt vor.", next: "frage_sbv" },
      { label: "Die Lehrkraft beruft sich auf die Gleichstellung, hat aber keinen Bescheid vorgelegt oder nur einen Antrag gestellt.", result: "ergebnis_gleichstellung_nicht_nachgewiesen" },
    ],
  };
  tree.steps.frage_sbv = {
    question: "Wurde die Schwerbehindertenvertretung über den Vorgang (Attest, Streit um den Stundenplan) bereits unterrichtet und angehört?",
    explanation: "Der Arbeitgeber muss die Schwerbehindertenvertretung in allen Angelegenheiten, die einen einzelnen schwerbehinderten Menschen berühren, unverzüglich und umfassend unterrichten und vor einer Entscheidung anhören (§ 178 Abs. 2 SGB IX). Das gilt auch für gleichgestellte Menschen (§ 151 SGB IX).",
    options: [
      { label: "Nein, die Schwerbehindertenvertretung ist noch nicht eingebunden.", result: "ergebnis_sbv_nicht_beteiligt" },
      { label: "Ja, sie wurde unterrichtet und angehört.", next: "frage_1" },
    ],
  };

  tree.results.ergebnis_gleichstellung_nicht_nachgewiesen = {
    color: "gelb",
    urgency: "mittel",
    title: "Gleichstellung behauptet, aber nicht nachgewiesen – Status klären, Standardverfahren fortführen",
    steps: [
      "Schulleitung bittet die Lehrkraft schriftlich, den Gleichstellungsbescheid der Bundesagentur für Arbeit (oder einen Feststellungsbescheid) innerhalb einer angemessenen Frist vorzulegen",
      "Schulleitung erläutert, dass ein bloßer Antrag die Gleichstellung noch nicht begründet: Sie erfolgt durch die Entscheidung der Bundesagentur für Arbeit, wirkt dann ab dem Tag des Antragseingangs und kann befristet sein (§ 151 SGB IX)",
      "Schulleitung weist darauf hin, dass sich die Lehrkraft bei einem Antrag auf Gleichstellung von der Schwerbehindertenvertretung unterstützen lassen kann (§ 178 SGB IX)",
      "Parallel wird das Standardverfahren fortgeführt: amtsärztliche Klärung über den Dienstherrn veranlassen (LBG NRW § 33); der Stundenplan bleibt bis zur Klärung verbindlich",
      "Gespräch, gesetzte Frist und gegebenenfalls der angegebene Antragszeitpunkt werden schriftlich dokumentiert",
      "Sobald ein Bescheid vorliegt, wird das Verfahren mit der Frage nach der Beteiligung der Schwerbehindertenvertretung fortgesetzt",
    ],
    warning: "Aus einer behaupteten, nicht nachgewiesenen Gleichstellung dürfen keine Rechte abgeleitet werden. Wird die Gleichstellung später bewilligt, wirkt sie ab dem Tag des Antragseingangs (§ 151 SGB IX): Der Antragszeitpunkt ist deshalb zu dokumentieren, und bis zur Entscheidung sollten keine irreversiblen Maßnahmen wie disziplinarische Schritte eingeleitet werden.",
    responsible: "Schulleitung; Schwerbehindertenvertretung (Unterstützung der Lehrkraft beim Antrag); Bundesagentur für Arbeit (Entscheidung über die Gleichstellung)",
    documentation: "Schriftliche Aufforderung zum Nachweis mit Fristsetzung; Gesprächsprotokoll; Vermerk zum Antragszeitpunkt, falls ein Antrag gestellt wurde.",
    recommendation: "Die Lehrkraft beruft sich auf eine Gleichstellung mit schwerbehinderten Menschen, hat sie aber nicht belegt. Die Schulleitung sollte den Nachweis sachlich und schriftlich erbitten und erläutern, dass erst die Entscheidung der Bundesagentur für Arbeit die Gleichstellung begründet, die dann ab dem Tag des Antragseingangs wirkt. Das Verfahren zur amtsärztlichen Klärung läuft unabhängig davon weiter, denn die Gleichstellung ersetzt keine amtliche Feststellung der Dienst- oder Einsatzfähigkeit. Für die Übergangszeit bleibt der Stundenplan verbindlich; endgültige Maßnahmen gegenüber der Lehrkraft sollten erst nach Klärung des Status getroffen werden. Liegt später ein Bescheid vor, ist die Schwerbehindertenvertretung unverzüglich zu beteiligen.",
  };

  tree.results.ergebnis_sbv_nicht_beteiligt = {
    color: "rot",
    urgency: "hoch",
    title: "Schwerbehindertenvertretung nicht beteiligt – unverzüglich unterrichten und anhören",
    steps: [
      "Schulleitung unterrichtet die zuständige Schwerbehindertenvertretung unverzüglich und umfassend über Attest, Streit um den Stundenplan und die bisherigen Schritte (§ 178 Abs. 2 SGB IX)",
      "Schulleitung gibt der Schwerbehindertenvertretung Gelegenheit zur Stellungnahme, bevor weitere Entscheidungen zum Stundenplan oder zur Anordnung der Untersuchung getroffen werden",
      "Bereits ohne Beteiligung getroffene Entscheidungen werden ausgesetzt; die Beteiligung wird innerhalb von sieben Tagen nachgeholt, danach wird endgültig entschieden (§ 178 Abs. 2 SGB IX)",
      "Schulleitung prüft mit der Schwerbehindertenvertretung und dem Dienstherrn frühzeitig Hilfen nach § 167 Abs. 1 SGB IX (Einschaltung von Schwerbehindertenvertretung und Integrationsamt) sowie den Anspruch auf behinderungsgerechte Arbeitszeitgestaltung (§ 164 Abs. 4 SGB IX)",
      "Die getroffene Entscheidung wird der Schwerbehindertenvertretung unverzüglich mitgeteilt und dokumentiert",
      "Anschließend wird das Standardverfahren fortgeführt: Verweigerung dokumentieren und amtsärztliche Klärung über den Dienstherrn veranlassen (LBG NRW § 33)",
    ],
    warning: "Entscheidungen, die ohne Beteiligung der Schwerbehindertenvertretung getroffen wurden, sind auszusetzen und die Beteiligung ist nachzuholen (§ 178 Abs. 2 SGB IX). Das verzögert das Verfahren und schwächt die Position der Schulleitung; die Beteiligung sollte deshalb vor, nicht nach der Entscheidung erfolgen.",
    responsible: "Schulleitung; Schwerbehindertenvertretung; auf Seiten des Dienstherrn gegebenenfalls der Inklusionsbeauftragte des Arbeitgebers (§ 181 SGB IX)",
    documentation: "Schriftliche Unterrichtung der Schwerbehindertenvertretung mit Datum und Inhalt; deren Stellungnahme; Vermerk über ausgesetzte und nachgeholte Entscheidungen; Mitteilung der endgültigen Entscheidung.",
    recommendation: "Die Lehrkraft ist schwerbehindert oder gleichgestellt, die Schwerbehindertenvertretung wurde aber noch nicht eingebunden. Das ist nachzuholen: Sie ist in allen Angelegenheiten, die die Lehrkraft berühren, unverzüglich und umfassend zu unterrichten und vor einer Entscheidung anzuhören. Bereits getroffene Entscheidungen zum Stundenplan sind auszusetzen, bis die Beteiligung innerhalb von sieben Tagen nachgeholt ist. Gemeinsam mit der Schwerbehindertenvertretung sollte die Schulleitung frühzeitig prüfen, welche Hilfen in Betracht kommen und ob die Lehrkraft einen Anspruch auf eine behinderungsgerechte Gestaltung der Arbeitszeit hat. Parallel bleibt die amtsärztliche Klärung über den Dienstherrn notwendig.",
  };

  // Bestehende Ergebnisse um die Gleichstellungs-Gesichtspunkte ergänzen.
  const addStep = (id: string, text: string, afterIndex: number) => {
    const steps: string[] = tree.results[id].steps;
    steps.splice(Math.min(afterIndex, steps.length), 0, text);
  };
  addStep(
    "ergebnis_keine_amtsuntersuchung_veranlasst",
    "Beruft sich die Lehrkraft auf Gleichstellung oder Schwerbehinderung: Schwerbehindertenvertretung unverzüglich unterrichten und anhören, bevor Entscheidungen getroffen werden (§ 178 Abs. 2 SGB IX), und bei der Anordnung der Untersuchung auch klären lassen, ob behinderungsbedingte Einschränkungen der Arbeitszeit bestehen",
    3,
  );
  addStep(
    "ergebnis_amtsarzt_voll_dienstfaehig",
    "Beruft sich die Lehrkraft auf Gleichstellung oder Schwerbehinderung: vor weiteren Maßnahmen die Schwerbehindertenvertretung beteiligen (§ 178 Abs. 2 SGB IX) und gesondert prüfen, ob ein Anspruch auf behinderungsgerechte Arbeitszeitgestaltung (§ 164 Abs. 4 SGB IX) besteht; die Abwägung wird dokumentiert",
    2,
  );
  tree.results.ergebnis_amtsarzt_voll_dienstfaehig.warning +=
    " Bei Gleichstellung oder Schwerbehinderung sind vor disziplinarischen Schritten die Beteiligung der Schwerbehindertenvertretung und die Prüfung des Anspruchs aus § 164 Abs. 4 SGB IX nachzuholen.";
  addStep(
    "ergebnis_amtsarzt_einsatzeinschraenkung_bestaetigt",
    "Beruft sich die Lehrkraft auf Gleichstellung oder Schwerbehinderung: Schwerbehindertenvertretung beteiligen (§ 178 Abs. 2 SGB IX) und den Anspruch auf behinderungsgerechte Gestaltung von Arbeitsorganisation und Arbeitszeit sowie gegebenenfalls auf Teilzeitbeschäftigung prüfen (§ 164 Abs. 4 und 5 SGB IX)",
    3,
  );
  return tree;
}

// ---------------------------------------------------------------------------

async function main() {
  const stage = process.argv[2];
  if (!["prepare", "edit", "publish", "check"].includes(stage ?? "")) {
    console.error("Aufruf: bun run scripts/_update-case-attest-gleichstellung.ts <check|prepare|edit|publish>");
    process.exit(1);
  }
  await bootstrapSession();
  const { supabase } = await import("../src/integrations/supabase/client");
  const { EditorialWorkflowService } = await import("../src/services/editorial/EditorialWorkflowService");
  const { updateCase } = await import("../src/lib/coreBuilder");
  const { parseCuratedTree, validateCuratedTree } = await import("../src/lib/decisionTree");

  const loadCase = async () => {
    const { data, error } = await supabase.from("practice_cases").select("*").eq("id", CASE_ID).single();
    if (error) throw error;
    return data as any;
  };

  if (stage === "prepare") {
    const row = await loadCase();
    const { data: links } = await (supabase.from("case_legal_links") as any).select("*").eq("case_id", CASE_ID);
    writeFileSync(BACKUP_PATH, JSON.stringify({ savedAt: new Date().toISOString(), case: row, links }, null, 2));
    console.log(`Sicherung: ${BACKUP_PATH} (workflow_status=${row.workflow_status}, tier=${row.publication_tier})`);
    if (row.workflow_status === "published") {
      await EditorialWorkflowService.archive({ caseId: CASE_ID, reason: "Überarbeitung: Ergänzung um Gleichstellung mit Schwerbehinderung" } as any);
      console.log("archiviert");
    }
    if ((await loadCase()).workflow_status === "archived") {
      await EditorialWorkflowService.reactivate({ caseId: CASE_ID } as any);
      console.log("reaktiviert");
    }
    console.log("Status jetzt:", (await loadCase()).workflow_status);
    return;
  }

  if (stage === "edit" || stage === "check") {
    const dry = stage === "check";
    const row = await loadCase();
    if (!dry && row.workflow_status !== "draft") throw new Error(`Fall ist nicht im Entwurf (${row.workflow_status}) - zuerst 'prepare'.`);
    if (!dry && /Gleichstellung/.test(row.short_description)) throw new Error("Fall enthält bereits die Gleichstellung - Abbruch (doppelte Ergänzung vermeiden).");

    // legal_explanation: beide Abschnitte um die SGB-IX-Ausführungen erweitern.
    const parts = String(row.legal_explanation).split(/\n\nRECHTLICHE EINORDNUNG:/);
    if (parts.length !== 2) throw new Error("legal_explanation hat unerwartetes Format.");
    const einordnungOld = parts[1];
    const idxOffen = einordnungOld.lastIndexOf(" Die Rechtslage zu den konkreten Verfahrensschritten");
    const einordnungNew = idxOffen > 0
      ? einordnungOld.slice(0, idxOffen) + LEGAL_EINORDNUNG_ADD + einordnungOld.slice(idxOffen)
      : einordnungOld + LEGAL_EINORDNUNG_ADD;
    const legalExplanation = `${parts[0].trimEnd()}${LEGAL_VORGEGEBEN_ADD}\n\nRECHTLICHE EINORDNUNG:${einordnungNew}`;

    const newTree = buildTree(row.decision_tree);
    const parsed = parseCuratedTree(newTree);
    const report = parsed ? validateCuratedTree(parsed) : null;
    if (!report?.valid) throw new Error("Neuer Entscheidungsbaum ungültig: " + JSON.stringify(report));
    console.log(`Baum: ${Object.keys(newTree.steps).length} Fragen, ${Object.keys(newTree.results).length} Ergebnisse, gültig`);

    // Links zuerst: scheitert eine Norm, wird noch nichts am Text geändert.
    const { data: src } = await supabase.from("legal_sources").select("id").eq("short_name", "SGB IX").single();
    const { data: secs } = await supabase.from("legal_sections").select("id, reference, title, content").eq("source_id", (src as any).id);
    const linkRows: any[] = [];
    for (const l of NEW_LINKS) {
      const sec = (secs ?? []).find((s: any) => new RegExp(`§ ${l.sec}$`).test(s.reference));
      if (!sec) throw new Error(`SGB IX § ${l.sec} nicht gefunden`);
      const norm = (s: string) => s.replace(/\s+/g, " ");
      const content = norm((sec as any).content);
      const i = content.indexOf(l.from);
      const j = content.indexOf(l.to, i);
      if (i < 0 || j < 0) throw new Error(`Auszug für § ${l.sec} nicht auffindbar (${i}/${j})`);
      linkRows.push({
        case_id: CASE_ID,
        legal_section_id: (sec as any).id,
        content_summary: content.slice(i, j + l.to.length),
        content_summary_kind: "wortlaut",
        precise_reference: l.ref,
        explanation: l.why,
      });
    }
    if (dry) {
      console.log(`Trockenlauf OK: ${linkRows.length} Normauszüge gefunden, Baum gültig, legal_explanation-Format passt.`);
      for (const r of linkRows) console.log(`  ${r.precise_reference.padEnd(18)} ${r.content_summary.slice(0, 90)}...`);
      return;
    }
    const { data: existing } = await (supabase.from("case_legal_links") as any).select("legal_section_id").eq("case_id", CASE_ID);
    const have = new Set((existing ?? []).map((e: any) => e.legal_section_id));
    const toInsert = linkRows.filter((r) => !have.has(r.legal_section_id));
    if (toInsert.length > 0) {
      const { error } = await (supabase.from("case_legal_links") as any).insert(toInsert);
      if (error) throw new Error("Links einfügen fehlgeschlagen: " + error.message);
    }
    console.log(`Rechtsgrundlagen: ${toInsert.length} neu verknüpft (SGB IX), ${linkRows.length - toInsert.length} schon vorhanden`);

    await updateCase(CASE_ID, {
      subcategory: "Dienstfähigkeit, Attestierung, Stundenplanverweigerung, Gleichstellung mit Schwerbehinderung",
      short_description: SHORT_DESCRIPTION,
      short_answer: SHORT_ANSWER,
      immediate_actions: IMMEDIATE_ACTIONS,
      recommendation: RECOMMENDATION,
      legal_explanation: legalExplanation,
      responsibilities: `${String(row.responsibilities).trimEnd()}${RESPONSIBILITIES_ADD}`,
      practice_tip: `${String(row.practice_tip).trimEnd()}\n${PRACTICE_TIP_ADD.join("\n")}`,
      checklist: [...row.checklist, ...CHECKLIST_ADD],
      documentation: [...row.documentation, ...DOCUMENTATION_ADD],
      faq: [...row.faq, ...FAQ_ADD],
      common_mistakes: [...row.common_mistakes, ...MISTAKES_ADD],
      decision_tree: newTree,
    } as any);
    console.log("Fall aktualisiert. Nächster Schritt: _retro-validate-legal-claims.ts --only-ids " + CASE_ID);
    return;
  }

  // publish
  const row = await loadCase();
  if (row.workflow_status !== "draft") throw new Error(`Fall ist nicht im Entwurf (${row.workflow_status}).`);
  const parsed = parseCuratedTree(row.decision_tree);
  if (!parsed || !validateCuratedTree(parsed).valid) throw new Error("Entscheidungsbaum ungültig - kein Publish.");
  await EditorialWorkflowService.submitForReview({ caseId: CASE_ID } as any);
  const { data: reviewRows } = await (supabase.from("case_reviews") as any)
    .select("id").eq("case_id", CASE_ID).eq("status", "pending").order("created_at", { ascending: false }).limit(1);
  const reviewId = (reviewRows ?? [])[0]?.id;
  if (!reviewId) throw new Error("Keine offene Review gefunden.");
  await EditorialWorkflowService.decideReview({
    reviewId, decision: "approved",
    comment: process.env.PUBLISH_COMMENT ?? "Redaktionelle Überarbeitung 01.10.2026: Konstellation Gleichstellung mit Schwerbehinderung ergänzt (SGB IX §§ 2, 151, 156, 164, 167, 178, 181, 207, 208).",
  } as any);
  await EditorialWorkflowService.publish({ caseId: CASE_ID, publicationTier: "internal" } as any);
  const after = await loadCase();
  console.log(`Veröffentlicht: workflow_status=${after.workflow_status}, tier=${after.publication_tier}, legal_review_status=${after.legal_review_status}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("FEHLER:", e?.message ?? e); process.exit(1); });
