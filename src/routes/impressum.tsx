// Impressum nach § 5 Digitale-Dienste-Gesetz (DDG). Öffentlich erreichbar,
// auch ohne Anmeldung (Ausnahme vom PilotGate in __root.tsx), weil die
// Anbieterkennzeichnung von jeder Seite aus - auch vom Login - erreichbar
// sein muss. Angaben kommen zentral aus src/lib/betreiber.ts.
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "../components/PageShell";
import { BETREIBER, istPlatzhalter } from "@/lib/betreiber";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: "Impressum – RechtKompass Schule" },
      { name: "description", content: "Anbieterkennzeichnung nach § 5 DDG." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImpressumPage,
});

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

function ImpressumPage() {
  const b = BETREIBER;
  const offen = [b.name, b.strasse, b.plzOrt, b.email, b.telefon, b.ustId].filter(istPlatzhalter).length;

  return (
    <PageShell title="Impressum" subtitle="Anbieterkennzeichnung nach § 5 DDG.">
      {offen > 0 && (
        <p className="mb-5 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-foreground/90">
          Diese Seite ist noch nicht vollständig: {offen} Angabe{offen === 1 ? "" : "n"} fehlen (gelb markiert). Vor jeder
          Weitergabe an Dritte in <code className="text-[11px]">src/lib/betreiber.ts</code> ergänzen.
        </p>
      )}

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Anbieter</h2>
          <p>
            <Wert v={b.name} />
            <br />
            {b.zusatz}
            <br />
            <Wert v={b.strasse} />
            <br />
            <Wert v={b.plzOrt} />
            <br />
            {b.land}
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Kontakt</h2>
          <p>
            E-Mail: <Wert v={b.email} />
            <br />
            Telefon: <Wert v={b.telefon} />
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Umsatzsteuer</h2>
          <p>
            <Wert v={b.ustId} />
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Verantwortlich für die Inhalte</h2>
          <p>
            <Wert v={b.name} />, Anschrift wie oben.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Keine Rechtsberatung</h2>
          <p>
            RechtKompass Schule stellt redaktionell aufbereitete Informationen zu schulrechtlichen Alltagssituationen
            bereit und verweist auf die zugrunde liegenden Rechtsquellen. Die Inhalte sind keine Rechtsberatung im
            Einzelfall im Sinne des Rechtsdienstleistungsgesetzes und ersetzen nicht die Abstimmung mit Schulleitung,
            Schulaufsicht oder einer rechtsberatenden Stelle. Jede Fallseite weist ihren Prüfstand aus (Ampel und offene
            Rechtsfragen); nicht abschließend geprüfte Fälle sind für Nutzerinnen und Nutzer ausgeblendet.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Haftung für Inhalte und Links</h2>
          <p>
            Die Inhalte werden mit Sorgfalt erstellt und gegen die genannten Rechtsquellen geprüft. Für Richtigkeit,
            Vollständigkeit und Aktualität kann dennoch keine Gewähr übernommen werden; Rechtsgrundlagen ändern sich.
            Für Inhalte verlinkter externer Seiten (zum Beispiel Gesetzestexte bei gesetze-im-internet.de, recht.nrw.de
            oder bass.schule.nrw) sind deren Betreiber verantwortlich.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Urheberrecht</h2>
          <p>
            Die redaktionellen Texte, Checklisten und Entscheidungshilfen sind urheberrechtlich geschützt. Amtliche
            Werke (Gesetze, Verordnungen, Erlasse) sind nach § 5 UrhG gemeinfrei und werden mit Quellenangabe
            wiedergegeben.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Streitbeilegung</h2>
          <p>
            Zur Teilnahme an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle sind wir nicht
            verpflichtet und nicht bereit. Das Angebot richtet sich an Schulen und Lehrkräfte im dienstlichen Kontext.
          </p>
        </section>

        <p className="pt-2 text-xs text-muted-foreground">
          Siehe auch:{" "}
          <Link to="/datenschutz" className="underline underline-offset-2">
            Datenschutzerklärung
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
