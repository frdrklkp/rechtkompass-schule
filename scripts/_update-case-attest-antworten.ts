/**
 * Fall "Ärztliches Attest mit Einsatzausschluss ..." (2abf1e78-...), zweite
 * Überarbeitung (Nutzer-Auftrag 01.10.2026: "kannst du die offenen
 * Rechtsfragen beantworten"). Antworten aus den importierten Quellen:
 *   - VO 10-32 Nr. 44 (beamtenrechtliche Zuständigkeiten): Bezirksregierung
 *     ist dienstvorgesetzte Stelle der Lehrkräfte an öffentlichen Schulen
 *   - Richtlinie SGB IX NRW Nr. 2 (Vorbehalt bei Antrag) und Nr. 8
 *     (Stundenplan, Vertretung, Arbeitszeit, Teilzeit, Pflichtstunden)
 *   - BeamtStG § 47, LDG NRW § 17 (Dienstvergehen, Einleitung)
 *   - SGB IX §§ 177, 180 (Schwerbehindertenvertretung, Stufenvertretung)
 * Korrigiert dabei drei Fehler der ersten Fassung (Schulamt statt
 * Bezirksregierung; "Antrag begründet keine Rechte"; "Stundenplan bleibt
 * verbindlich" ohne die Rücksichtnahmepflicht der Richtlinie).
 *
 * Stufen: check (Trockenlauf) | edit | flags (Hinweise schließen/anlegen)
 * Archivieren/Reaktivieren/Veröffentlichen über _update-case-attest-gleichstellung.ts
 * (prepare / publish).
 *
 * Aufruf: bun run scripts/_update-case-attest-antworten.ts <check|edit|flags>
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
import { readFileSync } from "node:fs";

const CASE_ID = "2abf1e78-d7a6-4767-85ee-c2d4c2cfcc1f";
const ADMIN_ID = "85d423d1-cde1-47b2-bc27-f9383621b15a";
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
// Texte
// ---------------------------------------------------------------------------

const SHORT_ANSWER =
  "Ein privatärztliches Attest ist nach Beamtenrecht nicht bindend: Bei Zweifeln an der Dienstfähigkeit ordnet die dienstvorgesetzte Stelle – für Lehrkräfte an öffentlichen Schulen die Bezirksregierung – die Untersuchung durch die untere Gesundheitsbehörde an, und die Lehrkraft muss sich ihr unterziehen (LBG NRW § 33; VO 10-32 Nr. 44 § 2). Beruft sich die Lehrkraft auf eine Gleichstellung mit schwerbehinderten Menschen (§ 2 Abs. 3, § 151 SGB IX), ändert das dieses Verfahren nicht, löst aber zusätzliche Pflichten aus: Die Schwerbehindertenvertretung ist vor Entscheidungen anzuhören (§ 178 Abs. 2 SGB IX), und bei Unterrichtsverteilung und Stundenplangestaltung ist auf behinderungsbedingte Notwendigkeiten in der Regel Rücksicht zu nehmen (Richtlinie SGB IX NRW Nr. 8). Wer einen Gleichstellungsantrag gestellt hat, ist bis zur Entscheidung unter Vorbehalt wie ein Gleichgestellter zu behandeln (Richtlinie Nr. 2). Die Gleichstellung ersetzt aber weder den Nachweis noch die Klärung, ob der Ausschluss der Nachmittagsarbeit tatsächlich behinderungsbedingt notwendig ist, und sie befreit nicht pauschal von der eingeplanten Unterrichtsstunde. Verweigert die Lehrkraft den Dienst ohne tragfähigen Grund, ist das eine Pflichtverletzung (BeamtStG § 35); über deren disziplinarische Verfolgung entscheidet die Bezirksregierung (BeamtStG § 47, LDG NRW § 17).";

const IMMEDIATE_ACTIONS =
  "Schulleitung führt zeitnah ein Gespräch mit der Lehrkraft, in dem erläutert wird, dass das privatärztliche Attest allein nicht bindet und eine amtsärztliche Klärung erforderlich sein kann; sie fragt, auf welche behinderungsbedingte Notwendigkeit sich der Ausschluss der Nachmittagsarbeit stützt. Beruft sich die Lehrkraft auf Gleichstellung, lässt sie sich den Bescheid der Agentur für Arbeit vorlegen; hat die Lehrkraft einen Antrag gestellt, wird sie bis zur Entscheidung unter Vorbehalt wie eine gleichgestellte Lehrkraft behandelt (Richtlinie SGB IX NRW Nr. 2). Die Schwerbehindertenvertretung wird unverzüglich und umfassend unterrichtet und vor weiteren Entscheidungen zum Stundenplan angehört (§ 178 Abs. 2 SGB IX). Die Schulleitung informiert die Bezirksregierung als dienstvorgesetzte Stelle schriftlich und bittet darum, die Untersuchung bei der unteren Gesundheitsbehörde anzuordnen (LBG NRW § 33; VO 10-32 Nr. 44 § 2). Alle Gespräche werden schriftlich dokumentiert. Für die Übergangszeit prüft die Schulleitung nach Anhörung der Lehrkraft, ob eine befristete Stundenplanlösung möglich ist (Richtlinie Nr. 8); über disziplinarische Schritte entscheidet allein die Bezirksregierung, und sie sollten erst erwogen werden, wenn Status und Beteiligung der Schwerbehindertenvertretung geklärt sind.";

const RECOMMENDATION =
  "Die Schulleitung sollte folgende Schritte sachlich und verhältnismäßig unternehmen: (1) Mit der Lehrkraft sprechen: Das privatärztliche Attest bindet den Dienstherrn nicht, eine amtsärztliche Feststellung kann erforderlich sein (LBG NRW § 33); zugleich erfragen, welche behinderungsbedingte Notwendigkeit dem Ausschluss der Nachmittagsarbeit zugrunde liegt. (2) Beruft sich die Lehrkraft auf Gleichstellung: den Bescheid der Agentur für Arbeit erbitten; liegt nur ein Antrag vor, die Lehrkraft bis zur Entscheidung unter Vorbehalt wie eine gleichgestellte behandeln und den Antragszeitpunkt festhalten (Richtlinie SGB IX NRW Nr. 2; § 151 SGB IX). Wünscht die Lehrkraft Hilfe beim Antrag, kann sie die Schwerbehindertenvertretung beanspruchen. (3) Die zuständige Schwerbehindertenvertretung unverzüglich und umfassend unterrichten und anhören, bevor Entscheidungen zum Stundenplan getroffen werden (§ 178 Abs. 2 SGB IX). (4) Die Bezirksregierung als dienstvorgesetzte Stelle informieren und bitten, die Untersuchung durch die untere Gesundheitsbehörde anzuordnen (LBG NRW § 33; VO 10-32 Nr. 44 § 2); eine Frist für die Anordnung ist in § 33 nicht geregelt, deshalb zeitnah handeln. (5) Den Anspruch auf behinderungsgerechte Gestaltung von Arbeitsorganisation und Arbeitszeit prüfen (§ 164 Abs. 4 SGB IX): Bei Unterrichtsverteilung und Stundenplangestaltung ist auf behinderungsbedingte Notwendigkeiten in der Regel Rücksicht zu nehmen, zu Vertretungsstunden sind schwerbehinderte und gleichgestellte Lehrkräfte nur in angemessenen Grenzen und nach vorheriger Anhörung heranzuziehen (Richtlinie Nr. 8). Die Lage der Arbeitszeit kann angepasst werden, die regelmäßige wöchentliche Arbeitszeit darf dadurch aber nicht vermindert werden; eine Entlastung im Umfang kommt nur über Teilzeit (§ 164 Abs. 5 SGB IX) oder eine Pflichtstundenermäßigung in Betracht (Richtlinie Nr. 8). Frühzeitig Hilfen nach § 167 Abs. 1 SGB IX erwägen. (6) Alle Gespräche und Anordnungen schriftlich dokumentieren. (7) Für die Übergangszeit nach Anhörung der Lehrkraft und der Schwerbehindertenvertretung eine befristete Lösung prüfen; das Kollegium sachlich über die organisatorische Situation informieren, ohne Angaben zu Gesundheit oder Gleichstellung der Lehrkraft preiszugeben. (8) Nach Vorliegen des Gutachtens: Falls eine Einsatzeinschränkung bestätigt wird, mit der Bezirksregierung eine passende Lösung suchen (z. B. Stundenplanänderung, Teilzeit, Stundenreduktion nach § 27 BeamtStG); falls keine Einschränkung bestätigt wird, die volle Erfüllung des Stundenplans erwarten und den Anspruch aus § 164 Abs. 4 SGB IX gleichwohl gesondert prüfen. (9) Verweigert die Lehrkraft die Untersuchung oder den Dienst ohne tragfähigen Grund, die Bezirksregierung informieren: Sie hat bei zureichenden tatsächlichen Anhaltspunkten für ein Dienstvergehen ein Disziplinarverfahren einzuleiten, außer wenn eine Disziplinarmaßnahme nicht in Betracht kommt (BeamtStG §§ 35, 47; LDG NRW § 17). Alle Maßnahmen müssen angemessen sein und dürfen die Lehrkraft nicht wegen ihrer Behinderung benachteiligen (§ 164 Abs. 2 SGB IX).";

const VORGEGEBEN_ADD =
  " Dienstvorgesetzte Stelle ist für die Lehrkräfte an öffentlichen Schulen die Bezirksregierung; Schulämter und Schulen nehmen nur die in den §§ 3 und 4 der Verordnung genannten Einzelaufgaben wahr, zu denen die Anordnung der Untersuchung nicht zählt (VO 10-32 Nr. 44 §§ 1 bis 4). Den Schulleitungen übertragen ist unter anderem die Anordnung, Genehmigung und der Widerruf von Mehrarbeit (VO 10-32 Nr. 44 § 4). Eine Frist für die Anordnung der Untersuchung sieht § 33 Abs. 1 LBG NRW nicht vor. Beamtinnen und Beamte begehen ein Dienstvergehen, wenn sie schuldhaft die ihnen obliegenden Pflichten verletzen (BeamtStG § 47 Abs. 1); liegen zureichende tatsächliche Anhaltspunkte für ein Dienstvergehen vor, hat die dienstvorgesetzte Stelle ein Disziplinarverfahren einzuleiten, es sei denn, eine Disziplinarmaßnahme kommt nicht in Betracht (LDG NRW § 17); dienstvorgesetzte Stelle im Sinne des § 17 LDG ist für die Lehrkräfte die Leitung der Bezirksregierung (VO 10-32 Nr. 44 § 10)."
  + " Nach dem SGB IX können Menschen mit Behinderungen mit einem Grad der Behinderung von weniger als 50, aber wenigstens 30, schwerbehinderten Menschen gleichgestellt werden, wenn sie infolge ihrer Behinderung ohne die Gleichstellung einen geeigneten Arbeitsplatz nicht erlangen oder nicht behalten können (§ 2 Abs. 3 SGB IX). Die Gleichstellung erfolgt auf Antrag durch die Bundesagentur für Arbeit, wird mit dem Tag des Eingangs des Antrags wirksam und kann befristet werden; auf gleichgestellte behinderte Menschen werden die besonderen Regelungen für schwerbehinderte Menschen mit Ausnahme des § 208 und des Kapitels 13 angewendet (§ 151 SGB IX). Arbeitsplätze im Sinne dieser Regelungen sind auch Stellen, auf denen Beamtinnen und Beamte beschäftigt werden (§ 156 SGB IX). Nach § 164 Abs. 4 SGB IX haben schwerbehinderte Menschen gegenüber ihren Arbeitgebern Anspruch unter anderem auf behinderungsgerechte Gestaltung der Arbeitsorganisation und der Arbeitszeit; der Anspruch besteht nicht, soweit seine Erfüllung für den Arbeitgeber nicht zumutbar oder mit unverhältnismäßigen Aufwendungen verbunden wäre oder soweit beamtenrechtliche Vorschriften entgegenstehen. Nach § 164 Abs. 5 SGB IX besteht ein Anspruch auf Teilzeitbeschäftigung, wenn die kürzere Arbeitszeit wegen Art oder Schwere der Behinderung notwendig ist; Abs. 4 Satz 3 gilt entsprechend. Bei personen-, verhaltens- oder betriebsbedingten Schwierigkeiten im Beschäftigungsverhältnis, die zu dessen Gefährdung führen können, schaltet der Arbeitgeber möglichst frühzeitig die Schwerbehindertenvertretung und das Integrationsamt ein (§ 167 Abs. 1 SGB IX). Die Schwerbehindertenvertretung ist in allen Angelegenheiten, die einen einzelnen oder die schwerbehinderten Menschen als Gruppe berühren, unverzüglich und umfassend zu unterrichten und vor einer Entscheidung anzuhören; die Durchführung einer ohne Beteiligung getroffenen Entscheidung ist auszusetzen, die Beteiligung ist innerhalb von sieben Tagen nachzuholen (§ 178 Abs. 2 SGB IX). Schwerbehindertenvertretungen werden in Dienststellen mit wenigstens fünf schwerbehinderten Menschen gewählt (§ 177 SGB IX); bei den Mittelbehörden wird aus deren Schwerbehindertenvertretung und denen der nachgeordneten Dienststellen eine Bezirksschwerbehindertenvertretung gewählt, bei den obersten Dienstbehörden eine Hauptschwerbehindertenvertretung (§ 180 SGB IX). Der Arbeitgeber bestellt einen Inklusionsbeauftragten, der ihn in Angelegenheiten schwerbehinderter Menschen verantwortlich vertritt (§ 181 SGB IX). Schwerbehinderte Menschen werden auf ihr Verlangen von Mehrarbeit freigestellt (§ 207 SGB IX) und haben Anspruch auf einen bezahlten Zusatzurlaub von fünf Arbeitstagen (§ 208 SGB IX)."
  + " Die NRW-Richtlinie zur Durchführung der Rehabilitation und Teilhabe von Menschen mit Behinderungen (SGB IX) im öffentlichen Dienst konkretisiert dies für den Schulbereich: Als schwerbehinderte Menschen im Sinne der Richtlinie gelten auch Gleichgestellte, einschließlich der Beamtinnen und Beamten; als Nachweis der Gleichstellung gilt die Feststellung der Agentur für Arbeit; wer einen Antrag gestellt hat, ist bis zur Entscheidung unter Vorbehalt als schwerbehinderter oder gleichgestellter Mensch zu behandeln (Nr. 2). Bei der Unterrichtsverteilung und Stundenplangestaltung ist auf behinderungsbedingte Notwendigkeiten in der Regel Rücksicht zu nehmen; zu Vertretungsstunden sind schwerbehinderte und gleichgestellte Lehrkräfte nur in angemessenen Grenzen heranzuziehen und vorher zu ihrer Belastbarkeit zu hören; Arbeitszeiten und Pausen können abweichend geregelt werden, die regelmäßige wöchentliche Arbeitszeit darf nicht vermindert werden; der Anspruch auf Teilzeit nach § 164 Abs. 5 SGB IX ist nicht an den Schuljahreskalender gebunden; eine zusätzliche Pflichtstundenermäßigung setzt eine fachärztliche Bescheinigung voraus (eine hausärztliche genügt nicht), erfordert die Anhörung der Schwerbehindertenvertretung und wird längstens für drei Jahre bewilligt, und bei fehlender Einigung mit der Schwerbehindertenvertretung kann ausnahmsweise eine amtsärztliche Untersuchung verlangt werden; Mehrarbeit ist für Lehrkräfte die über die Zahl der wöchentlichen Pflichtstunden hinausgehende Heranziehung zum Unterricht (Nr. 8). Zusatzurlaub nach § 208 SGB IX gilt für Gleichgestellte nicht (Nr. 10).";

const EINORDNUNG_ADD =
  " Die offenen Verfahrensfragen lassen sich nach diesen Quellen wie folgt beantworten. Zuständigkeit: Die Untersuchung ordnet die dienstvorgesetzte Stelle an, bei Lehrkräften an öffentlichen Schulen, auch an Berufskollegs, die Bezirksregierung; die Schulleitung ist dafür nicht zuständig und informiert die Bezirksregierung. Fristen: § 33 Abs. 1 LBG NRW enthält keine Frist für die Anordnung; die Schulleitung sollte gleichwohl zeitnah handeln. Weigerung: Weigert sich die Lehrkraft ohne tragfähigen Grund, die Untersuchung wahrzunehmen oder den Stundenplan zu erfüllen, verletzt sie ihre Pflichten (BeamtStG § 35); ein Dienstvergehen setzt Verschulden voraus (BeamtStG § 47). Die Bezirksregierung hat bei zureichenden Anhaltspunkten ein Disziplinarverfahren einzuleiten, wenn eine Disziplinarmaßnahme in Betracht kommt (LDG NRW § 17); die Schulleitung leitet kein Disziplinarverfahren ein, sondern meldet den Sachverhalt."
  + " Beruft sich die Lehrkraft auf eine Gleichstellung mit schwerbehinderten Menschen, ändert das die Grundlogik nicht: Sie ist durch die Feststellung der Agentur für Arbeit nachzuweisen und ersetzt keine amtsärztliche Feststellung der Dienst- oder Einsatzfähigkeit. Wer einen Antrag gestellt hat, ist bis zur Entscheidung aber unter Vorbehalt wie ein Gleichgestellter zu behandeln. Die Schulleitung muss dann die Schwerbehindertenvertretung beteiligen (§ 178 Abs. 2 SGB IX) und auf behinderungsbedingte Notwendigkeiten bei der Stundenplangestaltung in der Regel Rücksicht nehmen; sie darf sich nicht allein auf die fehlende Bindungswirkung des privatärztlichen Attests berufen (§ 164 Abs. 4 SGB IX). Übergangsweise ist die volle Erfüllung des Stundenplans deshalb nicht in jedem Fall zwingend: Der Stundenplan ist zwar eine dienstliche Anordnung (BeamtStG § 35), bei schwerbehinderten und gleichgestellten Lehrkräften ist aber behinderungsbedingten Notwendigkeiten in der Regel Rechnung zu tragen; ob der Ausschluss der Nachmittagsarbeit behinderungsbedingt notwendig ist, ergibt sich nicht aus dem privatärztlichen Attest, sondern erfordert eine fachärztliche oder amtsärztliche Bewertung. Eine pauschale Befreiung von der Nachmittagsstunde folgt aus der Gleichstellung nicht. Der Anspruch aus § 164 Abs. 4 SGB IX steht unter dem Vorbehalt der Zumutbarkeit, des vertretbaren Aufwands und entgegenstehender beamtenrechtlicher Vorschriften; die Lage der Arbeitszeit kann angepasst werden, die regelmäßige wöchentliche Arbeitszeit darf nicht vermindert werden. Die Freistellung von Mehrarbeit (§ 207 SGB IX) bezieht sich nach der Richtlinie auf die über die Pflichtstunden hinausgehende Heranziehung zum Unterricht, nicht auf die regulär eingeplante Unterrichtsverpflichtung. Zusatzurlaub steht Gleichgestellten nicht zu (§ 151 SGB IX; Richtlinie Nr. 10)."
  + " Zuständige Schwerbehindertenvertretung: Für Lehrkräfte ist die Bezirksregierung die maßgebliche Dienststelle; Schwerbehindertenvertretungen und Stufenvertretungen werden nach § 177 und § 180 SGB IX gewählt, und für Lehrkräfte an Berufskollegs besteht auf oberster Ebene eine Hauptschwerbehindertenvertretung beim Ministerium. Welche Vertrauensperson im Einzelfall zuständig ist, erfragt die Schulleitung bei der Bezirksregierung.";

const EINORDNUNG_OFFEN =
  " Offen bleibt, wo bei einem Anspruch auf Teilzeit nach § 164 Abs. 5 SGB IX die Grenze der Zumutbarkeit verläuft, wenn dadurch Unterrichtsausfall oder erhebliche Mehrbelastung des Kollegiums entsteht, und ob die Regelermäßigung der Pflichtstunden, die gegenüber der Schule mit dem Schwerbehindertenausweis anzuzeigen ist, auch Gleichgestellten ohne Ausweis zusteht; die übergebenen Quellen enthalten dazu keine ausdrückliche Regelung.";

const RESPONSIBILITIES_NEW_BEZIRKSREGIERUNG =
  "Die Bezirksregierung als dienstvorgesetzte Stelle (VO 10-32 Nr. 44 § 2) ist zuständig für die Anordnung der amtsärztlichen Untersuchung und die formal-rechtliche Feststellung von Einsatzeinschränkungen; sie entscheidet auch über die Einleitung eines Disziplinarverfahrens (LDG NRW § 17). Die Schulleitung ist für diese Entscheidungen nicht dienstvorgesetzte Stelle, ordnet aber Mehrarbeit an (VO 10-32 Nr. 44 § 4) und meldet den Vorgang an die Bezirksregierung.";

const FAQ_REPLACE: Array<{ startsWith: string; item: { q: string; a: string } }> = [
  {
    startsWith: "Was bewirkt die Gleichstellung mit einem schwerbehinderten Menschen?",
    item: {
      q: "Was bewirkt die Gleichstellung mit einem schwerbehinderten Menschen?",
      a: "Gleichgestellt werden können Menschen mit einem Grad der Behinderung von weniger als 50, aber wenigstens 30, die ohne die Gleichstellung einen geeigneten Arbeitsplatz nicht erlangen oder nicht behalten könnten (§ 2 Abs. 3 SGB IX). Die Bundesagentur für Arbeit entscheidet auf Antrag; die Gleichstellung wirkt ab dem Tag des Antragseingangs und kann befristet werden. Auf Gleichgestellte werden die besonderen Regelungen für schwerbehinderte Menschen angewendet, mit Ausnahme des Zusatzurlaubs (§ 208) und des Kapitels 13 (§ 151 SGB IX); das gilt auch für Beamtinnen und Beamte (§ 156 SGB IX). Nach der NRW-Richtlinie gilt die Feststellung der Agentur für Arbeit als Nachweis; wer einen Antrag gestellt hat, ist bis zur Entscheidung unter Vorbehalt wie ein Gleichgestellter zu behandeln (Richtlinie SGB IX NRW Nr. 2).",
    },
  },
  {
    startsWith: "Befreit die Gleichstellung von der Nachmittagsstunde im Stundenplan?",
    item: {
      q: "Befreit die Gleichstellung von der Nachmittagsstunde im Stundenplan?",
      a: "Nicht pauschal. Bei schwerbehinderten und gleichgestellten Lehrkräften ist bei Unterrichtsverteilung und Stundenplangestaltung aber auf behinderungsbedingte Notwendigkeiten in der Regel Rücksicht zu nehmen, und zu Vertretungsstunden dürfen sie nur in angemessenen Grenzen herangezogen werden (Richtlinie SGB IX NRW Nr. 8; § 164 Abs. 4 SGB IX). Ob der Ausschluss der Nachmittagsarbeit behinderungsbedingt notwendig ist, muss belegt werden: Ein privatärztliches Attest bindet den Dienstherrn nicht, für eine zusätzliche Pflichtstundenermäßigung verlangt die Richtlinie eine fachärztliche Bescheinigung (eine hausärztliche genügt nicht). Die regelmäßige wöchentliche Arbeitszeit darf nicht vermindert werden. Die Freistellung von Mehrarbeit (§ 207 SGB IX) betrifft nur die über die Pflichtstunden hinausgehende Heranziehung zum Unterricht.",
    },
  },
];

const FAQ_ADD = [
  {
    q: "Wer ordnet die amtsärztliche Untersuchung an, und gibt es Fristen?",
    a: "Die dienstvorgesetzte Stelle: Für Lehrkräfte an öffentlichen Schulen, auch an Berufskollegs, ist das die Bezirksregierung (LBG NRW § 33; VO 10-32 Nr. 44 § 2). Schulämter und Schulen nehmen nur einzelne Aufgaben wahr (§§ 3, 4), zu denen die Anordnung nicht gehört; die Schulleitung informiert deshalb die Bezirksregierung. Eine Frist für die Anordnung sieht § 33 Abs. 1 LBG NRW nicht vor; zeitnahes Handeln ist dennoch geboten.",
  },
  {
    q: "Welche Folgen hat es, wenn die Lehrkraft die Untersuchung oder den Dienst verweigert?",
    a: "Die Weigerung kann eine Pflichtverletzung sein (§ 33 LBG NRW, § 35 BeamtStG). Ein Dienstvergehen liegt vor, wenn die Pflichten schuldhaft verletzt werden (§ 47 BeamtStG). Bei zureichenden tatsächlichen Anhaltspunkten hat die dienstvorgesetzte Stelle, also die Bezirksregierung, ein Disziplinarverfahren einzuleiten, es sei denn, eine Disziplinarmaßnahme kommt nicht in Betracht (§ 17 LDG NRW; VO 10-32 Nr. 44 § 10). Die Schulleitung leitet kein Disziplinarverfahren ein, sondern meldet den dokumentierten Vorgang.",
  },
  {
    q: "Wer bewilligt eine zusätzliche Pflichtstundenermäßigung?",
    a: "Der begründete Antrag wird dem Dienstvorgesetzten auf dem Dienstweg vorgelegt, zusammen mit einer fachärztlichen Bescheinigung (eine hausärztliche genügt nicht); die Schulleitung fügt eine Stellungnahme zu schulorganisatorischen Entlastungsmöglichkeiten bei. Der Dienstvorgesetzte unterrichtet die Schwerbehindertenvertretung umfassend, teilt seine beabsichtigte Entscheidung mit und entscheidet nach pflichtgemäßem Ermessen über Bewilligung, Umfang und Befristung, längstens für drei Jahre (Richtlinie SGB IX NRW Nr. 8). Dienstvorgesetzte Stelle ist für Lehrkräfte an Berufskollegs die Bezirksregierung; die Schulämter entscheiden über den Umfang von Pflichtstundenermäßigungen nur für Lehrkräfte an Grundschulen (VO 10-32 Nr. 44 §§ 2, 3 Nr. 3).",
  },
  {
    q: "Welche Schwerbehindertenvertretung ist für die Lehrkraft zuständig?",
    a: "Maßgebliche Dienststelle für Lehrkräfte ist die Bezirksregierung. Schwerbehindertenvertretungen werden in Dienststellen mit wenigstens fünf schwerbehinderten Menschen gewählt, bei den Mittelbehörden gibt es eine Bezirksschwerbehindertenvertretung, bei der obersten Dienstbehörde eine Hauptschwerbehindertenvertretung (§§ 177, 180 SGB IX); für Lehrkräfte an Berufskollegs besteht eine Hauptschwerbehindertenvertretung beim Ministerium für Schule und Bildung. Wer im Einzelfall die zuständige Vertrauensperson ist, erfragt die Schulleitung bei der Bezirksregierung.",
  },
];

const PRACTICE_TIP_REPLACE: Array<{ startsWith: string; text: string }> = [
  {
    startsWith: "- [Praktisch empfohlen] Nachweis der Gleichstellung",
    text: "- [Praktisch empfohlen] Nachweis der Gleichstellung (Feststellung der Agentur für Arbeit) erbitten; liegt nur ein Antrag vor, die Lehrkraft bis zur Entscheidung unter Vorbehalt wie eine gleichgestellte behandeln und den Antragszeitpunkt festhalten (Richtlinie SGB IX NRW Nr. 2; § 151 SGB IX)",
  },
  {
    startsWith: "- [Bei Unsicherheit] Mit dem Schulamt klären",
    text: "- [Bei Unsicherheit] Zuständig für die Anordnung der Untersuchung ist die Bezirksregierung als dienstvorgesetzte Stelle (VO 10-32 Nr. 44 § 2); eine Frist ist in § 33 LBG NRW nicht geregelt, deshalb zeitnah handeln",
  },
];

const CHECKLIST_REPLACE: Array<{ startsWith: string; text: string }> = [
  {
    startsWith: "[Organisatorisch empfohlen] Bei Berufung auf Gleichstellung: Nachweis",
    text: "[Organisatorisch empfohlen] Bei Berufung auf Gleichstellung: Nachweis (Feststellung der Agentur für Arbeit) erbitten; liegt nur ein Antrag vor, bis zur Entscheidung unter Vorbehalt wie ein Gleichgestellter behandeln und den Antragszeitpunkt dokumentieren (Richtlinie SGB IX NRW Nr. 2; § 151 SGB IX)",
  },
];

const MISTAKES_ADD = [
  "[Organisatorisch ungünstig] Eine Lehrkraft, die einen Gleichstellungsantrag gestellt hat, bis zur Entscheidung wie eine nicht behinderte Lehrkraft behandeln, obwohl sie unter Vorbehalt wie eine gleichgestellte zu behandeln ist (Richtlinie SGB IX NRW Nr. 2)",
  "[Organisatorisch ungünstig] Die Untersuchung beim Schulamt statt bei der Bezirksregierung als dienstvorgesetzter Stelle anregen oder ein Disziplinarverfahren selbst einleiten wollen (VO 10-32 Nr. 44 §§ 2, 10)",
];

// Zuständigkeits-Korrektur: Schulamt/Dienstherr -> Bezirksregierung (VO 10-32 Nr. 44 § 2).
const REPLACEMENTS: Array<[string, string]> = [
  ["Dienstherrn bzw. das zuständige Schulamt", "die Bezirksregierung als dienstvorgesetzte Stelle"],
  ["den Dienstherrn bzw. das Schulamt", "die Bezirksregierung"],
  ["Dienstherrn bzw. Schulamt", "Bezirksregierung (dienstvorgesetzte Stelle)"],
  ["Schulamt und ggf. Personalrat", "Bezirksregierung und ggf. Personalrat"],
  ["Weitergabe an Bezirksregierung (dienstvorgesetzte Stelle) mit Bitte", "Weitergabe an die Bezirksregierung (dienstvorgesetzte Stelle) mit Bitte"],
  ["an Schulamt mit Darlegung", "an die Bezirksregierung mit Darlegung"],
  ["Parallel: Schulamt informieren", "Parallel: Bezirksregierung informieren"],
  ["der Dienstherrn (Schulamt, Kreis)", "die Bezirksregierung (dienstvorgesetzte Stelle)"],
  ["dem Dienstherrn/Schulamt", "der Bezirksregierung"],
  ["den Dienstherrn (Schulamt/Kreis)", "die Bezirksregierung (dienstvorgesetzte Stelle)"],
  ["des Dienstherrn/Schulamts", "der Bezirksregierung"],
  ["E-Mail an Schulamt", "E-Mail an die Bezirksregierung"],
  ["beim Dienstherrn (Schulamt, Kreis oder Stadt)", "bei der Bezirksregierung als dienstvorgesetzter Stelle"],
  ["Kollegium, Schulamt)", "Kollegium, Bezirksregierung)"],
  ["Schulamtsunterstützung", "Unterstützung der Bezirksregierung"],
  ["konsultiert den Dienstherrn über disziplinäre oder weitere Maßnahmen", "meldet den Vorgang der Bezirksregierung als dienstvorgesetzter Stelle, die über disziplinarische Schritte entscheidet (LDG NRW § 17)"],
];

function mapStrings(o: any, f: (s: string) => string): any {
  if (typeof o === "string") return f(o);
  if (Array.isArray(o)) return o.map((x) => mapStrings(x, f));
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, mapStrings(v, f)]));
  return o;
}
const applyReplacements = (s: string) => REPLACEMENTS.reduce((acc, [a, b]) => acc.split(a).join(b), s);

function replaceByPrefix(arr: any[], prefix: string, nu: any, what: string): any[] {
  const i = arr.findIndex((x) => (typeof x === "string" ? x : x.q).startsWith(prefix));
  if (i < 0) throw new Error(`${what}: Eintrag "${prefix}" nicht gefunden`);
  const copy = [...arr]; copy[i] = nu; return copy;
}

// ---------------------------------------------------------------------------
// Entscheidungsbaum
// ---------------------------------------------------------------------------

function updateTree(tree0: any): any {
  const tree = mapStrings(tree0, applyReplacements);
  tree.meta = { ...(tree.meta ?? {}), status: "approved", version: (tree0.meta?.version ?? 1) + 1 };

  tree.steps.frage_status.explanation =
    "Die Gleichstellung (Grad der Behinderung von wenigstens 30, aber weniger als 50) erfolgt auf Antrag durch die Bundesagentur für Arbeit; danach gelten die besonderen Regelungen für schwerbehinderte Menschen (§ 2 Abs. 3, § 151 SGB IX). Wer einen Antrag gestellt hat, ist bis zur Entscheidung unter Vorbehalt wie ein Gleichgestellter zu behandeln (Richtlinie SGB IX NRW Nr. 2). Davon hängt ab, ob die Schwerbehindertenvertretung zu beteiligen ist und ob bei der Stundenplangestaltung auf behinderungsbedingte Notwendigkeiten Rücksicht zu nehmen ist.";
  tree.steps.frage_status.options = [
    { label: "Nein, die Lehrkraft beruft sich nur auf das privatärztliche Attest.", next: "frage_1" },
    { label: "Ja, die Feststellung der Agentur für Arbeit (Gleichstellung) oder ein Schwerbehindertenausweis liegt vor.", next: "frage_sbv" },
    { label: "Die Lehrkraft hat die Gleichstellung (oder Feststellung der Schwerbehinderung) beantragt, die Entscheidung steht noch aus.", next: "frage_sbv" },
    { label: "Die Lehrkraft beruft sich auf die Gleichstellung, hat aber weder einen Bescheid vorgelegt noch einen Antrag gestellt.", result: "ergebnis_gleichstellung_nicht_nachgewiesen" },
  ];
  tree.steps.frage_sbv.explanation =
    "Der Arbeitgeber muss die Schwerbehindertenvertretung in allen Angelegenheiten, die einen einzelnen schwerbehinderten Menschen berühren, unverzüglich und umfassend unterrichten und vor einer Entscheidung anhören (§ 178 Abs. 2 SGB IX). Das gilt auch für Gleichgestellte (§ 151 SGB IX) und, nach der NRW-Richtlinie, bis zur Entscheidung über einen gestellten Antrag unter Vorbehalt.";

  tree.results.ergebnis_gleichstellung_nicht_nachgewiesen = {
    color: "gelb",
    urgency: "mittel",
    title: "Gleichstellung behauptet, aber weder nachgewiesen noch beantragt – Status klären, Standardverfahren fortführen",
    steps: [
      "Schulleitung bittet die Lehrkraft schriftlich, die Feststellung der Agentur für Arbeit vorzulegen oder, falls noch kein Antrag gestellt wurde, darzulegen, ob ein Antrag beabsichtigt ist",
      "Schulleitung weist darauf hin, dass sich die Lehrkraft bei der Antragstellung von der Schwerbehindertenvertretung helfen lassen kann und dass ein gestellter Antrag der Dienststelle schriftlich mitgeteilt werden sollte (Richtlinie SGB IX NRW Nr. 2)",
      "Schulleitung erläutert, dass die Gleichstellung durch die Entscheidung der Bundesagentur für Arbeit erfolgt, auf Antrag mit Wirkung ab Antragseingang, und befristet sein kann (§ 151 SGB IX)",
      "Parallel wird das Standardverfahren fortgeführt: Die Bezirksregierung als dienstvorgesetzte Stelle wird gebeten, die amtsärztliche Untersuchung anzuordnen (LBG NRW § 33; VO 10-32 Nr. 44 § 2)",
      "Gespräch, gesetzte Frist und gegebenenfalls der angegebene Antragszeitpunkt werden schriftlich dokumentiert",
      "Sobald ein Antrag gestellt oder ein Bescheid vorgelegt wird, wird die Lehrkraft unter Vorbehalt wie eine gleichgestellte behandelt und die Schwerbehindertenvertretung beteiligt",
    ],
    warning: "Ohne Antrag und ohne Bescheid besteht keine Gleichstellung, aus der Rechte abgeleitet werden könnten. Sobald ein Antrag gestellt ist, ist die Lehrkraft bis zur Entscheidung unter Vorbehalt wie eine gleichgestellte zu behandeln, und eine bewilligte Gleichstellung wirkt ab dem Tag des Antragseingangs (§ 151 SGB IX). Irreversible Maßnahmen wie disziplinarische Schritte sollten deshalb nicht ohne Klärung des Status eingeleitet werden.",
    responsible: "Schulleitung; Schwerbehindertenvertretung (Hilfe bei der Antragstellung); Bezirksregierung (Anordnung der Untersuchung); Bundesagentur für Arbeit (Entscheidung über die Gleichstellung)",
    documentation: "Schriftliche Aufforderung zum Nachweis mit Fristsetzung; Gesprächsprotokoll; Vermerk zum Antragszeitpunkt, falls ein Antrag gestellt wird.",
    recommendation: "Die Lehrkraft beruft sich auf eine Gleichstellung mit schwerbehinderten Menschen, hat aber weder einen Bescheid vorgelegt noch einen Antrag gestellt. Die Schulleitung sollte den Nachweis sachlich und schriftlich erbitten und auf die Hilfe der Schwerbehindertenvertretung bei der Antragstellung hinweisen. Das Verfahren zur amtsärztlichen Klärung läuft unabhängig davon weiter, denn die Gleichstellung ersetzt keine amtliche Feststellung der Dienst- oder Einsatzfähigkeit. Ohne Antrag und Bescheid bleibt der Stundenplan verbindlich; wird ein Antrag gestellt oder ein Bescheid vorgelegt, ist die Lehrkraft unter Vorbehalt wie eine gleichgestellte zu behandeln und die Schwerbehindertenvertretung unverzüglich zu beteiligen.",
  };

  tree.results.ergebnis_sbv_nicht_beteiligt.steps[0] =
    "Schulleitung unterrichtet die zuständige Schwerbehindertenvertretung (Auskunft über die zuständige Vertrauensperson erteilt die Bezirksregierung) unverzüglich und umfassend über Attest, Streit um den Stundenplan und die bisherigen Schritte (§ 178 Abs. 2 SGB IX)";
  tree.results.ergebnis_sbv_nicht_beteiligt.steps[3] =
    "Schulleitung prüft mit der Schwerbehindertenvertretung frühzeitig Hilfen nach § 167 Abs. 1 SGB IX (Einschaltung von Schwerbehindertenvertretung und Integrationsamt), den Anspruch auf behinderungsgerechte Arbeitszeitgestaltung (§ 164 Abs. 4 SGB IX) und eine befristete Stundenplanlösung für die Übergangszeit; auf behinderungsbedingte Notwendigkeiten ist dabei in der Regel Rücksicht zu nehmen (Richtlinie SGB IX NRW Nr. 8)";
  return tree;
}

// ---------------------------------------------------------------------------
// Normverknüpfungen
// ---------------------------------------------------------------------------

type LinkSpec = { source: { short?: string; titleLike?: string; idPrefix?: string }; ref: RegExp; from: string; to: string; precise: string; why: string; kind?: "wortlaut" | "zusammengefasst"; summary?: string };
const NEW_LINKS: LinkSpec[] = [
  { source: { idPrefix: "0ab547f6" }, ref: /^§ 2$/, from: "Abweichend von § 1 Absatz 1", to: "Lehrkräfte an öffentlichen Schulen,", precise: "§ 2 Abs. 1 Nr. 1", why: "Bezirksregierung ist dienstvorgesetzte Stelle der Lehrkräfte an öffentlichen Schulen – zuständig für die Anordnung der Untersuchung (LBG NRW § 33)." },
  { source: { idPrefix: "0ab547f6" }, ref: /^§ 4$/, from: "Folgende Aufgaben der dienstvorgesetzten Stelle der Lehrkräfte an öffentlichen Schulen werden durch die Schulleiterinnen und Schulleiter wahrgenommen:", to: "3. Anordnung, Genehmigung und Widerruf von Mehrarbeit,", precise: "§ 4 Nr. 3", why: "Zeigt, welche Aufgaben bei der Schulleitung liegen (u. a. Mehrarbeit) – die Anordnung der Untersuchung gehört nicht dazu." },
  { source: { idPrefix: "0ab547f6" }, ref: /^§ 10$/, from: "die Leiterin oder der Leiter 1. der Bezirksregierungen", to: "des für Schule zuständigen Ministeriums,", precise: "§ 10 Abs. 1 Nr. 1", why: "Dienstvorgesetzte Stelle im Sinne des § 17 LDG NRW ist für Lehrkräfte die Leitung der Bezirksregierung." },
  { source: { titleLike: "Richtlinie zur Durchführung der Rehabilitation und Teilhabe von Menschen mit Behinderungen%" }, ref: /^2$/, from: "Als Nachweis der Gleichstellung gilt die Feststellung der Agentur für Arbeit.", to: "als gleichgestellte behinderte Menschen zu behandeln.", precise: "Nr. 2", why: "Nachweis der Gleichstellung; Vorbehalt bei gestelltem Antrag; Hilfe der Schwerbehindertenvertretung beim Antrag." },
  { source: { titleLike: "Richtlinie zur Durchführung der Rehabilitation und Teilhabe von Menschen mit Behinderungen%" }, ref: /^8$/, from: "Bei der Unterrichtsverteilung und Stundenplangestaltung", to: "vorher zu hören.", precise: "Nr. 8 (Hinweise für den Schulbereich)", why: "Rücksichtnahme auf behinderungsbedingte Notwendigkeiten bei Stundenplan und Vertretungsstunden." },
  { source: { short: "BeamtStG" }, ref: /§ 47$/, from: "Beamtinnen und Beamte begehen ein Dienstvergehen", to: "Pflichten verletzen.", precise: "§ 47 Abs. 1", why: "Dienstvergehen bei schuldhafter Pflichtverletzung – Folge einer unberechtigten Weigerung." },
  { source: { short: "LDG NRW" }, ref: /§ 17$/, from: "Liegen zureichende tatsächliche Anhaltspunkte vor", to: "hierüber unverzüglich zu unterrichten.", precise: "§ 17 Abs. 1", why: "Pflicht der dienstvorgesetzten Stelle zur Einleitung eines Disziplinarverfahrens bei zureichenden Anhaltspunkten." },
  { source: { short: "SGB IX" }, ref: /§ 177$/, from: "In Betrieben und Dienststellen, in denen wenigstens fünf", to: "im Falle der Verhinderung vertritt.", precise: "§ 177 Abs. 1", why: "Wahl der Schwerbehindertenvertretung – Grundlage der Frage, welche Vertretung zuständig ist." },
  { source: { short: "SGB IX" }, ref: /§ 180$/, from: "Für den Geschäftsbereich mehrstufiger Verwaltungen", to: "Bezirksschwerbehindertenvertretung zu wählen ist.", precise: "§ 180 Abs. 4", why: "Stufenvertretung (Bezirks- und Hauptschwerbehindertenvertretung) in mehrstufigen Verwaltungen wie der Schulverwaltung." },
];

// ---------------------------------------------------------------------------

async function main() {
  const stage = process.argv[2];
  if (!["check", "edit", "flags"].includes(stage ?? "")) { console.error("Aufruf: ... <check|edit|flags>"); process.exit(1); }
  await bootstrapSession();
  const { supabase } = await import("../src/integrations/supabase/client");
  const { updateCase } = await import("../src/lib/coreBuilder");
  const { parseCuratedTree, validateCuratedTree } = await import("../src/lib/decisionTree");
  const backup = JSON.parse(readFileSync(BACKUP_PATH, "utf8")).case;
  const { data: cur, error } = await supabase.from("practice_cases").select("*").eq("id", CASE_ID).single();
  if (error) throw error;
  const row = cur as any;

  if (stage === "flags") {
    const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const closeIds = ["d97bfb40", "ab24da63", "f8515baf", "828e8363", "e5622f91", "d2a7d1cf", "bf3cedac", "5a649723"];
    const { data: flags } = await admin.from("case_legal_review_flags").select("id, reason").eq("case_id", CASE_ID).is("resolved_at", null);
    for (const f of flags ?? []) {
      if (!closeIds.some((p) => f.id.startsWith(p))) continue;
      const { error: e } = await admin.from("case_legal_review_flags").update({ resolved_at: new Date().toISOString(), resolved_by: ADMIN_ID }).eq("id", f.id);
      if (e) throw e;
      console.log("geschlossen (beantwortet):", f.id.slice(0, 8), "|", f.reason.slice(0, 80));
    }
    const newQ = "Steht die Regelermäßigung der Pflichtstunden, die gegenüber der Schule mit dem Schwerbehindertenausweis anzuzeigen ist (Richtlinie SGB IX NRW Nr. 8), auch Gleichgestellten ohne Ausweis zu?";
    const { data: ex } = await admin.from("case_legal_review_flags").select("id").eq("case_id", CASE_ID).eq("reason", newQ);
    if (!ex?.length) {
      const { error: e } = await admin.from("case_legal_review_flags").insert({ case_id: CASE_ID, reason: newQ });
      if (e) throw e;
      console.log("neue offene Rechtsfrage angelegt");
    }
    return;
  }

  const dry = stage === "check";
  if (!dry && row.workflow_status !== "draft") throw new Error(`Fall ist nicht im Entwurf (${row.workflow_status}) - zuerst 'prepare'.`);

  // legal_explanation aus dem Original neu zusammensetzen (ohne Fassung 1).
  const parts = String(backup.legal_explanation).split(/\n\nRECHTLICHE EINORDNUNG:/);
  if (parts.length !== 2) throw new Error("Original-legal_explanation hat unerwartetes Format.");
  const idxOffen = parts[1].lastIndexOf(" Die Rechtslage zu den konkreten Verfahrensschritten");
  if (idxOffen < 0) throw new Error("Abschlusssatz der Einordnung nicht gefunden.");
  const legalExplanation =
    `${parts[0].trimEnd()}${VORGEGEBEN_ADD}\n\nRECHTLICHE EINORDNUNG:${parts[1].slice(0, idxOffen)}${EINORDNUNG_ADD}${EINORDNUNG_OFFEN}`;

  // responsibilities: Original + Zuständigkeits-Satz ersetzen + Ergänzung der Fassung 1
  const oldResp = "Der Dienstherrn (Schulamt, Kreis oder Stadt) ist zuständig für die Anordnung der amtsärztlichen Untersuchung und die formal-rechtliche Feststellung von Einsatzeinschränkungen.";
  if (!String(backup.responsibilities).includes(oldResp)) throw new Error("Original-Zuständigkeitssatz nicht gefunden.");
  const addResp = String(row.responsibilities).slice(String(backup.responsibilities).trimEnd().length);
  const responsibilities = String(backup.responsibilities).replace(oldResp, RESPONSIBILITIES_NEW_BEZIRKSREGIERUNG).trimEnd() + addResp;

  let practiceTip = mapStrings(String(row.practice_tip), applyReplacements) as string;
  for (const r of PRACTICE_TIP_REPLACE) {
    const lines = practiceTip.split("\n"); const i = lines.findIndex((l) => l.startsWith(r.startsWith));
    if (i < 0) lines.push(r.text); else lines[i] = r.text;
    practiceTip = lines.join("\n");
  }
  let checklist: string[] = mapStrings(row.checklist, applyReplacements);
  for (const r of CHECKLIST_REPLACE) checklist = replaceByPrefix(checklist, r.startsWith, r.text, "checklist");
  const documentation: string[] = mapStrings(row.documentation, applyReplacements);
  let faq: any[] = mapStrings(row.faq, applyReplacements);
  for (const r of FAQ_REPLACE) faq = replaceByPrefix(faq, r.startsWith, r.item, "faq");
  faq = [...faq, ...FAQ_ADD];
  const mistakes: string[] = [...mapStrings(row.common_mistakes, applyReplacements), ...MISTAKES_ADD];

  const newTree = updateTree(row.decision_tree);
  const parsed = parseCuratedTree(newTree);
  const report = parsed ? validateCuratedTree(parsed) : null;
  if (!report?.valid) throw new Error("Neuer Entscheidungsbaum ungültig: " + JSON.stringify(report));

  const payload: Record<string, unknown> = {
    short_answer: SHORT_ANSWER,
    immediate_actions: IMMEDIATE_ACTIONS,
    recommendation: RECOMMENDATION,
    legal_explanation: legalExplanation,
    responsibilities,
    practice_tip: practiceTip,
    checklist,
    documentation,
    faq,
    common_mistakes: mistakes,
    decision_tree: newTree,
  };

  // Verbleibende "Schulamt"-Treffer zur Kontrolle ausgeben.
  const rest: string[] = [];
  const scan = (o: any, p: string) => {
    if (typeof o === "string") { if (/Schulamt|Schulämter/.test(o)) rest.push(`${p}: …${o.slice(Math.max(0, o.search(/Schulamt|Schulämter/) - 40), o.search(/Schulamt|Schulämter/) + 60)}…`); }
    else if (Array.isArray(o)) o.forEach((x, i) => scan(x, `${p}[${i}]`));
    else if (o && typeof o === "object") Object.entries(o).forEach(([k, v]) => scan(v, `${p}.${k}`));
  };
  scan(payload, "");

  // Links vorbereiten
  const { data: allSrc } = await supabase.from("legal_sources").select("id, short_name, title");
  const linkRows: any[] = [];
  const norm = (s: string) => s.replace(/\s+/g, " ");
  for (const l of NEW_LINKS) {
    const src = (allSrc ?? []).filter((s: any) =>
      l.source.idPrefix ? s.id.startsWith(l.source.idPrefix)
        : l.source.short ? s.short_name === l.source.short
        : new RegExp("^" + l.source.titleLike!.replace(/%/g, ".*"), "i").test(s.title))[0] as any;
    if (!src) throw new Error(`Quelle nicht gefunden: ${JSON.stringify(l.source)}`);
    const { data: secs } = await supabase.from("legal_sections").select("id, reference, content").eq("source_id", src.id);
    const sec = (secs ?? []).find((s: any) => l.ref.test(s.reference)) as any;
    if (!sec) throw new Error(`Abschnitt ${l.ref} in ${src.title.slice(0, 50)} nicht gefunden`);
    const c = norm(sec.content); const i = c.indexOf(l.from); const j = c.indexOf(l.to, i);
    if (i < 0 || j < 0) throw new Error(`Auszug für ${l.precise} nicht auffindbar (${i}/${j})`);
    linkRows.push({ case_id: CASE_ID, legal_section_id: sec.id, content_summary: c.slice(i, j + l.to.length), content_summary_kind: "wortlaut", precise_reference: l.precise, explanation: l.why });
  }

  if (dry) {
    console.log(`Trockenlauf OK: Baum gültig (${Object.keys(newTree.steps).length} Fragen, ${Object.keys(newTree.results).length} Ergebnisse), ${linkRows.length} Normauszüge gefunden.`);
    console.log("Verbleibende Schulamt-Treffer:", rest.length ? "\n  " + rest.join("\n  ") : "keine");
    for (const r of linkRows) console.log(`  ${String(r.precise_reference).padEnd(36)} ${r.content_summary.slice(0, 80)}…`);
    return;
  }

  const { data: existing } = await (supabase.from("case_legal_links") as any).select("legal_section_id").eq("case_id", CASE_ID);
  const have = new Set((existing ?? []).map((e: any) => e.legal_section_id));
  const toInsert = linkRows.filter((r) => !have.has(r.legal_section_id));
  if (toInsert.length) {
    const { error: e } = await (supabase.from("case_legal_links") as any).insert(toInsert);
    if (e) throw new Error("Links einfügen fehlgeschlagen: " + e.message);
  }
  console.log(`Rechtsgrundlagen: ${toInsert.length} neu verknüpft, ${linkRows.length - toInsert.length} schon vorhanden`);
  await updateCase(CASE_ID, payload as any);
  console.log("Fall aktualisiert (Schulamt-Resttreffer:", rest.length, ")");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FEHLER:", e?.message ?? e); process.exit(1); });
