import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, ArrowRight } from "lucide-react";
import { PageShell } from "../components/PageShell";

export const Route = createFileRoute("/dokumente")({
  head: () => ({
    meta: [
      { title: "Meine Dokumente – RechtKompass Schule" },
      { name: "description", content: "Ihre erstellten Dokumente und Vorlagen." },
    ],
  }),
  component: DokumentePage,
});

function DokumentePage() {
  return (
    <PageShell title="Meine Dokumente" subtitle="Erstellte Aktennotizen, Protokolle und Anschreiben.">
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
          <FileText className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          Diese Funktion wird vorbereitet.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Hier sehen Sie bald alle Dokumente, die Sie über Vorlagen erstellt haben – mit Suche,
          Verlauf und schnellem Zugriff.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            to="/dokumentation"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <FileText className="h-3.5 w-3.5" /> Dokumentation starten
          </Link>
          <Link
            to="/faelle"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:border-accent"
          >
            Themen entdecken <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
