/**
 * Fall "Nebentätigkeit einer Lehrkraft: Software entwickeln und an Schulen im
 * eigenen Aufsichtsbezirk verkaufen - Interessenkonflikt" (Entwurf, Nutzer-
 * Auftrag 02.10.2026). Die automatische Verknüpfung hatte nur drei unpassende
 * Quellen gefunden (u. a. DSG NRW § 31) und § 52 LBG als Genehmigungsnorm
 * genannt. Dieses Skript ersetzt Texte, Entscheidungsbaum und Rechtsgrundlagen
 * durch eine quellenbasierte Fassung (LBG NRW §§ 49, 51-54, BeamtStG §§ 34, 37,
 * 40, 42, 47, VwVfG NRW §§ 20, 21, UrhG § 69b, StGB §§ 331, 332, VO 10-32
 * Nr. 44 § 2, LDG NRW § 17).
 *
 * Aufruf: bun run scripts/_update-case-nebentaetigkeit.ts <check|edit>
 * Der Fall bleibt Entwurf (kein Workflow-Schritt in diesem Skript).
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

const CASE_ID = "3c046b3e-d9d2-43d5-9d97-78897a701107";
const ADMIN_EMAIL = "admin@rechtkompass.local";

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

const CATEGORY = "Dienstrecht";
const SUBCATEGORY = "Nebentätigkeit, Interessenkonflikt, Verschwiegenheit";

const SHORT_DESCRIPTION =
  "Eine verbeamtete Lehrkraft entwickelt in ihrer Freizeit eine Software und möchte sie später entgeltlich an Schulen und Schulträger verkaufen, auch im Aufsichtsbezirk ihrer eigenen Schule und Bezirksregierung. Sie kennt Entscheidungsträger aus ihrer dienstlichen Tätigkeit. Die Fragen: Ist das als Nebentätigkeit zulässig und genehmigungspflichtig? Besteht ein Interessenkonflikt, wenn die Käufer die eigene Behörde oder deren Umfeld sind? Darf die Lehrkraft dienstliche Kontakte und Kenntnisse für das private Geschäft nutzen? Und wem gehört die Software?";

const SHORT_ANSWER =
  "Ja, eine Lehrkraft im Beamtenverhältnis darf Software entwickeln und anbieten, braucht dafür aber vor Aufnahme der Tätigkeit die schriftliche Genehmigung ihrer dienstvorgesetzten Stelle, bei Lehrkräften an öffentlichen Schulen der Bezirksregierung (§ 49 Abs. 1 LBG NRW; VO 10-32 Nr. 44 § 2); eine Nebentätigkeit ist nach § 40 BeamtStG grundsätzlich anzeigepflichtig und darf nur außerhalb der Arbeitszeit ausgeübt werden (§ 52 LBG NRW). Die Genehmigung ist zu versagen, wenn dienstliche Interessen beeinträchtigt werden können, insbesondere wenn die Tätigkeit in einer Angelegenheit ausgeübt wird, in der die eigene Behörde tätig wird oder werden kann, wenn sie die Unparteilichkeit oder Unbefangenheit beeinflussen kann oder dem Ansehen der Verwaltung abträglich sein kann (§ 49 Abs. 2 LBG NRW). Ein Verkauf an die eigene Schule, die eigene Behörde oder Schulen im eigenen Aufsichtsbereich begründet deshalb einen naheliegenden Versagungsgrund; die Entscheidung trifft die Bezirksregierung im Einzelfall und kann mit Auflagen verbunden werden. Dienstliche Kontakte, dienstliche Kenntnisse und Dienstmittel dürfen für das Geschäft nicht genutzt werden (Verschwiegenheit § 37 BeamtStG, uneigennützige Aufgabenwahrnehmung § 34 BeamtStG, Dienstmittel nur mit Genehmigung und gegen Entgelt § 54 LBG NRW).";

const IMMEDIATE_ACTIONS =
  "Vor Aufnahme der entgeltlichen Tätigkeit den schriftlichen Antrag auf Genehmigung bei der dienstvorgesetzten Stelle stellen und darin Art, Umfang, geplante Kunden, Zeitaufwand und Entgelte darlegen (§ 52 LBG NRW). Bis zur Entscheidung keine Verträge schließen, keine Preise nennen und keine Kunden im dienstlichen Umfeld ansprechen. Wird die Software bereits unentgeltlich im Kollegium genutzt, diese Tätigkeit der dienstvorgesetzten Stelle anzeigen (§ 40 BeamtStG). Dienstliche Geräte, Räume, Zeiten und Kontakte nicht verwenden. Beschaffungsentscheidungen der eigenen Schule oder Behörde, die das Produkt betreffen könnten, nicht mitgestalten und die Behördenleitung bei Zweifeln unterrichten.";

const RECOMMENDATION =
  "Gehen Sie in dieser Reihenfolge vor: (1) Klären Sie, ob die Tätigkeit entgeltlich oder gewerblich sein soll; in diesem Fall ist sie genehmigungspflichtig (§ 49 Abs. 1 Nr. 2 LBG NRW), und unabhängig davon ist jede Nebentätigkeit grundsätzlich anzeigepflichtig (§ 40 BeamtStG). Ob rein redaktionelle Inhalte als schriftstellerische Tätigkeit genehmigungsfrei sein können (§ 51 Abs. 1 Nr. 2 LBG NRW), sollten Sie ausdrücklich bei der Bezirksregierung abklären lassen; auch genehmigungsfreie Tätigkeiten sind zu untersagen, wenn sie dienstliche Interessen beeinträchtigen. (2) Stellen Sie den Antrag schriftlich vor Beginn der Tätigkeit und legen Sie Art, Umfang und Entgelte nachvollziehbar dar (§ 52 LBG NRW); die Tätigkeit darf nur außerhalb der Arbeitszeit stattfinden. (3) Benennen Sie im Antrag offen, wer die Kunden sein sollen. Rechnen Sie damit, dass ein Verkauf an Schulen oder Träger im eigenen Aufsichtsbezirk als Interessenkonflikt gewertet wird (§ 49 Abs. 2 Nr. 3, 4 und 6 LBG NRW); eine Beschränkung des Kundenkreises oder Auflagen können die Genehmigung erleichtern. (4) Nutzen Sie keine dienstlichen Kontakte, Kenntnisse oder Mittel für das Geschäft (§§ 34, 37 BeamtStG; § 54 LBG NRW). (5) Halten Sie Entwicklung und Dienst strikt getrennt und dokumentieren Sie, dass die Software ohne dienstlichen Auftrag, außerhalb der Arbeitszeit und ohne Dienstmittel entstanden ist; nur dann bleibt das Urheberrecht bei Ihnen (§ 69b UrhG). (6) Beteiligen Sie sich nicht an Entscheidungen Ihrer Behörde über den Kauf Ihres Produkts und unterrichten Sie die Behördenleitung bei Befangenheitsfragen (§§ 20, 21 VwVfG NRW, soweit anwendbar). (7) Nehmen Sie keine Vorteile in Bezug auf Ihr Amt an (§ 42 BeamtStG; §§ 331, 332 StGB). (8) Melden Sie Änderungen unverzüglich und, soweit die Höchstgrenze überschritten wird, jährlich die Nebeneinnahmen (§§ 52, 53 LBG NRW).";

const LEGAL_EXPLANATION =
  "RECHTLICH VORGEGEBEN: Eine Nebentätigkeit ist nach § 40 BeamtStG grundsätzlich anzeigepflichtig und steht unter Erlaubnis- oder Verbotsvorbehalt, soweit sie geeignet ist, dienstliche Interessen zu beeinträchtigen. Nach § 49 Abs. 1 LBG NRW bedürfen Beamtinnen und Beamte der vorherigen Genehmigung unter anderem zu einer Nebenbeschäftigung gegen Vergütung, zu einer gewerblichen Tätigkeit und zur Ausübung eines freien Berufes. Die Genehmigung ist zu versagen, wenn die Nebentätigkeit dienstliche Interessen beeinträchtigen kann; ein Versagungsgrund liegt insbesondere vor, wenn sie die Arbeitskraft so stark in Anspruch nimmt, dass die ordnungsgemäße Erfüllung der dienstlichen Pflichten behindert werden kann (in der Regel bei mehr als einem Fünftel der regelmäßigen wöchentlichen Arbeitszeit), wenn sie in Widerstreit mit den dienstlichen Pflichten bringen kann, wenn sie in einer Angelegenheit ausgeübt wird, in der die Behörde oder Einrichtung, der die Beamtin oder der Beamte angehört, tätig wird oder werden kann, wenn sie die Unparteilichkeit oder Unbefangenheit beeinflussen kann, wenn sie zu einer wesentlichen Einschränkung der künftigen dienstlichen Verwendbarkeit führen kann oder dem Ansehen der öffentlichen Verwaltung abträglich sein kann. Die Genehmigung ist für jede einzelne Nebentätigkeit zu erteilen, auf längstens fünf Jahre zu befristen, kann mit Auflagen und Bedingungen versehen werden, erlischt bei Versetzung zu einer anderen Dienststelle und ist bei späterer Beeinträchtigung dienstlicher Interessen zu widerrufen (§ 49 LBG NRW). Nicht genehmigungspflichtig sind unter anderem schriftstellerische, wissenschaftliche, künstlerische oder Vortragstätigkeiten; ergibt sich eine Beeinträchtigung dienstlicher Interessen, ist die Nebentätigkeit zu untersagen (§ 51 LBG NRW). Nebentätigkeiten, die nicht auf Verlangen oder Veranlassung der dienstvorgesetzten Stelle übernommen werden, dürfen nur außerhalb der Arbeitszeit ausgeübt werden; Anträge und Entscheidungen bedürfen der Schriftform, Art und Umfang der Tätigkeit sowie die Entgelte sind nachzuweisen, Änderungen unverzüglich anzuzeigen (§ 52 LBG NRW). Nebeneinnahmen sind jährlich aufzustellen, wenn sie die durch Rechtsverordnung bestimmte Höchstgrenze übersteigen (§ 53 LBG NRW). Einrichtungen, Personal oder Material des Dienstherrn dürfen für Nebentätigkeiten nur mit Genehmigung und gegen angemessenes Entgelt in Anspruch genommen werden (§ 54 LBG NRW). Dienstvorgesetzte Stelle ist für Lehrkräfte an öffentlichen Schulen die Bezirksregierung (VO 10-32 Nr. 44 § 2). Beamtinnen und Beamte haben über dienstliche Angelegenheiten, die ihnen bei oder bei Gelegenheit ihrer amtlichen Tätigkeit bekannt werden, Verschwiegenheit zu bewahren (§ 37 BeamtStG), sie haben ihre Aufgaben uneigennützig nach bestem Gewissen wahrzunehmen (§ 34 BeamtStG) und dürfen keine Belohnungen, Geschenke oder sonstigen Vorteile in Bezug auf ihr Amt fordern, sich versprechen lassen oder annehmen (§ 42 BeamtStG); strafrechtlich erfasst sind die Vorteilsannahme für die Dienstausübung (§ 331 StGB) und die Bestechlichkeit für eine pflichtwidrige Diensthandlung (§ 332 StGB). Wer in einem Verwaltungsverfahren selbst Beteiligter ist, darf für die Behörde nicht tätig werden; bei Besorgnis der Befangenheit ist die Behördenleitung zu unterrichten und die Mitwirkung zu unterlassen (§§ 20, 21 VwVfG NRW). Wird ein Computerprogramm in Wahrnehmung dienstlicher Aufgaben oder nach Anweisungen des Dienstherrn geschaffen, ist ausschließlich der Dienstherr zur Ausübung aller vermögensrechtlichen Befugnisse berechtigt (§ 69b UrhG, auf Dienstverhältnisse entsprechend anwendbar). Schuldhafte Pflichtverletzungen sind Dienstvergehen (§ 47 BeamtStG); bei zureichenden Anhaltspunkten hat die dienstvorgesetzte Stelle ein Disziplinarverfahren einzuleiten (§ 17 LDG NRW).\n\n" +
  "RECHTLICHE EINORDNUNG: Die Entwicklung und der entgeltliche Vertrieb einer Software sind eine gewerbliche beziehungsweise entgeltliche Nebentätigkeit und damit genehmigungspflichtig. Unentgeltliche Angebote sind jedenfalls anzeigepflichtig. Das Gesetz verbietet die Tätigkeit nicht; entscheidend ist, ob dienstliche Interessen beeinträchtigt werden können. Verkauft die Lehrkraft an die eigene Schule, die eigene Behörde oder an Schulen und Träger, auf die sie dienstlich Einfluss hat oder mit denen ihre Behörde in der Angelegenheit tätig wird, liegt der Versagungsgrund des § 49 Abs. 2 Nr. 3 LBG NRW nahe; hinzu kommen die Gesichtspunkte Unparteilichkeit, Unbefangenheit und Ansehen der Verwaltung (Nr. 4 und 6). Die dienstvorgesetzte Stelle entscheidet im Einzelfall; Auflagen und Befristung sind möglich. Die Nutzung dienstlicher Kontakte oder Kenntnisse für private Zwecke ist mit der Verschwiegenheitspflicht und dem Gebot uneigennütziger Aufgabenwahrnehmung nicht vereinbar; der Kauf zu marktüblichen Konditionen ist für sich genommen kein Geschenk, wird aber zum Problem, wenn Vorteile in Bezug auf das Amt gewährt werden oder die Beamtin oder der Beamte an der Kaufentscheidung mitwirkt. Das Urheberrecht liegt bei der Lehrkraft, solange die Software nicht in Wahrnehmung dienstlicher Aufgaben oder nach dienstlichen Anweisungen entstanden ist; die Abgrenzung hängt vom Einzelfall ab, und eine saubere Trennung von Dienst und Entwicklung ist beweisrelevant. Offen bleiben nach den übergebenen Quellen, ob die Bezirksregierung bei einem Verkauf an Schulen im eigenen Aufsichtsbezirk regelmäßig versagt oder durch Auflagen eine Genehmigung erteilen kann, wie die Höchstgrenze für Nebeneinnahmen und weitere Einzelheiten nach der Nebentätigkeitsverordnung ausgestaltet sind, ob eine Beschaffungsentscheidung ein Verwaltungsverfahren im Sinne des VwVfG NRW ist und welche vergaberechtlichen Vorgaben für Beschaffungen bei Schulen und Schulträgern gelten.";

const RESPONSIBILITIES =
  "Die Lehrkraft stellt den Antrag, trägt die Nachweise vor und hält Dienst und Nebentätigkeit getrennt (§ 52 LBG NRW). Die dienstvorgesetzte Stelle, für Lehrkräfte an öffentlichen Schulen die Bezirksregierung (VO 10-32 Nr. 44 § 2), entscheidet über Genehmigung, Auflagen, Befristung und Widerruf (§ 49 LBG NRW) und hat bei Dienstvergehen die Einleitung eines Disziplinarverfahrens zu prüfen (§ 17 LDG NRW). Die Schulleitung ist nicht entscheidungsbefugt; ob der Antrag über sie läuft und ob sie Stellung nimmt, ist bei der Bezirksregierung zu erfragen. Die Behördenleitung ist bei Befangenheitsfragen zu unterrichten (§ 21 VwVfG NRW).";

const PRACTICE_TIP = [
  "- [Rechtlich erforderlich] Vor Aufnahme einer entgeltlichen oder gewerblichen Nebentätigkeit die schriftliche Genehmigung der dienstvorgesetzten Stelle einholen (§ 49 Abs. 1 LBG NRW)",
  "- [Rechtlich erforderlich] Nebentätigkeit nur außerhalb der Arbeitszeit ausüben und Änderungen unverzüglich schriftlich oder elektronisch anzeigen (§ 52 LBG NRW)",
  "- [Rechtlich erforderlich] Einrichtungen, Personal oder Material des Dienstherrn nur mit Genehmigung und gegen Entgelt nutzen (§ 54 LBG NRW)",
  "- [Rechtlich erforderlich] Über dienstliche Angelegenheiten Verschwiegenheit wahren; keine dienstlichen Informationen für das Geschäft verwenden (§ 37 BeamtStG)",
  "- [Praktisch empfohlen] Im Antrag den geplanten Kundenkreis offen benennen und eine Beschränkung anbieten (z. B. kein Verkauf an die eigene Schule und an Schulen im eigenen Aufsichtsbezirk)",
  "- [Praktisch empfohlen] Entwicklung außerhalb der Arbeitszeit, ohne Dienstmittel und ohne dienstlichen Auftrag nachvollziehbar dokumentieren (Urheberrecht, § 69b UrhG)",
  "- [Praktisch empfohlen] An Entscheidungen der eigenen Schule oder Behörde über den Kauf des Produkts nicht mitwirken und die Behördenleitung bei Zweifeln unterrichten (§§ 20, 21 VwVfG NRW)",
  "- [Bei Unsicherheit] Zur Höchstgrenze für Nebeneinnahmen und zu vergaberechtlichen Fragen enthalten die Quellen keine ausdrückliche Regelung: Bezirksregierung und Rechtsberatung fragen",
].join("\n");

const CHECKLIST = [
  "[Rechtlich erforderlich] Schriftlichen Antrag auf Genehmigung der Nebentätigkeit vor Beginn bei der dienstvorgesetzten Stelle stellen (§§ 49, 52 LBG NRW)",
  "[Rechtlich erforderlich] Art und Umfang der Tätigkeit, Zeitaufwand und erwartete Entgelte nachweisen (§ 52 LBG NRW)",
  "[Rechtlich erforderlich] Nebentätigkeit nur außerhalb der Arbeitszeit ausüben (§ 52 LBG NRW)",
  "[Rechtlich erforderlich] Bereits laufende, auch unentgeltliche Nutzung durch Kolleginnen und Kollegen anzeigen (§ 40 BeamtStG)",
  "[Rechtlich erforderlich] Keine dienstlichen Geräte, Räume, Mitarbeitenden oder Materialien ohne Genehmigung und Entgelt nutzen (§ 54 LBG NRW)",
  "[Rechtlich erforderlich] Verschwiegenheit über dienstliche Angelegenheiten wahren und keine Vorteile in Bezug auf das Amt annehmen (§§ 37, 42 BeamtStG)",
  "[Organisatorisch empfohlen] Kundenkreis im Antrag offen benennen und mögliche Beschränkungen oder Auflagen anbieten",
  "[Organisatorisch empfohlen] Entstehung der Software dokumentieren (Zeiten, Geräte, keine dienstlichen Inhalte)",
  "[Organisatorisch empfohlen] An Kaufentscheidungen der eigenen Behörde nicht mitwirken; Behördenleitung bei Befangenheitsfragen unterrichten",
  "[Rechtlich erforderlich] Änderungen unverzüglich anzeigen und, soweit die Höchstgrenze überschritten wird, Nebeneinnahmen jährlich melden (§§ 52, 53 LBG NRW)",
];

const DOCUMENTATION = [
  "[Rechtlich erforderlich] Schriftlicher Genehmigungsantrag mit Angaben zu Art, Umfang, Zeitaufwand und Entgelten (§ 52 LBG NRW)",
  "[Zur Nachvollziehbarkeit empfohlen] Genehmigungs- oder Versagungsbescheid mit Befristung und Auflagen (§ 49 LBG NRW)",
  "[Rechtlich erforderlich] Schriftliche Anzeige von Änderungen und gegebenenfalls Jahresaufstellung der Nebeneinnahmen (§§ 52, 53 LBG NRW)",
  "[Zur Nachvollziehbarkeit empfohlen] Entwicklungsnachweis: Zeiträume außerhalb der Arbeitszeit, verwendete private Geräte, Hinweis auf fehlenden dienstlichen Auftrag",
  "[Zur Nachvollziehbarkeit empfohlen] Vermerk über unterlassene Mitwirkung an Entscheidungen der eigenen Behörde zum Produkt (§ 21 VwVfG NRW)",
];

const FAQ = [
  {
    q: "Darf eine Lehrkraft im Beamtenverhältnis überhaupt eine Software entwickeln und verkaufen?",
    a: "Grundsätzlich ja, aber nur mit vorheriger schriftlicher Genehmigung, wenn die Tätigkeit entgeltlich oder gewerblich ist (§ 49 Abs. 1 Nr. 2 LBG NRW). Jede Nebentätigkeit ist außerdem grundsätzlich anzeigepflichtig (§ 40 BeamtStG) und darf nur außerhalb der Arbeitszeit ausgeübt werden (§ 52 LBG NRW). Die Genehmigung wird versagt, wenn dienstliche Interessen beeinträchtigt werden können (§ 49 Abs. 2 LBG NRW).",
  },
  {
    q: "Besteht ein Interessenkonflikt, wenn die Käufer die eigene Schule oder Behörde sind?",
    a: "Das ist ein naheliegender Versagungsgrund. Nach § 49 Abs. 2 Nr. 3 LBG NRW ist die Genehmigung zu versagen, wenn die Nebentätigkeit in einer Angelegenheit ausgeübt wird, in der die Behörde oder Einrichtung, der die Beamtin oder der Beamte angehört, tätig wird oder werden kann; zusätzlich kommen die Beeinflussung der Unparteilichkeit oder Unbefangenheit (Nr. 4) und das Ansehen der Verwaltung (Nr. 6) in Betracht. Entschieden wird im Einzelfall durch die Bezirksregierung; Auflagen und eine Begrenzung des Kundenkreises sind möglich (§ 49 LBG NRW).",
  },
  {
    q: "Darf ich dienstliche Kontakte und dienstliches Wissen für das Geschäft nutzen?",
    a: "Nein. Dienstliche Angelegenheiten, die bei oder bei Gelegenheit der amtlichen Tätigkeit bekannt werden, unterliegen der Verschwiegenheit (§ 37 BeamtStG), Aufgaben sind uneigennützig wahrzunehmen (§ 34 BeamtStG), und Einrichtungen, Personal oder Material des Dienstherrn dürfen nur mit Genehmigung und gegen Entgelt genutzt werden (§ 54 LBG NRW). Vorteile in Bezug auf das Amt dürfen nicht angenommen werden (§ 42 BeamtStG); strafrechtlich relevant sind die Vorteilsannahme (§ 331 StGB) und die Bestechlichkeit (§ 332 StGB).",
  },
  {
    q: "Darf ich bei der Kaufentscheidung meiner eigenen Schule oder Behörde mitwirken?",
    a: "Davon ist abzuraten. Wer in einem Verwaltungsverfahren selbst Beteiligter ist oder durch die Entscheidung einen unmittelbaren Vorteil erlangen kann, darf für die Behörde nicht tätig werden; bei Besorgnis der Befangenheit ist die Behördenleitung zu unterrichten und die Mitwirkung zu unterlassen (§§ 20, 21 VwVfG NRW). Ob eine Beschaffungsentscheidung ein Verwaltungsverfahren im Sinne dieses Gesetzes ist, ergibt sich aus den Quellen nicht; der Gedanke der Befangenheit ist aber maßgeblich für das dienstliche Verhalten.",
  },
  {
    q: "Wem gehört die Software, wenn ich sie in meiner Freizeit entwickle?",
    a: "Wird ein Computerprogramm in Wahrnehmung dienstlicher Aufgaben oder nach Anweisungen des Dienstherrn geschaffen, ist ausschließlich der Dienstherr zur Ausübung der vermögensrechtlichen Befugnisse berechtigt (§ 69b UrhG, auf Dienstverhältnisse entsprechend anzuwenden). Entsteht die Software ohne dienstlichen Auftrag, außerhalb der Arbeitszeit und ohne Dienstmittel, liegt dieser Fall nicht vor; die Abgrenzung ist einzelfallabhängig, weshalb eine nachvollziehbare Trennung wichtig ist.",
  },
  {
    q: "Welche Folgen hat ein Verstoß, etwa eine Tätigkeit ohne Genehmigung?",
    a: "Ein schuldhafter Verstoß gegen Dienstpflichten ist ein Dienstvergehen (§ 47 BeamtStG). Bei zureichenden tatsächlichen Anhaltspunkten hat die dienstvorgesetzte Stelle, also die Bezirksregierung, ein Disziplinarverfahren einzuleiten, es sei denn, eine Disziplinarmaßnahme kommt nicht in Betracht (§ 17 LDG NRW). Eine erteilte Genehmigung ist zu widerrufen, wenn sich später eine Beeinträchtigung dienstlicher Interessen ergibt (§ 49 LBG NRW).",
  },
];

const COMMON_MISTAKES = [
  "[Organisatorisch ungünstig] Mit der entgeltlichen Tätigkeit beginnen, bevor die Genehmigung vorliegt – sie ist vorab einzuholen (§ 49 Abs. 1 LBG NRW)",
  "[Organisatorisch ungünstig] Im Antrag den Kundenkreis offenlassen oder den Bezug zur eigenen Behörde verschweigen – das gefährdet die Genehmigung und kann zum Widerruf führen (§ 49 LBG NRW)",
  "[Organisatorisch ungünstig] Dienstliche Kontakte, Verteiler oder Kenntnisse für Werbung oder Kundengewinnung nutzen (§§ 34, 37 BeamtStG)",
  "[Organisatorisch ungünstig] Dienstliche Geräte, Räume oder Arbeitszeit für die Entwicklung nutzen (§§ 52, 54 LBG NRW)",
  "[Organisatorisch ungünstig] Eine zunächst unentgeltliche Nutzung im Kollegium nicht anzeigen, weil sie noch kein Geschäft ist (§ 40 BeamtStG)",
  "[Organisatorisch ungünstig] An Entscheidungen der eigenen Schule oder Behörde über den Kauf mitwirken, statt die Behördenleitung zu unterrichten (§§ 20, 21 VwVfG NRW)",
];

// ---------------------------------------------------------------------------
// Entscheidungsbaum
// ---------------------------------------------------------------------------

const TREE = {
  meta: { status: "approved", version: 2 },
  start: "frage_entgelt",
  steps: {
    frage_entgelt: {
      question: "Soll die Software gegen Entgelt oder gewerblich angeboten werden?",
      explanation: "Eine Nebenbeschäftigung gegen Vergütung oder eine gewerbliche Tätigkeit bedarf der vorherigen Genehmigung (§ 49 Abs. 1 Nr. 2 LBG NRW); jede Nebentätigkeit ist grundsätzlich anzeigepflichtig (§ 40 BeamtStG).",
      options: [
        { label: "Ja, sie soll verkauft oder gewerblich angeboten werden.", next: "frage_kaeufer" },
        { label: "Nein, sie wird nur unentgeltlich und nicht gewerblich zur Verfügung gestellt.", result: "ergebnis_unentgeltlich" },
      ],
    },
    frage_kaeufer: {
      question: "Wer soll als Käufer in Betracht kommen?",
      explanation: "Eine Nebentätigkeit ist zu versagen, wenn sie in einer Angelegenheit ausgeübt wird, in der die eigene Behörde oder Einrichtung tätig wird oder werden kann, oder die Unparteilichkeit und Unbefangenheit beeinflussen kann (§ 49 Abs. 2 Nr. 3 und 4 LBG NRW).",
      options: [
        { label: "Die eigene Schule, die eigene Behörde oder Schulen und Träger im eigenen Aufsichtsbezirk, auf die ich dienstlich Einfluss habe.", result: "ergebnis_eigene_behoerde" },
        { label: "Andere Kunden außerhalb meines dienstlichen Einflussbereichs.", next: "frage_kontakte" },
      ],
    },
    frage_kontakte: {
      question: "Sollen dienstliche Kontakte, dienstliche Kenntnisse oder Dienstmittel für das Geschäft genutzt werden?",
      explanation: "Dienstliche Angelegenheiten unterliegen der Verschwiegenheit (§ 37 BeamtStG), Aufgaben sind uneigennützig wahrzunehmen (§ 34 BeamtStG), und Einrichtungen, Personal oder Material des Dienstherrn dürfen nur mit Genehmigung und gegen Entgelt genutzt werden (§ 54 LBG NRW).",
      options: [
        { label: "Ja, ich möchte dienstliche Kontakte, Verteiler, Kenntnisse oder Dienstmittel verwenden.", result: "ergebnis_kontakte_nutzung" },
        { label: "Nein, Dienst und Geschäft bleiben vollständig getrennt.", result: "ergebnis_extern_genehmigung" },
      ],
    },
  },
  results: {
    ergebnis_unentgeltlich: {
      color: "gelb",
      urgency: "erhöht",
      title: "Unentgeltliches Angebot – Anzeige und Prüfung der Genehmigungsfreiheit",
      steps: [
        "Die Tätigkeit der dienstvorgesetzten Stelle schriftlich anzeigen (§ 40 BeamtStG)",
        "Bei der Bezirksregierung klären, ob die Tätigkeit als genehmigungsfreie schriftstellerische oder wissenschaftliche Tätigkeit gilt (§ 51 Abs. 1 Nr. 2 LBG NRW) oder ob sie genehmigungspflichtig ist",
        "Die Tätigkeit nur außerhalb der Arbeitszeit ausüben und keine Dienstmittel nutzen (§§ 52, 54 LBG NRW)",
        "Nutzende, Zeitumfang und Inhalte dokumentieren",
        "Sobald ein Entgelt oder gewerblicher Vertrieb geplant wird, vor Beginn die Genehmigung beantragen (§ 49 LBG NRW)",
      ],
      warning: "Auch genehmigungsfreie Nebentätigkeiten sind zu untersagen, wenn sie dienstliche Interessen beeinträchtigen (§ 51 LBG NRW). Die Unentgeltlichkeit schützt nicht vor der Anzeigepflicht.",
      responsible: "Lehrkraft (Anzeige, Dokumentation); Bezirksregierung als dienstvorgesetzte Stelle (Einordnung, Untersagung)",
      documentation: "Schriftliche Anzeige; Antwort der Bezirksregierung zur Einordnung; Vermerk zu Umfang und Inhalt der Nutzung.",
      recommendation: "Auch ein unentgeltliches Angebot an Kolleginnen und Kollegen ist grundsätzlich anzeigepflichtig. Klären Sie mit der Bezirksregierung, ob die Tätigkeit genehmigungsfrei ist; verlassen Sie sich nicht auf eine eigene Einschätzung. Vermeiden Sie die Nutzung von Dienstmitteln und halten Sie die Tätigkeit außerhalb der Arbeitszeit. Planen Sie später ein Entgelt, ist vorab die Genehmigung einzuholen.",
    },
    ergebnis_eigene_behoerde: {
      color: "rot",
      urgency: "hoch",
      title: "Verkauf an die eigene Behörde oder in den eigenen Aufsichtsbereich – Versagungsgrund naheliegend",
      steps: [
        "Den Verkauf an die eigene Schule und an Schulen oder Träger im eigenen dienstlichen Einflussbereich zunächst ausschließen oder auf später verschieben",
        "Im Genehmigungsantrag den geplanten Kundenkreis offen nennen und eine Beschränkung anbieten (§ 49 Abs. 2 Nr. 3 LBG NRW)",
        "Mit der Bezirksregierung vorab klären, ob eine Genehmigung mit Auflagen oder Befristung denkbar ist (§ 49 LBG NRW)",
        "An Entscheidungen der eigenen Behörde über Anschaffung oder Nutzung des Produkts nicht mitwirken und die Behördenleitung unterrichten (§§ 20, 21 VwVfG NRW)",
        "Bis zur Entscheidung keine Verträge schließen und keine Preise nennen",
      ],
      warning: "Bei Verkauf an die eigene Behörde liegen die Versagungsgründe der Tätigkeit in einer Angelegenheit der eigenen Behörde (Nr. 3), der möglichen Beeinflussung von Unparteilichkeit und Unbefangenheit (Nr. 4) und des Ansehens der Verwaltung (Nr. 6) nahe. Ohne Genehmigung droht ein Dienstvergehen (§ 47 BeamtStG, § 17 LDG NRW).",
      responsible: "Lehrkraft (offener Antrag, Beschränkung des Kundenkreises, Nichtmitwirkung); Bezirksregierung (Entscheidung, Auflagen); Behördenleitung (bei Befangenheit)",
      documentation: "Genehmigungsantrag mit benanntem Kundenkreis; Bescheid mit Auflagen oder Versagung; Vermerk über unterlassene Mitwirkung an behördeninternen Entscheidungen.",
      recommendation: "Ein Verkauf an die eigene Schule, die eigene Behörde oder in den eigenen Aufsichtsbereich begründet einen naheliegenden Versagungsgrund. Benennen Sie den Kundenkreis im Antrag offen und bieten Sie an, den eigenen Einflussbereich auszunehmen; ob die Bezirksregierung unter Auflagen genehmigt, entscheidet sie im Einzelfall. Wirken Sie an keiner Entscheidung Ihrer Behörde über das Produkt mit. Verträge dürfen erst nach der Genehmigung geschlossen werden.",
    },
    ergebnis_kontakte_nutzung: {
      color: "rot",
      urgency: "hoch",
      title: "Nutzung dienstlicher Kontakte, Kenntnisse oder Mittel – nicht zulässig",
      steps: [
        "Dienstliche Kontakte, Verteiler und dienstlich erlangte Informationen nicht für Werbung oder Kundengewinnung verwenden (§§ 34, 37 BeamtStG)",
        "Dienstliche Geräte, Räume, Mitarbeitende und Materialien nicht nutzen; ein Ausnahmefall bedarf der Genehmigung und eines angemessenen Entgelts (§ 54 LBG NRW)",
        "Vorteile in Bezug auf das Amt weder fordern noch annehmen (§ 42 BeamtStG; §§ 331, 332 StGB)",
        "Kundenkontakt nur über selbst aufgebaute, nicht dienstliche Wege herstellen",
        "Die Trennung von Dienst und Geschäft dokumentieren",
      ],
      warning: "Die Nutzung dienstlicher Stellung, Kontakte oder Informationen für private Geschäftsinteressen verletzt die Verschwiegenheit und das Gebot uneigennütziger Aufgabenwahrnehmung und kann ein Dienstvergehen sein (§ 47 BeamtStG).",
      responsible: "Lehrkraft; Bezirksregierung als dienstvorgesetzte Stelle (Genehmigung, Disziplinarbefugnis, § 17 LDG NRW)",
      documentation: "Vermerk zur Trennung von Dienst und Geschäft (Geräte, Zeiten, Kontaktwege); gegebenenfalls Genehmigung zur Nutzung von Dienstmitteln mit Entgeltregelung.",
      recommendation: "Verzichten Sie vollständig auf dienstliche Kontakte, Verteiler, Kenntnisse und Dienstmittel für das Geschäft. Eine Ausnahme für Dienstmittel setzt Genehmigung und angemessenes Entgelt voraus. Nehmen Sie keine Vorteile in Bezug auf Ihr Amt an. Dokumentieren Sie die Trennung, damit sie im Streitfall nachweisbar ist.",
    },
    ergebnis_extern_genehmigung: {
      color: "gelb",
      urgency: "erhöht",
      title: "Externe Kunden, saubere Trennung – Genehmigung beantragen und Auflagen beachten",
      steps: [
        "Schriftlichen Antrag vor Beginn bei der dienstvorgesetzten Stelle stellen (§§ 49, 52 LBG NRW)",
        "Art, Umfang, Zeitaufwand, Kundenkreis und erwartete Entgelte nachweisen (§ 52 LBG NRW)",
        "Die Tätigkeit nur außerhalb der Arbeitszeit ausüben (§ 52 LBG NRW)",
        "Bei Genehmigung Befristung (höchstens fünf Jahre) und Auflagen beachten (§ 49 LBG NRW)",
        "Änderungen unverzüglich anzeigen und gegebenenfalls Nebeneinnahmen jährlich melden (§§ 52, 53 LBG NRW)",
        "Entwicklung ohne dienstlichen Auftrag und ohne Dienstmittel dokumentieren (§ 69b UrhG)",
      ],
      warning: "Auch bei externen Kunden ist die Genehmigung zu versagen, wenn die Tätigkeit zu viel Arbeitskraft beansprucht (in der Regel bei mehr als einem Fünftel der Wochenarbeitszeit) oder dienstliche Interessen anderweitig beeinträchtigt (§ 49 LBG NRW). Ohne vorherige Genehmigung darf die entgeltliche Tätigkeit nicht beginnen.",
      responsible: "Lehrkraft (Antrag, Nachweise, Anzeigen); Bezirksregierung (Entscheidung, Auflagen, Widerruf)",
      documentation: "Genehmigungsantrag; Bescheid mit Befristung und Auflagen; Anzeigen von Änderungen; Jahresaufstellung der Nebeneinnahmen, soweit erforderlich; Entwicklungsnachweis.",
      recommendation: "Mit externen Kunden und klarer Trennung von Dienst und Geschäft ist eine Genehmigung grundsätzlich denkbar, aber nicht gesichert. Stellen Sie den Antrag vor Beginn, legen Sie Art, Umfang und Entgelte nachvollziehbar dar und halten Sie die Auflagen ein. Beachten Sie die Befristung auf höchstens fünf Jahre und melden Sie Änderungen unverzüglich.",
    },
  },
};

// ---------------------------------------------------------------------------
// Normverknüpfungen
// ---------------------------------------------------------------------------

type LinkSpec = { short?: string; idPrefix?: string; ref: RegExp; from: string; to: string; precise: string; why: string };
const NEW_LINKS: LinkSpec[] = [
  { short: "LBG NRW", ref: /§ 49$/, from: "Die Beamtin oder der Beamte bedarf, soweit sie oder er nicht nach § 48", to: "oder zur Ausübung eines freien Berufes", precise: "§ 49 Abs. 1 Nr. 2", why: "Genehmigungspflicht für gewerbliche und entgeltliche Nebentätigkeiten; Versagungsgründe, Befristung und Auflagen nach Abs. 2 und 3." },
  { short: "LBG NRW", ref: /§ 51$/, from: "Nicht genehmigungspflichtig ist 1. die Verwaltung eigenen", to: "Vortragstätigkeit,", precise: "§ 51 Abs. 1 Nr. 2", why: "Genehmigungsfreie Nebentätigkeiten (u. a. schriftstellerische Tätigkeit) – aber Untersagung bei Beeinträchtigung dienstlicher Interessen." },
  { short: "LBG NRW", ref: /§ 52$/, from: "Nebentätigkeiten, welche die Beamtin oder der Beamte nicht auf Verlangen", to: "nur außerhalb der Arbeitszeit ausüben.", precise: "§ 52 Abs. 1", why: "Nebentätigkeit nur außerhalb der Arbeitszeit; Schriftform, Nachweise und Änderungsanzeige folgen aus den weiteren Sätzen." },
  { short: "LBG NRW", ref: /§ 53$/, from: "Die Beamtin oder der Beamte legt am Ende eines jeden Jahres", to: "zu bestimmende Höchstgrenze übersteigen.", precise: "§ 53", why: "Jahresmeldung der Nebeneinnahmen oberhalb der Höchstgrenze." },
  { short: "LBG NRW", ref: /§ 54$/, from: "Die Beamtin oder der Beamte darf bei der Ausübung von Nebentätigkeiten", to: "angemessenes Entgelt zu entrichten;", precise: "§ 54 Abs. 1", why: "Nutzung von Dienstmitteln nur mit Genehmigung und gegen Entgelt." },
  { short: "BeamtStG", ref: /§ 40$/, from: "Eine Nebentätigkeit ist grundsätzlich anzeigepflichtig.", to: "dienstliche Interessen zu beeinträchtigen.", precise: "§ 40", why: "Anzeigepflicht und Erlaubnis- oder Verbotsvorbehalt bei Nebentätigkeiten." },
  { short: "BeamtStG", ref: /§ 37$/, from: "Beamtinnen und Beamte haben über die ihnen bei oder bei Gelegenheit", to: "Verschwiegenheit zu bewahren.", precise: "§ 37 Abs. 1", why: "Verschwiegenheit über dienstliche Angelegenheiten – keine Nutzung für private Geschäfte." },
  { short: "BeamtStG", ref: /§ 34$/, from: "Sie haben die übertragenen Aufgaben uneigennützig", to: "nach bestem Gewissen wahrzunehmen.", precise: "§ 34 Satz 2", why: "Gebot uneigennütziger Aufgabenwahrnehmung." },
  { short: "BeamtStG", ref: /§ 42$/, from: "Beamtinnen und Beamte dürfen, auch nach Beendigung des Beamtenverhältnisses", to: "fordern, sich versprechen lassen oder annehmen.", precise: "§ 42 Abs. 1", why: "Verbot der Annahme von Vorteilen in Bezug auf das Amt." },
  { short: "BeamtStG", ref: /§ 47$/, from: "Beamtinnen und Beamte begehen ein Dienstvergehen", to: "Pflichten verletzen.", precise: "§ 47 Abs. 1", why: "Dienstvergehen bei schuldhafter Pflichtverletzung." },
  { short: "VwVfG NRW", ref: /§ 21$/, from: "Liegt ein Grund vor, der geeignet ist, Misstrauen gegen eine unparteiische Amtsausübung", to: "der Mitwirkung zu enthalten.", precise: "§ 21 Abs. 1", why: "Besorgnis der Befangenheit: Unterrichtung der Behördenleitung und Enthaltung von der Mitwirkung." },
  { short: "VwVfG NRW", ref: /§ 20$/, from: "In einem Verwaltungsverfahren darf für eine Behörde nicht tätig werden,", to: "wer selbst Beteiligter ist;", precise: "§ 20 Abs. 1 Nr. 1", why: "Ausschluss Beteiligter von der Mitwirkung in Verwaltungsverfahren." },
  { short: "UrhG", ref: /§ 69b$/, from: "Wird ein Computerprogramm von einem Arbeitnehmer in Wahrnehmung seiner Aufgaben", to: "Dienstverhältnisse entsprechend anzuwenden.", precise: "§ 69b", why: "Urheberrecht an Software, die im Dienstverhältnis in Wahrnehmung dienstlicher Aufgaben entsteht." },
  { short: "StGB", ref: /§ 331$/, from: "Ein Amtsträger, ein Europäischer Amtsträger oder ein für den öffentlichen Dienst besonders Verpflichteter, der für die Dienstausübung", to: "mit Geldstrafe bestraft.", precise: "§ 331 Abs. 1", why: "Strafbarkeit der Vorteilsannahme für die Dienstausübung." },
  { short: "StGB", ref: /§ 332$/, from: "Ein Amtsträger, ein Europäischer Amtsträger oder ein für den öffentlichen Dienst besonders Verpflichteter, der einen Vorteil", to: "bis zu fünf Jahren bestraft.", precise: "§ 332 Abs. 1", why: "Strafbarkeit der Bestechlichkeit bei pflichtwidriger Diensthandlung." },
  { idPrefix: "0ab547f6", ref: /^§ 2$/, from: "Abweichend von § 1 Absatz 1", to: "Lehrkräfte an öffentlichen Schulen,", precise: "§ 2 Abs. 1 Nr. 1", why: "Bezirksregierung ist dienstvorgesetzte Stelle der Lehrkräfte an öffentlichen Schulen." },
  { short: "LDG NRW", ref: /§ 17$/, from: "Liegen zureichende tatsächliche Anhaltspunkte vor", to: "hierüber unverzüglich zu unterrichten.", precise: "§ 17 Abs. 1", why: "Einleitung eines Disziplinarverfahrens bei zureichenden Anhaltspunkten für ein Dienstvergehen." },
];

// ---------------------------------------------------------------------------

async function main() {
  const stage = process.argv[2];
  if (!["check", "edit"].includes(stage ?? "")) { console.error("Aufruf: ... <check|edit>"); process.exit(1); }
  await bootstrapSession();
  const { supabase } = await import("../src/integrations/supabase/client");
  const { updateCase } = await import("../src/lib/coreBuilder");
  const { parseCuratedTree, validateCuratedTree } = await import("../src/lib/decisionTree");
  const dry = stage === "check";

  const { data: cur, error } = await supabase.from("practice_cases").select("workflow_status").eq("id", CASE_ID).single();
  if (error) throw error;
  if (!dry && (cur as any).workflow_status !== "draft") throw new Error(`Fall ist nicht im Entwurf (${(cur as any).workflow_status}).`);

  const parsed = parseCuratedTree(TREE);
  const report = parsed ? validateCuratedTree(parsed) : null;
  if (!report?.valid) throw new Error("Entscheidungsbaum ungültig: " + JSON.stringify(report));

  const { data: allSrc } = await supabase.from("legal_sources").select("id, short_name, title");
  const norm = (s: string) => s.replace(/\s+/g, " ");
  const linkRows: any[] = [];
  for (const l of NEW_LINKS) {
    const src = (allSrc ?? []).find((s: any) => l.idPrefix ? s.id.startsWith(l.idPrefix) : s.short_name === l.short) as any;
    if (!src) throw new Error(`Quelle nicht gefunden: ${l.idPrefix ?? l.short}`);
    const { data: secs } = await supabase.from("legal_sections").select("id, reference, content").eq("source_id", src.id);
    const sec = (secs ?? []).find((s: any) => l.ref.test(s.reference) && norm(s.content).includes(l.from)) as any;
    if (!sec) throw new Error(`Abschnitt ${l.ref} (${l.precise}) nicht gefunden in ${String(src.short_name ?? src.title).slice(0, 40)}`);
    const c = norm(sec.content); const i = c.indexOf(l.from); const j = c.indexOf(l.to, i);
    if (i < 0 || j < 0) throw new Error(`Auszug für ${l.precise} nicht auffindbar (${i}/${j})`);
    linkRows.push({ case_id: CASE_ID, legal_section_id: sec.id, content_summary: c.slice(i, j + l.to.length), content_summary_kind: "wortlaut", precise_reference: l.precise, explanation: l.why });
  }

  if (dry) {
    console.log(`Trockenlauf OK: Baum gültig (${Object.keys(TREE.steps).length} Fragen, ${Object.keys(TREE.results).length} Ergebnisse), ${linkRows.length} Normauszüge gefunden.`);
    for (const r of linkRows) console.log(`  ${String(r.precise_reference).padEnd(22)} ${r.content_summary.slice(0, 80)}…`);
    return;
  }

  const { data: existing } = await (supabase.from("case_legal_links") as any).select("id").eq("case_id", CASE_ID);
  if ((existing ?? []).length) {
    const { error: e } = await (supabase.from("case_legal_links") as any).delete().in("id", existing.map((x: any) => x.id));
    if (e) throw new Error("Alt-Links entfernen fehlgeschlagen: " + e.message);
  }
  const { error: ie } = await (supabase.from("case_legal_links") as any).insert(linkRows);
  if (ie) throw new Error("Links einfügen fehlgeschlagen: " + ie.message);
  console.log(`Rechtsgrundlagen: ${(existing ?? []).length} alte entfernt, ${linkRows.length} neu verknüpft`);

  await updateCase(CASE_ID, {
    category: CATEGORY,
    subcategory: SUBCATEGORY,
    short_description: SHORT_DESCRIPTION,
    short_answer: SHORT_ANSWER,
    immediate_actions: IMMEDIATE_ACTIONS,
    recommendation: RECOMMENDATION,
    legal_explanation: LEGAL_EXPLANATION,
    responsibilities: RESPONSIBILITIES,
    practice_tip: PRACTICE_TIP,
    checklist: CHECKLIST,
    documentation: DOCUMENTATION,
    faq: FAQ,
    common_mistakes: COMMON_MISTAKES,
    decision_tree: TREE,
  } as any);
  console.log("Fall aktualisiert (Entwurf).");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FEHLER:", e?.message ?? e); process.exit(1); });
