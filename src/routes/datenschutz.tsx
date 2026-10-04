// Datenschutzerklärung (Art. 13/14 DSGVO). Öffentlich erreichbar, auch ohne
// Anmeldung (Ausnahme vom PilotGate in __root.tsx).
//
// Jeder Abschnitt beschreibt NUR, was der Code tatsächlich tut (Stand 04.10.2026):
//   - Anmeldung per Magic-Link (Supabase Auth, Pilotliste)        → PilotGate.tsx, adminAuth.ts
//   - Profil: E-Mail, Anzeigename, Rolle, Organisation            → db/2026-07-23_user_profiles_and_roles.sql
//   - Rückfragen-Copilot: Frage + Antwortkürzel, 90 Tage          → db/2026-09-29_copilot_conversations.sql, 2026-10-04_copilot_retention.sql
//   - Fall schildern: Freitext nur an KI, keine Speicherung       → api/ai-analyze-case-description.ts, DescriptionIntake.tsx (sessionStorage)
//   - Vorgänge/Fallakten, Dokumente, Umfrage, Fehlermeldungen     → workflow_*, case_documents, pilot_survey_responses, case_feedback_reports
//   - KI-Anbieter Anthropic/OpenAI, E-Mail über Resend             → AnthropicProvider.ts, OpenAIEmbeddingProvider.ts, resend.server.ts
//   - Browser-Speicher: Login-Token, Favoriten, Darstellung        → client.ts, StickyActionBar.tsx, einstellungen.tsx
//   - Keine Analyse-/Tracking-Dienste, Schriftart lokal            → __root.tsx (kein externes Stylesheet mehr)
// Wenn sich eines davon ändert, MUSS dieser Text mitgezogen werden (Stand in betreiber.ts anpassen).
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PageShell } from "../components/PageShell";
import { BETREIBER, istPlatzhalter } from "@/lib/betreiber";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutzerklärung – RechtKompass Schule" },
      { name: "description", content: "Welche Daten RechtKompass Schule verarbeitet, wozu, wie lange und welche Rechte Sie haben." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DatenschutzPage,
});

function Abschnitt({ nr, titel, children }: { nr: string; titel: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-foreground">
        {nr}. {titel}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Wert({ v }: { v: string }) {
  if (istPlatzhalter(v)) {
    return (
      <span className="rounded bg-warning/15 px-1 font-mono text-[11px] text-warning" title="Platzhalter – in src/lib/betreiber.ts ausfüllen">
        {v}
      </span>
    );
  }
  return <>{v}</>;
}

/** Punkte, die vor dem Produktivbetrieb mit dem Datenschutzbeauftragten festzuzurren sind. */
function DsbHinweis({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">Zur Abstimmung mit dem Datenschutzbeauftragten:</span> {children}
    </p>
  );
}

function DatenschutzPage() {
  const b = BETREIBER;
  return (
    <PageShell title="Datenschutzerklärung" subtitle={`Stand: ${b.standDatenschutz}`}>
      <div className="space-y-7 text-sm leading-relaxed text-foreground/90">
        <p className="rounded-xl border border-border bg-card p-4">
          Kurz gesagt: RechtKompass Schule ist ein Nachschlagewerk für Lehrkräfte. Wir verarbeiten so wenig
          personenbezogene Daten wie möglich: Ihre dienstliche E-Mail-Adresse für die Anmeldung, das, was Sie selbst
          eingeben (Rückfragen, Notizen in Vorgängen, Umfrageantworten), und technische Zugriffsdaten. Es gibt keine
          Werbung, kein Tracking, keine Analyse-Dienste und keinen Verkauf von Daten. Bitte geben Sie keine Namen oder
          andere Angaben zu Schülerinnen, Schülern, Eltern oder Kolleginnen und Kollegen ein.
        </p>

        <Abschnitt nr="1" titel="Verantwortlicher">
          <p>
            <Wert v={b.name} />, {b.zusatz}, <Wert v={b.strasse} />, <Wert v={b.plzOrt} />, {b.land}. E-Mail:{" "}
            <Wert v={b.email} />. Weitere Angaben im{" "}
            <Link to="/impressum" className="underline underline-offset-2">
              Impressum
            </Link>
            .
          </p>
          <DsbHinweis>
            Während der Pilotphase am Berufskolleg ist zu klären, ob die Schule als eigene Verantwortliche oder als
            gemeinsam Verantwortliche (Art. 26 DSGVO) auftritt und ob ein Auftragsverarbeitungsvertrag zwischen Schule
            und Betreiber nötig ist. Ein betrieblicher Datenschutzbeauftragter ist für den Betreiber nach aktuellem
            Stand nicht bestellt (weniger als 20 Personen mit ständiger Datenverarbeitung, § 38 BDSG) – Prüfung offen.
          </DsbHinweis>
        </Abschnitt>

        <Abschnitt nr="2" titel="Aufruf der Website und Hosting">
          <p>
            Die Anwendung wird über das Netzwerk von Cloudflare, Inc. ausgeliefert (Server-Code als Cloudflare Worker,
            Domain und Schutz vor Angriffen). Beim Aufruf verarbeitet Cloudflare technisch notwendige Daten: IP-Adresse,
            Zeitpunkt, aufgerufene Adresse, Browser- und Betriebssystemkennung. Rechtsgrundlage ist unser berechtigtes
            Interesse an einem sicheren und funktionsfähigen Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Wir selbst führen
            keine eigenen Zugriffsprotokolle mit IP-Adressen.
          </p>
          <p>
            Datenbank und Anmeldedienst laufen bei Supabase Inc. im Rechenzentrum der Region Frankfurt am Main
            (AWS eu-central-1, Deutschland). Dort liegen alle in den Abschnitten 3 bis 6 genannten Daten.
          </p>
          <DsbHinweis>
            Cloudflare ist ein US-Unternehmen; die Verarbeitung der Zugriffsdaten kann außerhalb der EU erfolgen.
            Im Dossier sind abzulegen: Auftragsverarbeitungsvertrag (Cloudflare Data Processing Addendum),
            Übermittlungsgrundlage (EU-US Data Privacy Framework beziehungsweise Standardvertragsklauseln) und die
            Frage, ob der Worker auf EU-Standorte begrenzt werden soll.
          </DsbHinweis>
        </Abschnitt>

        <Abschnitt nr="3" titel="Anmeldung und Nutzerkonto">
          <p>
            Die Nutzung ist nur für freigeschaltete Lehrkräfte möglich (geschlossene Pilotphase). Sie melden sich mit
            Ihrer dienstlichen E-Mail-Adresse an und erhalten einen Anmeldelink per E-Mail (kein Passwort). Dafür
            speichern wir: E-Mail-Adresse, Zeitpunkte der Anmeldung, einen optionalen Anzeigenamen, Ihre Rolle in der
            Anwendung (Lehrkraft, Redaktion, Administration) und die Organisation (Schule). Die Liste der freigeschalteten
            Adressen führt die Projektleitung; die Aufnahme erfolgt auf Veranlassung der Schule.
          </p>
          <p>
            Rechtsgrundlage: Durchführung des Nutzungsverhältnisses (Art. 6 Abs. 1 lit. b DSGVO) und berechtigtes
            Interesse an der Zugangskontrolle (lit. f). Die Anmelde-E-Mail wird über den Dienst Resend (Abschnitt 7)
            von der Adresse anmeldung@rechtkompass-schule.de versandt. Der Anmeldelink ist 24 Stunden gültig.
          </p>
        </Abschnitt>

        <Abschnitt nr="4" titel="Funktionen, bei denen Sie selbst Daten eingeben">
          <p className="font-medium text-foreground">Rückfragen zu einem Fall (Copilot)</p>
          <p>
            Ihre Frage wird zusammen mit Auszügen der verlinkten Rechtsquellen an einen KI-Dienst (Abschnitt 6)
            gesendet, der daraus eine quellengestützte Antwort erzeugt. Frage, eine Kurzfassung der Antwort und die
            verwendeten Quellenstellen werden Ihrem Konto zugeordnet gespeichert, damit Sie das Gespräch fortsetzen
            können. Diese Gespräche werden 90 Tage nach der letzten Aktivität automatisch gelöscht.
          </p>
          <p className="font-medium text-foreground">Fall schildern (Assistent)</p>
          <p>
            Ihre Schilderung wird an einen KI-Dienst gesendet, um passende Fälle vorzuschlagen und bis zu drei
            Rückfragen zu stellen. Die Schilderung wird nicht in unserer Datenbank gespeichert; sie bleibt nur im
            Browser-Tab, bis Sie ihn schließen.
          </p>
          <p className="font-medium text-foreground">Vorgänge und Fallakten</p>
          <p>
            Wenn Sie einen Vorgang anlegen, speichern wir Ihre Checklisten-Haken, Notizen und erzeugten Dokumente
            Ihrem Konto zugeordnet, bis Sie den Vorgang löschen. Nur Sie und die Administration sehen Ihre Vorgänge.
            Bitte arbeiten Sie dort ohne Klarnamen von Schülerinnen, Schülern oder Eltern; verwenden Sie Kürzel oder
            Initialen und führen Sie die eigentliche Schülerakte in den dafür vorgesehenen Systemen der Schule.
          </p>
          <p className="font-medium text-foreground">Dokumente per E-Mail versenden</p>
          <p>
            Wenn Sie ein Dokument per E-Mail versenden, geben Sie eine Empfängeradresse ein. Sie wird für den Versand
            an den E-Mail-Dienst übergeben (Abschnitt 7) und zu Ihrer Bequemlichkeit nur in Ihrem Browser gemerkt,
            nicht auf unseren Servern.
          </p>
          <p className="font-medium text-foreground">Umfrage zur Pilotphase und Fehlermeldungen</p>
          <p>
            Umfrageantworten werden Ihrem Konto zugeordnet gespeichert, damit Sie sie ändern können; ausgewertet
            werden sie nur von der Projektleitung und nur zur Weiterentwicklung. Fehlermeldungen zu einem Fall
            (Meldung, Fallbezug, Dringlichkeit) werden mit Ihrem Konto gespeichert, damit die Redaktion nachfragen kann.
          </p>
          <p>
            Rechtsgrundlage für alle Funktionen dieses Abschnitts: Durchführung des Nutzungsverhältnisses (Art. 6
            Abs. 1 lit. b DSGVO). Soweit Sie dabei Angaben zu Dritten machen, sind Sie dafür als Lehrkraft Ihrer Schule
            verantwortlich; die Anwendung ist nicht dafür bestimmt.
          </p>
        </Abschnitt>

        <Abschnitt nr="5" titel="Redaktion und Qualitätssicherung">
          <p>
            Die Fallsammlung wird redaktionell erstellt und mit KI-Unterstützung gegen die Rechtsquellen geprüft.
            Dabei werden keine Nutzerdaten verarbeitet; protokolliert werden pro KI-Aufruf nur Modell, Zweck,
            Token-Mengen und Dauer zur Kostenkontrolle, ohne Bezug zu Personen.
          </p>
        </Abschnitt>

        <Abschnitt nr="6" titel="KI-Dienste">
          <p>
            Für Antworten und Vorschläge nutzen wir Sprachmodelle von Anthropic, PBC (Textantworten) und OpenAI
            (Erzeugung von Suchvektoren für Rechtstexte und Suchanfragen). Übermittelt werden ausschließlich die in
            Abschnitt 4 genannten Eingaben und Rechtsquellen-Auszüge, niemals Ihre E-Mail-Adresse, Ihr Name oder Ihre
            Kontodaten. Die Anbieter verarbeiten die Daten als Auftragsverarbeiter nach ihren
            Geschäftskundenbedingungen; eine Nutzung zum Training der Modelle ist dort ausgeschlossen. Die Verarbeitung
            kann in den USA stattfinden.
          </p>
          <DsbHinweis>
            Im Dossier abzulegen: Auftragsverarbeitungsverträge beider Anbieter, Übermittlungsgrundlage
            (Data Privacy Framework/Standardvertragsklauseln), Aufbewahrungsfristen der Anbieter für API-Eingaben
            und das Ergebnis der Prüfung, ob eine Datenschutz-Folgenabschätzung (Art. 35 DSGVO) erforderlich ist.
          </DsbHinweis>
        </Abschnitt>

        <Abschnitt nr="7" titel="E-Mail-Versand">
          <p>
            Anmeldelinks, versendete Dokumente und Hinweis-Mails der Redaktion werden über Resend, Inc. verschickt.
            Verarbeitet werden Empfängeradresse, Betreff, Inhalt und Zustellstatus. Rechtsgrundlage ist die
            Durchführung des Nutzungsverhältnisses (Art. 6 Abs. 1 lit. b DSGVO).
          </p>
          <DsbHinweis>Auftragsverarbeitungsvertrag und Übermittlungsgrundlage (US-Anbieter) im Dossier ablegen.</DsbHinweis>
        </Abschnitt>

        <Abschnitt nr="8" titel="Speicherung in Ihrem Browser, Cookies, keine Analyse-Dienste">
          <p>
            Die Anwendung speichert in Ihrem Browser (localStorage) Ihr Anmelde-Token, Darstellungseinstellungen
            (dunkles Design, Schriftgröße), Favoriten und zuletzt geöffnete Fälle sowie die zuletzt verwendete
            Empfängeradresse für den Dokumentenversand. Im Tab-Speicher (sessionStorage) liegt ein Entwurf Ihrer
            Fallschilderung, bis Sie den Tab schließen. Diese Daten verlassen Ihr Gerät nicht. Ein Cookie wird nur im
            Redaktionsbereich für den Zustand der Seitenleiste gesetzt. Es gibt keine Tracking-Cookies, keine
            Reichweitenmessung und keine eingebundenen Dienste Dritter; auch die Schriftart wird von unserem eigenen
            Server geladen.
          </p>
        </Abschnitt>

        <Abschnitt nr="9" titel="Speicherdauer">
          <ul className="list-disc space-y-1 pl-5">
            <li>Nutzerkonto und Profil: bis zur Löschung des Kontos oder Ende der Freischaltung.</li>
            <li>Copilot-Gespräche: 90 Tage nach der letzten Aktivität, dann automatische Löschung.</li>
            <li>Vorgänge, Fallakten, Dokumente: bis Sie sie löschen oder das Konto gelöscht wird.</li>
            <li>Umfrageantworten: bis zum Abschluss der Auswertung der Pilotphase.</li>
            <li>Fehlermeldungen: bis zur Erledigung durch die Redaktion, danach ohne Kontobezug.</li>
            <li>Zugriffsdaten bei Cloudflare und Anmeldeprotokolle bei Supabase: nach den Fristen der Anbieter, in der Regel wenige Tage bis Wochen.</li>
          </ul>
        </Abschnitt>

        <Abschnitt nr="10" titel="Ihre Rechte">
          <p>
            Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17),
            Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen
            Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Wenden Sie sich dafür an die oben genannte
            E-Mail-Adresse; die Löschung Ihres Kontos einschließlich aller zugeordneten Daten veranlassen wir auf
            Anfrage. Außerdem können Sie sich bei einer Aufsichtsbehörde beschweren, zum Beispiel bei der{" "}
            {b.aufsicht.name}, {b.aufsicht.adresse},{" "}
            <a href={b.aufsicht.web} className="underline underline-offset-2" rel="noreferrer" target="_blank">
              {b.aufsicht.web.replace("https://", "")}
            </a>
            .
          </p>
        </Abschnitt>

        <Abschnitt nr="11" titel="Änderungen">
          <p>
            Wir passen diese Erklärung an, wenn sich die Anwendung oder die Rechtslage ändert. Es gilt die jeweils
            hier veröffentlichte Fassung; den Stand sehen Sie oben.
          </p>
        </Abschnitt>
      </div>
    </PageShell>
  );
}
