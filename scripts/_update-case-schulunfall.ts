/**
 * Fall "Schulunfall dokumentieren: Sturz auf Steißbein - Handlungsschritte"
 * (0732e08d-...) komplett neu fassen (Nutzer-Auftrag 01.10.2026). Ursache der
 * Überarbeitung: Der Fall war an themenfremde Quellen gebunden (Unwetter-Erlass,
 * VO-DV II für Lehrerdaten, Distanzunterrichts-VO) und behauptete, die
 * Meldeschwelle sei nicht geregelt - tatsächlich regelt der Runderlass
 * "Unfallverhütung, Schülerunfallversicherung" in Abs. 20 bis 23 und 25 Erste
 * Hilfe, Information der Schulleitung, Eltern, Unfallanzeige (bei ärztlicher
 * Behandlung, unverzüglich, Durchschrift bei der Schule) und Schulaufsicht.
 *
 * Stufen: check (Trockenlauf) | edit (Archivieren/Reaktivieren/Veröffentlichen
 * über _update-case-attest-gleichstellung.ts mit CASE_ID/PUBLISH_TIER)
 *
 * Aufruf: bun run scripts/_update-case-schulunfall.ts <check|edit>
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

const CASE_ID = "0732e08d-104e-46e6-8176-e84b2a1358d8";
const ADMIN_EMAIL = "admin@rechtkompass.local";
const RUNDERLASS = "8751faf6";
const VV_AUFSICHT = "7f0e9d13";

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

const SUBCATEGORY = "Schulunfall: Erste Hilfe, Unfallanzeige und Dokumentation";

const SHORT_DESCRIPTION =
  "Eine Schülerin oder ein Schüler stürzt auf dem Schulgelände auf das Steißbein und klagt über Schmerzen. Die Lehrkraft, die den Sturz bemerkt, fragt sich: Was ist sofort zu tun, wer muss informiert werden, wann ist der Unfall der Unfallkasse zu melden und wie wird der Vorfall dokumentiert? An Berufskollegs kommt hinzu, dass viele Lernende volljährig sind.";

const SHORT_ANSWER =
  "Die Lehrkraft, die zuerst von dem Sturz erfährt, leitet im Rahmen der Ersten Hilfe die vorläufige Versorgung ein und verständigt unverzüglich die Schulleitung; die Schulleitung, notfalls die aufsichtführende Lehrkraft, stellt sofort die nächstmögliche ärztliche Hilfe sicher, wenn eine gesundheitliche Schädigung zu befürchten ist (Runderlass „Unfallverhütung, Schülerunfallversicherung“, Abs. 20). Die Erziehungsberechtigten werden alsbald unterrichtet (Abs. 21). Führt der Unfall zu einer ärztlichen Behandlung, ist er unverzüglich mit der vorgeschriebenen Unfallanzeige der Unfallkasse NRW zu melden; eine Durchschrift verbleibt bei der Schule (Abs. 22). Schülerinnen und Schüler sind beim Besuch der Schule gesetzlich unfallversichert (§ 2 Abs. 1 Nr. 8 Buchst. b SGB VII). Für einen Sturz ohne ärztliche Behandlung schreibt der Runderlass keine Unfallanzeige vor; eine kurze schriftliche Unfallnotiz ist dennoch zu empfehlen, weil sich eine ärztliche Behandlung auch erst später ergeben kann.";

const IMMEDIATE_ACTIONS =
  "Die Lehrkraft, die den Sturz bemerkt, geht sofort zur verletzten Person, fragt nach Schmerzen und Beschwerden und leitet im Rahmen der Ersten Hilfe die vorläufige Versorgung ein; Erste Hilfe soll weitere Schäden verhindern und ersetzt keine ärztliche Hilfe (Runderlass Abs. 20). Bei Warnzeichen wie starken Schmerzen, Bewegungsunfähigkeit, Taubheitsgefühl oder Lähmungserscheinungen in den Beinen oder Bewusstseinsstörungen wird sofort der Rettungsdienst über 112 gerufen. Die Schulleitung wird unverzüglich über den Unfall verständigt; sie, notfalls die aufsichtführende Lehrkraft, stellt die nächstmögliche ärztliche Hilfe sicher (Abs. 20). Die Erziehungsberechtigten werden durch die Schulleitung oder eine beauftragte Lehrkraft alsbald unterrichtet (Abs. 21); volljährige Schülerinnen und Schüler werden selbst informiert. Führt der Unfall zu einer ärztlichen Behandlung, wird er unverzüglich mit der vorgeschriebenen Unfallanzeige der Unfallkasse NRW gemeldet (Abs. 22). Die Lehrkraft hält Zeitpunkt, Ort, Hergang, Zeugen, Beschwerden und ergriffene Maßnahmen schriftlich fest, solange die Erinnerung frisch ist.";

const RECOMMENDATION =
  "Gehen Sie in dieser Reihenfolge vor: (1) Erste Hilfe und vorläufige Versorgung einleiten; keine eigene Diagnose stellen, die Ärztin oder der Arzt entscheidet über die weitere Behandlung (Runderlass „Unfallverhütung, Schülerunfallversicherung“, Abs. 20). Bei Warnzeichen (starke Schmerzen, Bewegungsunfähigkeit, Taubheitsgefühl oder Lähmungen in den Beinen, Bewusstseinsstörung) sofort den Rettungsdienst über 112 rufen. (2) Die Schulleitung unverzüglich verständigen; sie, notfalls die aufsichtführende Lehrkraft, stellt die nächstmögliche ärztliche Hilfe sicher (Abs. 20). (3) Die Erziehungsberechtigten durch die Schulleitung oder eine beauftragte Lehrkraft alsbald unterrichten (Abs. 21); volljährige Schülerinnen und Schüler selbst informieren und mit ihnen besprechen, wen sie benachrichtigt haben möchten. (4) Führt der Unfall zu einer ärztlichen Behandlung, ihn unverzüglich mit der vorgeschriebenen Unfallanzeige der Unfallkasse NRW melden und eine Durchschrift in der Schule behalten (Abs. 22). Erfährt die Schule erst später von einer ärztlichen Behandlung, die Anzeige dann unverzüglich nachholen. (5) Bei Unfällen von besonderer Bedeutung und Tragweite (Todesfolge, besonders schwere Verletzungen, mehrere erheblich Verletzte) zusätzlich ein weiteres Exemplar der Unfallanzeige mit Angaben zu Ursache, Hergang und Aufsichtsführung der Schulaufsichtsbehörde geben und diese vorab fernmündlich informieren (Abs. 23). (6) Eine kurze Unfallnotiz anfertigen: Datum, Uhrzeit, Ort, Hergang, Zeugen, Beschwerden, ergriffene Maßnahmen, Name der dokumentierenden Person; sachlich bleiben und Beobachtungen von Vermutungen trennen. (7) Die Unterlagen nur dem Personenkreis zugänglich machen, der sie für seine Aufgaben benötigt (§ 120 SchulG); die Aufbewahrungsfrist ist in den Quellen nicht ausdrücklich geregelt und mit Schulleitung oder Schulaufsicht zu klären. (8) Ergeben sich Hinweise auf Sicherheits- oder Organisationsmängel am Unfallort, die Schulleitung informieren; die Sicherheitsbeauftragten der Schule können beobachtend und beratend unterstützen, haben aber weder Aufsichtsfunktion noch Weisungsbefugnis (Abs. 14).";

const LEGAL_EXPLANATION =
  "RECHTLICH VORGEGEBEN: Schülerinnen und Schüler sind während des Besuchs von allgemein- oder berufsbildenden Schulen kraft Gesetzes unfallversichert (§ 2 Abs. 1 Nr. 8 Buchst. b SGB VII). Unfälle sind zeitlich begrenzte, von außen auf den Körper einwirkende Ereignisse, die zu einem Gesundheitsschaden oder zum Tod führen (§ 8 Abs. 1 SGB VII). Der Versicherungsschutz umfasst nach dem Runderlass „Unfallverhütung, Schülerunfallversicherung“ alle Unfälle, die im Zusammenhang mit dem Schulbesuch stehen (Abs. 25); zuständiger Unfallversicherungsträger ist die Unfallkasse NRW (Abs. 1). Nach einem Unfall, der eine gesundheitliche Schädigung befürchten lässt, leitet die Lehrkraft, die zuerst Kenntnis erhält, im Rahmen der Ersten Hilfe die vorläufige Versorgung der oder des Verletzten in die Wege; die Schulleiterin oder der Schulleiter ist unverzüglich zu verständigen. Erste Hilfe soll bis zu einer ärztlichen Versorgung weitere Schäden verhindern und ist kein Ersatz für ärztliche Hilfe; die Schulleitung, notfalls die aufsichtführende Lehrkraft, stellt sofort die nächstmögliche ärztliche Hilfe sicher, und die Ärztin oder der Arzt entscheidet über die weitere Behandlung (Abs. 20). Die Erziehungsberechtigten werden durch die Schulleitung oder eine von ihr beauftragte Lehrkraft alsbald unterrichtet (Abs. 21). Jeder Unfall, der zu einer ärztlichen Behandlung führt, ist unter Verwendung der vorgeschriebenen Unfallanzeige unverzüglich der Unfallkasse NRW zu melden; eine Durchschrift der Anzeige verbleibt bei der Schule (Abs. 22). Bei Unfällen von besonderer Bedeutung und Tragweite, insbesondere mit Todesfolge, mit besonders schweren Verletzungen oder bei erheblicher Verletzung mehrerer Personen, ist der Schulaufsichtsbehörde ein weiteres Exemplar der Unfallanzeige mit ergänzenden Angaben über Ursache und Hergang, Art und Form der Aufsichtsführung sowie gegebenenfalls über Zeugenvernehmungen zur Kenntnis zu geben, und die Schulaufsichtsbehörde ist vorab fernmündlich zu informieren (Abs. 23). Zur Aufsichtspflicht verweist der Runderlass auf § 57 Abs. 1 SchulG und die dazu erlassene Verwaltungsvorschrift (Abs. 3): Lehrkräfte beaufsichtigen und betreuen Schülerinnen und Schüler in eigener Verantwortung (§ 57 Abs. 1 SchulG); die allgemeine Aufsichtspflicht der Schule entfällt gegenüber volljährigen Schülerinnen und Schülern, die Fürsorgepflicht besteht ihnen gegenüber fort (Verwaltungsvorschrift zu § 57 Abs. 1 SchulG, Nr. 2). Schulen dürfen personenbezogene Daten der Schülerinnen und Schüler verarbeiten, soweit dies zur Erfüllung ihrer Aufgaben erforderlich ist; die Daten dürfen in der Schule nur den Personen zugänglich gemacht werden, die sie dafür benötigen (§ 120 SchulG). Die Sicherheitsbeauftragten der Schule haben unterstützende, beobachtende und beratende Aufgaben, aber weder Aufsichtsfunktion noch Weisungsbefugnisse (Runderlass Abs. 14; § 22 SGB VII).\n\n" +
  "RECHTLICHE EINORDNUNG: Für den Sturz auf das Steißbein ergibt sich daraus: Die Lehrkraft, die den Sturz bemerkt, muss die erste Versorgung einleiten und die Schulleitung unverzüglich informieren; ob und welche ärztliche Hilfe nötig ist, entscheidet die Ärztin oder der Arzt, und die Schule stellt sie sofort sicher, wenn eine gesundheitliche Schädigung zu befürchten ist. Eine Unfallanzeige ist nach dem Wortlaut des Runderlasses vorgeschrieben, sobald der Unfall zu einer ärztlichen Behandlung führt; das schließt eine Behandlung ein, die erst später, etwa auf Veranlassung der Erziehungsberechtigten, erfolgt – die Anzeige ist dann unverzüglich nachzuholen. Für Stürze ohne ärztliche Behandlung sieht der Runderlass keine Anzeige vor. Eine schriftliche Unfallnotiz dient der Dokumentation und der Nachvollziehbarkeit der Aufsicht; sie wird in den Quellen nicht ausdrücklich vorgeschrieben, ist aber sinnvoll, weil die Durchschrift der Unfallanzeige ohnehin bei der Schule verbleibt und Angaben zum Hergang bei einer späteren Anzeige benötigt werden. Ein Unfall belegt für sich keine Verletzung der Aufsichtspflicht; Hinweise auf Aufsichts- oder Organisationsmängel sind sachlich festzuhalten und der Schulleitung zu melden. Bei volljährigen Schülerinnen und Schülern, wie sie an Berufskollegs häufig sind, entfällt die allgemeine Aufsichtspflicht, die Fürsorgepflicht bleibt bestehen; die Information richtet sich dann an die Schülerin oder den Schüler selbst. Die übergebenen Quellen enthalten keine ausdrückliche Aufbewahrungsfrist für Unfallanzeigen und Unfallnotizen und regeln nicht, ob und unter welchen Voraussetzungen bei volljährigen Schülerinnen und Schülern auch Angehörige informiert werden dürfen.";

const RESPONSIBILITIES =
  "Lehrkraft, die zuerst Kenntnis erhält: Erste Hilfe und vorläufige Versorgung, unverzügliche Information der Schulleitung (Runderlass Abs. 20), schriftliche Unfallnotiz. Schulleitung, notfalls die aufsichtführende Lehrkraft: sofortige Sicherstellung der nächstmöglichen ärztlichen Hilfe (Abs. 20). Schulleitung oder eine von ihr beauftragte Lehrkraft: alsbaldige Unterrichtung der Erziehungsberechtigten (Abs. 21). Die Schule, in der Praxis durch die Schulleitung: unverzügliche Unfallanzeige bei ärztlicher Behandlung und Verbleib der Durchschrift in der Schule (Abs. 22) sowie Information der Schulaufsichtsbehörde bei Unfällen von besonderer Bedeutung (Abs. 23). Unfallkasse NRW: zuständiger Unfallversicherungsträger (Abs. 1). Sicherheitsbeauftragte: unterstützend, beobachtend und beratend, ohne Aufsichtsfunktion und Weisungsbefugnis (Abs. 14).";

const PRACTICE_TIP = [
  "- [Rechtlich erforderlich] Nach einem Unfall mit gesundheitlicher Schädigungsgefahr Erste Hilfe einleiten, Schulleitung unverzüglich verständigen und die nächstmögliche ärztliche Hilfe sicherstellen (Runderlass „Unfallverhütung, Schülerunfallversicherung“, Abs. 20)",
  "- [Rechtlich erforderlich] Bei ärztlicher Behandlung die Unfallanzeige unverzüglich an die Unfallkasse NRW senden; die Durchschrift bleibt bei der Schule (Abs. 22)",
  "- [Praktisch empfohlen] Bei Warnzeichen (Taubheitsgefühl oder Lähmungen in den Beinen, starke Schmerzen, Bewegungsunfähigkeit, Bewusstseinsstörung) nicht abwarten, sondern den Rettungsdienst über 112 rufen",
  "- [Praktisch empfohlen] Auch einen scheinbar folgenlosen Sturz kurz schriftlich festhalten; erfährt die Schule später von einer ärztlichen Behandlung, die Unfallanzeige unverzüglich nachholen",
  "- [Praktisch empfohlen] Die Unfallnotiz sachlich halten: Beobachtungen und Fakten festhalten, Vermutungen und Schuldzuweisungen vermeiden",
  "- [Praktisch empfohlen] Unfallunterlagen nur dem Personenkreis zugänglich machen, der sie für seine Aufgaben benötigt (§ 120 SchulG)",
  "- [Bei Unsicherheit] Zur Aufbewahrungsfrist für Unfallanzeigen und Unfallnotizen enthalten die Quellen keine ausdrückliche Regelung: Schulleitung oder Schulaufsicht fragen",
].join("\n");

const CHECKLIST = [
  "[Rechtlich erforderlich] Erste Hilfe und vorläufige Versorgung einleiten und die Schulleitung unverzüglich verständigen (Runderlass Abs. 20)",
  "[Rechtlich erforderlich] Nächstmögliche ärztliche Hilfe sicherstellen – durch die Schulleitung, notfalls die aufsichtführende Lehrkraft; die Ärztin oder der Arzt entscheidet über die weitere Behandlung (Abs. 20)",
  "[Organisatorisch empfohlen] Bei Warnzeichen (Taubheitsgefühl oder Lähmungen in den Beinen, starke Schmerzen, Bewegungsunfähigkeit, Bewusstseinsstörung) den Rettungsdienst über 112 rufen",
  "[Rechtlich erforderlich] Erziehungsberechtigte alsbald durch die Schulleitung oder eine beauftragte Lehrkraft unterrichten (Abs. 21)",
  "[Organisatorisch empfohlen] Bei volljährigen Schülerinnen und Schülern die Schülerin oder den Schüler selbst informieren und besprechen, wer sonst benachrichtigt werden soll",
  "[Rechtlich erforderlich] Führt der Unfall zu einer ärztlichen Behandlung: Unfallanzeige unverzüglich an die Unfallkasse NRW; Durchschrift in der Schule behalten (Abs. 22)",
  "[Rechtlich erforderlich] Unfall von besonderer Bedeutung und Tragweite: Schulaufsichtsbehörde vorab fernmündlich informieren und weiteres Exemplar der Unfallanzeige mit ergänzenden Angaben übermitteln (Abs. 23)",
  "[Organisatorisch empfohlen] Unfallnotiz anfertigen (Datum, Uhrzeit, Ort, Hergang, Zeugen, Beschwerden, Maßnahmen, Name der dokumentierenden Person)",
  "[Organisatorisch empfohlen] Erfährt die Schule später von einer ärztlichen Behandlung, die Unfallanzeige unverzüglich nachholen",
  "[Organisatorisch empfohlen] Unterlagen nur dem erforderlichen Personenkreis zugänglich machen (§ 120 SchulG); Aufbewahrungsfrist mit Schulleitung oder Schulaufsicht klären",
];

const DOCUMENTATION = [
  "[Rechtlich erforderlich] Unfallanzeige auf dem vorgeschriebenen Formular, wenn der Unfall zu einer ärztlichen Behandlung führt; die Durchschrift verbleibt bei der Schule (Runderlass Abs. 22)",
  "[Rechtlich erforderlich] Bei Unfall von besonderer Bedeutung und Tragweite: weiteres Exemplar der Unfallanzeige mit ergänzenden Angaben zu Ursache, Hergang und Aufsichtsführung für die Schulaufsichtsbehörde (Abs. 23)",
  "[Zur Nachvollziehbarkeit empfohlen] Unfallnotiz: Datum, Uhrzeit, Ort, Hergang (z. B. Sturz auf das Steißbein), Zeugen, Beschwerden und sichtbare Verletzungen, ergriffene Erste-Hilfe-Maßnahmen, Name der dokumentierenden Person",
  "[Zur Nachvollziehbarkeit empfohlen] Vermerk zur Information der Schulleitung (wann, durch wen)",
  "[Zur Nachvollziehbarkeit empfohlen] Vermerk zur Information der Erziehungsberechtigten beziehungsweise der volljährigen Schülerin oder des Schülers (wann, Inhalt)",
  "[Zur Nachvollziehbarkeit empfohlen] Bei vermuteten Sicherheitsmängeln: Skizze oder Foto der Unfallstelle",
];

const FAQ = [
  {
    q: "Muss jeder Sturz der Unfallkasse gemeldet werden?",
    a: "Nein. Nach dem Runderlass „Unfallverhütung, Schülerunfallversicherung“ ist jeder Unfall zu melden, der zu einer ärztlichen Behandlung führt, und zwar unverzüglich mit der vorgeschriebenen Unfallanzeige (Abs. 22). Für einen Sturz ohne ärztliche Behandlung schreibt der Runderlass keine Anzeige vor. Weil sich eine Behandlung auch erst später ergeben kann, ist eine kurze schriftliche Unfallnotiz zu empfehlen; erfährt die Schule später von einer ärztlichen Behandlung, ist die Anzeige dann unverzüglich nachzuholen.",
  },
  {
    q: "Sind Schülerinnen und Schüler bei einem Sturz in der Schule versichert, und was gilt als Unfall?",
    a: "Ja. Schülerinnen und Schüler sind während des Besuchs von allgemein- und berufsbildenden Schulen gesetzlich unfallversichert (§ 2 Abs. 1 Nr. 8 Buchst. b SGB VII); der Schutz umfasst alle Unfälle im Zusammenhang mit dem Schulbesuch (Runderlass Abs. 25). Ein Unfall ist ein zeitlich begrenztes, von außen auf den Körper einwirkendes Ereignis, das zu einem Gesundheitsschaden führt (§ 8 Abs. 1 SGB VII); ein Sturz gehört dazu. Unfallversicherungsträger ist die Unfallkasse NRW (Abs. 1).",
  },
  {
    q: "Wer informiert die Erziehungsberechtigten, und was gilt bei volljährigen Schülerinnen und Schülern?",
    a: "Die Erziehungsberechtigten werden durch die Schulleitung oder eine von ihr beauftragte Lehrkraft alsbald unterrichtet (Runderlass Abs. 21). Bei volljährigen Schülerinnen und Schülern entfällt die allgemeine Aufsichtspflicht, die Fürsorgepflicht der Schule besteht fort (Verwaltungsvorschrift zu § 57 Abs. 1 SchulG, Nr. 2); sie sind selbst zu informieren. Ob und unter welchen Voraussetzungen darüber hinaus Angehörige benachrichtigt werden dürfen, regeln die Quellen nicht ausdrücklich; Gesundheitsangaben dürfen in der Schule nur Personen zugänglich gemacht werden, die sie für ihre Aufgaben benötigen (§ 120 SchulG).",
  },
  {
    q: "Wann muss ein Arzt oder der Rettungsdienst hinzugezogen werden?",
    a: "Nach einem Unfall, der eine gesundheitliche Schädigung befürchten lässt, stellt die Schulleitung, notfalls die aufsichtführende Lehrkraft, sofort die nächstmögliche ärztliche Hilfe sicher; die Ärztin oder der Arzt entscheidet über die weitere Behandlung, Erste Hilfe ist kein Ersatz dafür (Runderlass Abs. 20). Bei Warnzeichen wie Taubheitsgefühl oder Lähmungen in den Beinen, starken Schmerzen, Bewegungsunfähigkeit oder Bewusstseinsstörungen sollte der Rettungsdienst über 112 gerufen werden.",
  },
  {
    q: "Ist ein Unfall automatisch eine Verletzung der Aufsichtspflicht?",
    a: "Nein. Ein Unfall belegt für sich keine Aufsichtspflichtverletzung. Maßgeblich sind die Aufgaben der Lehrkräfte nach § 57 Abs. 1 SchulG und die Verwaltungsvorschriften zur Aufsicht. Hinweise auf Aufsichts- oder Organisationsmängel werden sachlich in der Unfallnotiz festgehalten und der Schulleitung gemeldet; bei Unfällen von besonderer Bedeutung sind der Schulaufsichtsbehörde Angaben zur Aufsichtsführung zu machen (Runderlass Abs. 23).",
  },
  {
    q: "Wie lange müssen Unfallanzeige und Unfallnotiz aufbewahrt werden?",
    a: "Eine ausdrückliche Aufbewahrungsfrist für Unfallanzeigen und Unfallnotizen ergibt sich aus den übergebenen Quellen nicht. Fest steht, dass die Durchschrift der Unfallanzeige bei der Schule verbleibt (Runderlass Abs. 22) und dass die Unterlagen nur dem Personenkreis zugänglich sein dürfen, der sie für seine Aufgaben benötigt (§ 120 SchulG). Die Frist ist mit der Schulleitung oder der Schulaufsicht zu klären.",
  },
];

const COMMON_MISTAKES = [
  "[Organisatorisch ungünstig] Den Unfall nur mündlich an die Schulleitung melden und nichts festhalten – bei einer späteren Unfallanzeige fehlen dann Angaben zu Zeit, Ort und Hergang",
  "[Organisatorisch ungünstig] Die Unfallanzeige zurückhalten oder vergessen, wenn sich später doch eine ärztliche Behandlung ergibt – der Runderlass verlangt die unverzügliche Meldung jedes Unfalls mit ärztlicher Behandlung (Abs. 22)",
  "[Organisatorisch ungünstig] Erste Hilfe oder eine Einschätzung der Lehrkraft als Ersatz für ärztliche Abklärung ansehen – Erste Hilfe ist kein Ersatz für ärztliche Hilfe, die Ärztin oder der Arzt entscheidet über die Behandlung (Abs. 20)",
  "[Organisatorisch ungünstig] Warnzeichen wie Taubheitsgefühl oder Lähmungen in den Beinen abwarten, statt sofort den Rettungsdienst zu rufen",
  "[Organisatorisch ungünstig] Bei volljährigen Schülerinnen und Schülern ungefragt Angehörige informieren oder Gesundheitsangaben an Personen weitergeben, die sie nicht benötigen (§ 120 SchulG)",
  "[Organisatorisch ungünstig] In der Unfallnotiz Vermutungen oder Schuldzuweisungen festhalten statt beobachtbarer Tatsachen",
];

// ---------------------------------------------------------------------------
// Entscheidungsbaum
// ---------------------------------------------------------------------------

const TREE = {
  meta: { status: "approved", version: 2 },
  start: "frage_ernst",
  steps: {
    frage_ernst: {
      question: "Gibt es nach dem Sturz auf das Steißbein Warnzeichen für eine ernsthafte Verletzung?",
      explanation: "Warnzeichen sind starke Schmerzen, Bewegungsunfähigkeit, Taubheitsgefühl oder Lähmungen in den Beinen, Bewusstseinsstörung oder deutliche Blutungen. Nach einem Unfall, der eine gesundheitliche Schädigung befürchten lässt, ist sofort die nächstmögliche ärztliche Hilfe sicherzustellen (Runderlass „Unfallverhütung, Schülerunfallversicherung“, Abs. 20).",
      options: [
        { label: "Ja, mindestens ein Warnzeichen liegt vor.", result: "ergebnis_notfall" },
        { label: "Nein, die Person ist ansprechbar, kann sich bewegen und klagt höchstens über leichte bis mäßige Schmerzen.", next: "frage_arzt" },
      ],
    },
    frage_arzt: {
      question: "Wird die verletzte Person ärztlich behandelt oder ist ein Arztbesuch vorgesehen?",
      explanation: "Jeder Unfall, der zu einer ärztlichen Behandlung führt, ist unverzüglich der Unfallkasse NRW mit der vorgeschriebenen Unfallanzeige zu melden (Abs. 22). Das gilt auch, wenn die Behandlung erst später erfolgt.",
      options: [
        { label: "Ja, eine ärztliche Behandlung findet statt oder wurde veranlasst (auch durch die Erziehungsberechtigten).", result: "ergebnis_unfallanzeige" },
        { label: "Nein, es genügt vorerst Erste Hilfe und Beobachtung.", next: "frage_alter" },
      ],
    },
    frage_alter: {
      question: "Ist die verletzte Person minderjährig?",
      explanation: "Die Erziehungsberechtigten werden alsbald unterrichtet (Abs. 21). Bei volljährigen Schülerinnen und Schülern entfällt die allgemeine Aufsichtspflicht, die Fürsorgepflicht der Schule besteht fort (Verwaltungsvorschrift zu § 57 Abs. 1 SchulG, Nr. 2).",
      options: [
        { label: "Ja, die Schülerin oder der Schüler ist minderjährig.", result: "ergebnis_leicht_minderjaehrig" },
        { label: "Nein, die Schülerin oder der Schüler ist volljährig.", result: "ergebnis_leicht_volljaehrig" },
      ],
    },
  },
  results: {
    ergebnis_notfall: {
      color: "rot",
      urgency: "kritisch",
      title: "Warnzeichen nach dem Sturz – Rettungsdienst, Information und Unfallanzeige",
      steps: [
        "Rettungsdienst über 112 rufen und Erste Hilfe leisten; die verletzte Person nicht unnötig bewegen und nicht allein lassen",
        "Schulleitung unverzüglich verständigen; sie, notfalls die aufsichtführende Lehrkraft, stellt die ärztliche Hilfe sicher (Runderlass Abs. 20)",
        "Erziehungsberechtigte alsbald durch die Schulleitung oder eine beauftragte Lehrkraft unterrichten (Abs. 21); bei Volljährigen die Person selbst, soweit möglich, und die von ihr benannte Kontaktperson fragen",
        "Dem Rettungsdienst Hergang, Zeitpunkt und beobachtete Beschwerden mitteilen",
        "Nach der Versorgung eine Unfallnotiz anfertigen: Datum, Uhrzeit, Ort, Hergang, Zeugen, Beschwerden, ergriffene Maßnahmen",
        "Unfall unverzüglich mit der vorgeschriebenen Unfallanzeige der Unfallkasse NRW melden; Durchschrift in der Schule behalten (Abs. 22)",
        "Bei Todesfolge, besonders schweren Verletzungen oder mehreren erheblich Verletzten: Schulaufsichtsbehörde vorab fernmündlich informieren und ein weiteres Exemplar der Unfallanzeige mit Angaben zu Ursache, Hergang und Aufsichtsführung übermitteln (Abs. 23)",
      ],
      warning: "Bei Taubheitsgefühl oder Lähmungen in den Beinen, starken Schmerzen, Bewegungsunfähigkeit oder Bewusstseinsstörung nicht abwarten: Erste Hilfe ist kein Ersatz für ärztliche Hilfe, die Ärztin oder der Arzt entscheidet über die weitere Behandlung (Abs. 20).",
      responsible: "Lehrkraft, die zuerst Kenntnis erhält: Erste Hilfe, Rettungsdienst, Information der Schulleitung. Schulleitung: ärztliche Hilfe, Unterrichtung der Erziehungsberechtigten, Unfallanzeige, bei besonderer Bedeutung Information der Schulaufsichtsbehörde.",
      documentation: "Unfallanzeige (Durchschrift bleibt in der Schule); Unfallnotiz mit Zeitangaben zu Unfall, Alarmierung des Rettungsdienstes und Information von Schulleitung und Angehörigen; bei Unfall von besonderer Bedeutung weiteres Exemplar der Unfallanzeige mit ergänzenden Angaben für die Schulaufsichtsbehörde.",
      recommendation: "Bei Warnzeichen hat die ärztliche Versorgung Vorrang vor allem anderen. Rufen Sie den Rettungsdienst, leisten Sie Erste Hilfe und verständigen Sie unverzüglich die Schulleitung, die die ärztliche Hilfe sicherstellt und die Erziehungsberechtigten unterrichtet. Da eine ärztliche Behandlung stattfindet, ist der Unfall unverzüglich der Unfallkasse NRW anzuzeigen; die Durchschrift bleibt in der Schule. Handelt es sich um einen Unfall von besonderer Bedeutung und Tragweite, ist zusätzlich die Schulaufsichtsbehörde vorab fernmündlich zu informieren und mit einem weiteren Exemplar der Unfallanzeige zu versorgen. Halten Sie Zeitpunkte und Beobachtungen sachlich in einer Unfallnotiz fest.",
    },
    ergebnis_unfallanzeige: {
      color: "gelb",
      urgency: "erhöht",
      title: "Ärztliche Behandlung – Unfallanzeige an die Unfallkasse NRW",
      steps: [
        "Erste Hilfe leisten und die Schulleitung unverzüglich verständigen (Runderlass Abs. 20)",
        "Erziehungsberechtigte alsbald unterrichten (Abs. 21); bei Volljährigen die Schülerin oder den Schüler selbst informieren",
        "Unfallnotiz anfertigen: Datum, Uhrzeit, Ort, Hergang, Zeugen, Beschwerden, ergriffene Maßnahmen",
        "Unfall unverzüglich mit der vorgeschriebenen Unfallanzeige der Unfallkasse NRW melden (Abs. 22)",
        "Durchschrift der Unfallanzeige in der Schule behalten und Zugang auf den erforderlichen Personenkreis beschränken (Abs. 22; § 120 SchulG)",
        "Erfährt die Schule erst später von der Behandlung, die Unfallanzeige zu diesem Zeitpunkt unverzüglich nachholen",
      ],
      warning: "Die Unfallanzeige ist an die ärztliche Behandlung geknüpft, nicht an die Schwere der Verletzung: Auch ein zunächst harmlos wirkender Sturz ist anzuzeigen, sobald er zu einer ärztlichen Behandlung führt (Abs. 22).",
      responsible: "Lehrkraft: Erste Hilfe, Information der Schulleitung, Unfallnotiz. Schulleitung: Unterrichtung der Erziehungsberechtigten, Unfallanzeige, Verwahrung der Durchschrift.",
      documentation: "Unfallanzeige auf dem vorgeschriebenen Formular, Durchschrift bei der Schule; Unfallnotiz mit Hergang, Zeugen und Maßnahmen; Vermerk zur Information von Schulleitung und Erziehungsberechtigten beziehungsweise der volljährigen Schülerin oder des Schülers.",
      recommendation: "Weil der Unfall zu einer ärztlichen Behandlung führt, ist er unverzüglich der Unfallkasse NRW anzuzeigen; die Durchschrift verbleibt bei der Schule (Abs. 22). Verständigen Sie die Schulleitung, lassen Sie die Erziehungsberechtigten alsbald unterrichten (Abs. 21) und halten Sie den Hergang sachlich in einer Unfallnotiz fest. Die Angaben der Notiz erleichtern das Ausfüllen der Unfallanzeige. Bei volljährigen Schülerinnen und Schülern informieren Sie die betroffene Person selbst.",
    },
    ergebnis_leicht_minderjaehrig: {
      color: "gruen",
      urgency: "normal",
      title: "Leichter Sturz, minderjährige Schülerin oder minderjähriger Schüler – Eltern informieren und dokumentieren",
      steps: [
        "Erste Hilfe leisten, die Schmerzen erfragen und die Person beobachten; Ruhe anbieten",
        "Schulleitung verständigen (Runderlass Abs. 20)",
        "Erziehungsberechtigte alsbald unterrichten (Abs. 21) und auf die Möglichkeit einer ärztlichen Abklärung hinweisen, falls die Beschwerden anhalten oder zunehmen",
        "Kurze Unfallnotiz anfertigen: Datum, Uhrzeit, Ort, Hergang, Zeugen, Beschwerden, Maßnahmen",
        "Wird später eine ärztliche Behandlung bekannt: Unfallanzeige unverzüglich nachholen (Abs. 22)",
      ],
      warning: "Verschlechtern sich die Beschwerden, zum Beispiel durch zunehmende Schmerzen oder Taubheitsgefühl in den Beinen, ist sofort ärztliche Hilfe sicherzustellen; mit einer ärztlichen Behandlung entsteht die Pflicht zur Unfallanzeige.",
      responsible: "Lehrkraft: Erste Hilfe, Information der Schulleitung, Unfallnotiz. Schulleitung oder beauftragte Lehrkraft: Unterrichtung der Erziehungsberechtigten.",
      documentation: "Unfallnotiz mit Datum, Uhrzeit, Ort, Hergang, Zeugen, Beschwerden und Maßnahmen; Vermerk zur Information von Schulleitung und Erziehungsberechtigten.",
      recommendation: "Auch bei einem leichten Sturz sollten Erziehungsberechtigte alsbald erfahren, was passiert ist, damit sie die Beschwerden beobachten und gegebenenfalls ärztliche Hilfe veranlassen können (Abs. 21). Eine Unfallanzeige ist nach dem Runderlass nur bei ärztlicher Behandlung vorgeschrieben; dokumentieren Sie den Vorfall trotzdem kurz und sachlich, damit Sie bei einer später bekannt werdenden Behandlung die Unfallanzeige zügig abgeben können.",
    },
    ergebnis_leicht_volljaehrig: {
      color: "gruen",
      urgency: "normal",
      title: "Leichter Sturz, volljährige Schülerin oder volljähriger Schüler – selbst informieren und dokumentieren",
      steps: [
        "Erste Hilfe leisten, die Schmerzen erfragen und die Person beobachten; Ruhe anbieten",
        "Schulleitung verständigen (Runderlass Abs. 20)",
        "Die Schülerin oder den Schüler selbst über den Vorfall und mögliche Folgen informieren und anbieten, bei anhaltenden Beschwerden ärztliche Hilfe zu suchen; Benachrichtigung von Angehörigen nur nach Absprache mit der betroffenen Person",
        "Kurze Unfallnotiz anfertigen: Datum, Uhrzeit, Ort, Hergang, Zeugen, Beschwerden, Maßnahmen",
        "Wird später eine ärztliche Behandlung bekannt: Unfallanzeige unverzüglich nachholen (Abs. 22)",
      ],
      warning: "Gegenüber volljährigen Schülerinnen und Schülern entfällt die allgemeine Aufsichtspflicht, die Fürsorgepflicht der Schule besteht fort (Verwaltungsvorschrift zu § 57 Abs. 1 SchulG, Nr. 2). Gesundheitsangaben dürfen nur Personen zugänglich gemacht werden, die sie für ihre Aufgaben benötigen (§ 120 SchulG).",
      responsible: "Lehrkraft: Erste Hilfe, Information der Schulleitung, Unfallnotiz. Schulleitung: Einsicht in den Vorgang, gegebenenfalls Unfallanzeige.",
      documentation: "Unfallnotiz mit Datum, Uhrzeit, Ort, Hergang, Zeugen, Beschwerden und Maßnahmen; Vermerk zur Information der Schülerin oder des Schülers und der Schulleitung.",
      recommendation: "Bei volljährigen Schülerinnen und Schülern richtet sich die Information an die betroffene Person selbst; ob und wen sie darüber hinaus benachrichtigt haben möchte, sollte mit ihr besprochen werden. Eine Unfallanzeige ist nach dem Runderlass nur bei ärztlicher Behandlung vorgeschrieben, eine kurze sachliche Unfallnotiz bleibt aber sinnvoll, weil sich eine Behandlung auch später ergeben kann und die Unfallanzeige dann unverzüglich nachzuholen ist (Abs. 22).",
    },
  },
};

// ---------------------------------------------------------------------------
// Normverknüpfungen
// ---------------------------------------------------------------------------

type LinkSpec = { idPrefix?: string; short?: string; titleRe?: RegExp; ref: string; from: string; to: string; precise: string; why: string };
const NEW_LINKS: LinkSpec[] = [
  { idPrefix: RUNDERLASS, ref: "Abs. 14", from: "Die für die Sicherheitsbeauftragten in § 22 Absatz 2 SGB VII festgelegten Aufgaben", to: "strafrechtlich belangt werden.", precise: "Abs. 14", why: "Rolle der Sicherheitsbeauftragten: unterstützend und beratend, keine Aufsichtsfunktion." },
  { idPrefix: RUNDERLASS, ref: "Abs. 20", from: "Nach einem Unfall, der eine gesundheitliche Schädigung befürchten lässt", to: "Die Ärztin oder der Arzt entscheidet über die weitere Behandlung.", precise: "Abs. 20", why: "Erste Hilfe, Verständigung der Schulleitung, Sicherstellung ärztlicher Hilfe." },
  { idPrefix: RUNDERLASS, ref: "Abs. 21", from: "Die Erziehungsberechtigten werden", to: "alsbald unterrichtet.", precise: "Abs. 21", why: "Unterrichtung der Erziehungsberechtigten." },
  { idPrefix: RUNDERLASS, ref: "Abs. 22", from: "Jeder Unfall, der zu einer ärztlichen Behandlung führt", to: "verbleibt bei der Schule.", precise: "Abs. 22", why: "Meldeschwelle: Unfallanzeige an die Unfallkasse NRW bei ärztlicher Behandlung; Durchschrift bei der Schule." },
  { idPrefix: RUNDERLASS, ref: "Abs. 23", from: "Bei Unfällen von besonderer Bedeutung und Tragweite", to: "mehrere Personen erheblich verletzt worden sind.", precise: "Abs. 23", why: "Zusätzliche Information der Schulaufsichtsbehörde bei besonders schweren Unfällen." },
  { idPrefix: RUNDERLASS, ref: "Abs. 25", from: "Der Versicherungsschutz der Schülerinnen und Schüler", to: "mit dem Schulbesuch stehen;", precise: "Abs. 25", why: "Reichweite des Versicherungsschutzes der Schülerinnen und Schüler." },
  { idPrefix: VV_AUFSICHT, ref: "2", from: "Die allgemeine Aufsichtspflicht der Schule", to: "auf dieses Alter abgestimmten Form.", precise: "Nr. 2", why: "Aufsichts- und Fürsorgepflicht gegenüber volljährigen Schülerinnen und Schülern." },
  { titleRe: /^Schulgesetz für das Land Nordrhein-Westfalen/, ref: "§ 57", from: "Lehrkräfte unterrichten, erziehen, beraten, beurteilen, beaufsichtigen", to: "fördern alle Schülerinnen und Schüler umfassend.", precise: "§ 57 Abs. 1", why: "Aufgabe der Lehrkräfte, Schülerinnen und Schüler zu beaufsichtigen und zu betreuen." },
  { titleRe: /^Schulgesetz für das Land Nordrhein-Westfalen/, ref: "§ 120", from: "Schulen und Schulaufsichtsbehörden dürfen personenbezogene Daten", to: "für die Erfüllung ihrer Aufgaben benötigen.", precise: "§ 120", why: "Datenverarbeitung nur soweit erforderlich; Zugang nur für Personen, die die Daten für ihre Aufgaben benötigen." },
  { short: "SGB VII", ref: "§ 2", from: "b)Schüler während des Besuchs von allgemein- oder berufsbildenden Schulen", to: "durchgeführten Betreuungsmaßnahmen,", precise: "§ 2 Abs. 1 Nr. 8 Buchst. b", why: "Gesetzlicher Unfallversicherungsschutz der Schülerinnen und Schüler." },
  { short: "SGB VII", ref: "§ 8", from: "Arbeitsunfälle sind Unfälle von Versicherten", to: "zu einem Gesundheitsschaden oder zum Tod führen.", precise: "§ 8 Abs. 1", why: "Begriff des Unfalls." },
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

  const { data: cur, error } = await supabase.from("practice_cases").select("workflow_status, title").eq("id", CASE_ID).single();
  if (error) throw error;
  if (!dry && (cur as any).workflow_status !== "draft") throw new Error(`Fall ist nicht im Entwurf (${(cur as any).workflow_status}) - zuerst 'prepare'.`);

  const parsed = parseCuratedTree(TREE);
  const report = parsed ? validateCuratedTree(parsed) : null;
  if (!report?.valid) throw new Error("Entscheidungsbaum ungültig: " + JSON.stringify(report));

  const { data: allSrc } = await supabase.from("legal_sources").select("id, short_name, title");
  const norm = (s: string) => s.replace(/\s+/g, " ");
  const linkRows: any[] = [];
  for (const l of NEW_LINKS) {
    const src = (allSrc ?? []).find((s: any) => l.idPrefix ? s.id.startsWith(l.idPrefix) : l.short ? s.short_name === l.short : l.titleRe!.test(s.title)) as any;
    if (!src) throw new Error(`Quelle nicht gefunden: ${l.idPrefix ?? l.short ?? l.titleRe}`);
    const { data: secs } = await supabase.from("legal_sections").select("id, reference, content").eq("source_id", src.id);
    const sec = (secs ?? []).find((s: any) => s.reference === l.ref && norm(s.content).includes(l.from)) as any;
    if (!sec) throw new Error(`Abschnitt ${l.ref} nicht gefunden in ${String(src.title).slice(0, 50)}`);
    const c = norm(sec.content); const i = c.indexOf(l.from); const j = c.indexOf(l.to, i);
    if (i < 0 || j < 0) throw new Error(`Auszug für ${l.precise} (${l.ref}) nicht auffindbar (${i}/${j})`);
    linkRows.push({ case_id: CASE_ID, legal_section_id: sec.id, content_summary: c.slice(i, j + l.to.length), content_summary_kind: "wortlaut", precise_reference: l.precise, explanation: l.why });
  }

  const { data: existing } = await (supabase.from("case_legal_links") as any).select("id, legal_section_id, legal_sections(source_id)").eq("case_id", CASE_ID);
  const keepSection = (e: any) => String(e.legal_sections?.source_id ?? "").startsWith(RUNDERLASS);
  const obsolete = (existing ?? []).filter((e: any) => !keepSection(e));
  const have = new Set((existing ?? []).filter(keepSection).map((e: any) => e.legal_section_id));
  const toInsert = linkRows.filter((r) => !have.has(r.legal_section_id));

  if (dry) {
    console.log(`Trockenlauf OK: Baum gültig (${Object.keys(TREE.steps).length} Fragen, ${Object.keys(TREE.results).length} Ergebnisse), ${linkRows.length} Normauszüge gefunden.`);
    console.log(`Links: ${obsolete.length} themenfremde würden entfernt, ${toInsert.length} neu, ${linkRows.length - toInsert.length} bereits vorhanden (Runderlass).`);
    for (const r of linkRows) console.log(`  ${String(r.precise_reference).padEnd(28)} ${r.content_summary.slice(0, 80)}…`);
    return;
  }

  // Alt-Link Abs. 1 (Runderlass) erhalten; themenfremde Links entfernen.
  if (obsolete.length) {
    const { error: e } = await (supabase.from("case_legal_links") as any).delete().in("id", obsolete.map((o: any) => o.id));
    if (e) throw new Error("Alt-Links entfernen fehlgeschlagen: " + e.message);
  }
  if (toInsert.length) {
    const { error: e } = await (supabase.from("case_legal_links") as any).insert(toInsert);
    if (e) throw new Error("Links einfügen fehlgeschlagen: " + e.message);
  }
  console.log(`Rechtsgrundlagen: ${obsolete.length} themenfremde entfernt, ${toInsert.length} neu verknüpft`);

  await updateCase(CASE_ID, {
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
  console.log("Fall aktualisiert.");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FEHLER:", e?.message ?? e); process.exit(1); });
