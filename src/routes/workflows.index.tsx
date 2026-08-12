import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Layers, ListChecks, Loader2, PlayCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkflowCatalog, useWorkflowSessions } from "@/hooks/workflow/useWorkflowRuntime";

export const Route = createFileRoute("/workflows/")({
  head: () => ({
    meta: [
      { title: "Workflows – Schulrechtliche Handlungsleitfäden" },
      {
        name: "description",
        content:
          "Strukturierte, redaktionell gepflegte Handlungsleitfäden für schulrechtliche Situationen – Schritt für Schritt umsetzbar.",
      },
      { property: "og:title", content: "Workflows – Schulrechtliche Handlungsleitfäden" },
      {
        property: "og:description",
        content: "Handlungsleitfäden Schritt für Schritt begleitet – rechtssicher und dokumentiert.",
      },
    ],
  }),
  component: WorkflowCatalog,
});

function WorkflowCatalog() {
  const catalog = useWorkflowCatalog();
  const sessions = useWorkflowSessions();

  const openSessions = (sessions.data ?? []).filter(
    (s) => s.status === "running" || s.status === "paused",
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Handlungsleitfäden</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Wählen Sie einen Leitfaden aus. Die Plattform führt Sie Schritt für Schritt durch das Verfahren
          und dokumentiert Ihre Entscheidungen revisionssicher.
        </p>
      </header>

      {openSessions.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Laufende Vorgänge
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {openSessions.map((s) => (
              <Link
                key={s.id}
                to="/workflows/session/$sessionId"
                params={{ sessionId: s.id }}
                className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Vorgang fortsetzen</span>
                  <Badge variant={s.status === "paused" ? "secondary" : "default"}>
                    {s.status === "paused" ? "Pausiert" : "Aktiv"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Gestartet: {s.startedAt ? new Date(s.startedAt).toLocaleString("de-DE") : "—"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {catalog.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Leitfäden werden geladen …
        </div>
      ) : catalog.isError ? (
        <p className="text-destructive">Der Katalog konnte nicht geladen werden.</p>
      ) : (catalog.data?.length ?? 0) === 0 ? (
        <p className="text-muted-foreground">Derzeit sind keine veröffentlichten Leitfäden verfügbar.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {catalog.data!.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {t.publicationTier === "public" ? "Öffentlich" : "Intern"}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-xl">{t.title}</CardTitle>
                {t.subtitle && <CardDescription>{t.subtitle}</CardDescription>}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                {t.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{t.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" /> {t.phaseCount} Phasen
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="h-3.5 w-3.5" /> {t.stepCount} Schritte
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" className="flex-1">
                    <Link to="/workflows/$templateId" params={{ templateId: t.id }}>
                      Details <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild className="flex-1">
                    <Link to="/workflows/$templateId" params={{ templateId: t.id }}>
                      <PlayCircle className="mr-2 h-4 w-4" /> Starten
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
