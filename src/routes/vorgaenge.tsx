import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpen, Sparkles, ArrowRight } from "lucide-react";
import { PageShell } from "../components/PageShell";

export const Route = createFileRoute("/vorgaenge")({
  head: () => ({
    meta: [
      { title: "Meine Vorgänge – RechtKompass Schule" },
      { name: "description", content: "Ihre gespeicherten Vorgänge und laufenden Fälle." },
    ],
  }),
  component: VorgaengePage,
});

function VorgaengePage() {
  return (
    <PageShell title="Meine Vorgänge" subtitle="Gespeicherte Fälle, laufende Dokumentationen und Notizen.">
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
          <FolderOpen className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          Diese Funktion wird vorbereitet.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          In Kürze können Sie hier Vorgänge speichern, Verlaufsnotizen führen und den Status
          einzelner Situationen verfolgen.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Sparkles className="h-3.5 w-3.5" /> Frage stellen
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
