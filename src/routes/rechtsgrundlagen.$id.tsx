import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowLeft, ExternalLink, Scale } from "lucide-react";
import { listSections, listSources } from "@/lib/coreBuilder";
import { LoadingState, ErrorState } from "@/components/DataStates";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/rechtsgrundlagen/$id")({
  head: () => ({
    meta: [
      { title: "Rechtsgrundlage – RechtKompass Schule" },
      {
        name: "description",
        content:
          "Lesbare Wissenskarte zu einer Rechtsgrundlage: Kurzbeschreibung, Praxisbedeutung, Handlungsempfehlung und typische Fehler.",
      },
    ],
  }),
  component: PublicSectionDetail,
});

function Block({ title, text }: { title: string; text?: string | null }) {
  const v = typeof text === "string" ? text.trim() : "";
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {v ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{v}</p>
      ) : (
        <p className="mt-2 text-xs italic text-muted-foreground">
          Dieser Abschnitt ist noch nicht redaktionell ausgearbeitet.
        </p>
      )}
    </section>
  );
}

function PublicSectionDetail() {
  const { id } = Route.useParams();
  const sectionsQ = useQuery({ queryKey: ["public", "sections"], queryFn: listSections });
  const sourcesQ = useQuery({ queryKey: ["public", "sources"], queryFn: listSources });

  const section = useMemo(
    () => ((sectionsQ.data ?? []) as any[]).find((s) => s.id === id),
    [sectionsQ.data, id],
  );
  const source = useMemo(
    () => ((sourcesQ.data ?? []) as any[]).find((s) => s.id === section?.source_id),
    [sourcesQ.data, section],
  );

  if (sectionsQ.isLoading || sourcesQ.isLoading) {
    return (
      <PageShell title="Rechtsgrundlage" subtitle="Wissenskarte wird geladen …">
        <LoadingState />
      </PageShell>
    );
  }
  if (sectionsQ.error) {
    return (
      <PageShell title="Rechtsgrundlage" subtitle="">
        <ErrorState error={sectionsQ.error} />
      </PageShell>
    );
  }
  if (!section) {
    return (
      <PageShell title="Rechtsgrundlage" subtitle="">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Rechtsgrundlage nicht gefunden.</p>
          <Link
            to="/rechtsgrundlagen"
            className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Zur Übersicht
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`${section.section_number}${section.title ? " — " + section.title : ""}`}
      subtitle={source ? `${source.short_name || source.name}${source.legal_area ? " · " + source.legal_area : ""}` : ""}
    >
      <Link
        to="/rechtsgrundlagen"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Zurück zu allen Rechtsgrundlagen
      </Link>

      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
            <Scale className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            {section.summary ? (
              <p className="text-sm leading-relaxed text-foreground/85">{section.summary}</p>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                Keine Kurzbeschreibung hinterlegt.
              </p>
            )}
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] italic text-amber-800 dark:text-amber-300">
              Diese Rechtsgrundlage dient der Orientierung. Maßgeblich bleibt die offizielle Quelle.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Block title="Praxisbedeutung" text={section.practice_relevance} />
        <Block title="Handlungsempfehlung" text={section.recommendation} />
        <Block title="Typische Fehler" text={section.common_mistakes} />
        <Block title="Volltext (Arbeitsentwurf)" text={section.full_text} />
      </div>

      {section.official_url && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Offizielle Quelle</h2>
          <a
            href={section.official_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <ExternalLink className="h-4 w-4" /> {section.official_url}
          </a>
        </section>
      )}
    </PageShell>
  );
}
