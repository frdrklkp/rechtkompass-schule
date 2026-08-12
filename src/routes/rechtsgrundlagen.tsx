import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale, ChevronDown, ArrowRight, BookOpen } from "lucide-react";
import { LAWS } from "../data/laws";
import { PageShell } from "../components/PageShell";
import { Disclaimer } from "../components/Disclaimer";
import { listSections, listSources } from "@/lib/coreBuilder";

export const Route = createFileRoute("/rechtsgrundlagen")({
  head: () => ({
    meta: [
      { title: "Rechtsgrundlagen – RechtKompass Schule" },
      {
        name: "description",
        content:
          "Übersichtliche Bibliothek der zentralen Rechtsgrundlagen für den Schulalltag – GG, SchulG NRW, BASS, ADO, DSGVO.",
      },
    ],
  }),
  component: LawsPage,
});

function LawsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const sectionsQ = useQuery({ queryKey: ["public", "sections"], queryFn: listSections });
  const sourcesQ = useQuery({ queryKey: ["public", "sources"], queryFn: listSources });
  const sourcesById = new Map<string, any>(
    ((sourcesQ.data ?? []) as any[]).map((s) => [s.id, s]),
  );
  const dbSections = ((sectionsQ.data ?? []) as any[]).filter(
    (s) => (s.status ?? "draft") !== "draft" || true,
  );

  return (
    <PageShell
      title="Rechtsgrundlagen"
      subtitle="Bibliothek zentraler Vorschriften und Erlasse mit Bezug zum Schulalltag."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {LAWS.map((law) => {
          const open = openId === law.id;
          return (
            <article
              key={law.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-5 transition-all hover:border-accent/60 hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                  <Scale className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h2 className="truncate text-base font-semibold text-foreground">
                      {law.title}
                    </h2>
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                      {law.short}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{law.scope}</p>
                </div>
              </div>

              <p className="mt-3 text-sm text-foreground/80">{law.description}</p>

              <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {law.topicCount} Themen
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {law.keyParagraphs.length} Kernparagraphen
                </span>
              </div>

              {open ? (
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {law.keyParagraphs.map((p) => (
                    <li key={p.ref} className="flex gap-3 text-sm">
                      <span className="w-36 shrink-0 font-medium text-foreground">
                        {p.ref}
                      </span>
                      <span className="text-muted-foreground">{p.note}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  onClick={() => setOpenId(open ? null : law.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  {open ? "Schließen" : "Öffnen"}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                <Link
                  to="/faelle"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-accent"
                >
                  Fälle dazu
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {dbSections.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-semibold">Wissenskarten aus der Rechtsdatenbank</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Redaktionell gepflegte Erläuterungen. Klicken zum Öffnen. Maßgeblich bleibt die
            offizielle Quelle.
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {dbSections.map((s: any) => {
              const src = sourcesById.get(s.source_id);
              return (
                <li key={s.id}>
                  <Link
                    to="/rechtsgrundlagen/$id"
                    params={{ id: s.id }}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-accent/60"
                  >
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-semibold">{s.section_number}</span>
                        {src && (
                          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            {src.short_name || src.name}
                          </span>
                        )}
                      </div>
                      {s.title && (
                        <p className="mt-0.5 text-xs text-foreground/80">{s.title}</p>
                      )}
                      {s.summary && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {s.summary}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Disclaimer />
    </PageShell>
  );
}

