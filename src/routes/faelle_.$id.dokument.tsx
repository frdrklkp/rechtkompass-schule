import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePublishedCase } from "@/lib/casesFromDb";
import { listTemplatesForCase } from "@/lib/templatesRepo";
import { CaseDocumentsPanel } from "@/components/CaseDocumentsPanel";
import { LoadingState, ErrorState } from "@/components/DataStates";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Disclaimer } from "@/components/Disclaimer";
import { FeedbackReportDialog } from "@/components/FeedbackReportDialog";

export const Route = createFileRoute("/faelle_/$id/dokument")({
  component: CaseDocumentWorkflowRoute,
  head: () => ({
    meta: [
      { title: "Dokument erstellen – RechtKompass Schule" },
      {
        name: "description",
        content:
          "Dokumentationsvorlage auswählen, Entwurf erzeugen, ergänzen und per E-Mail versenden.",
      },
    ],
  }),
});

function CaseDocumentWorkflowRoute() {
  const { id } = Route.useParams();
  const { data: c, isLoading, error } = usePublishedCase(id);
  const tpls = useQuery({
    queryKey: ["case-templates", id],
    queryFn: () => listTemplatesForCase(id),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28">
        <LoadingState label="Praxisfall wird geladen…" />
      </div>
    );
  }

  if (!c) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28">
        {error ? (
          <ErrorState error={error} />
        ) : (
          <div className="text-center">
            <h1 className="text-xl font-semibold">Praxisfall wurde nicht gefunden.</h1>
            <Link
              to="/faelle"
              className="mt-4 inline-flex items-center gap-2 text-sm text-accent hover:underline"
            >
              <ArrowLeft className="h-4 w-4" /> Zurück zu allen Fällen
            </Link>
          </div>
        )}
      </div>
    );
  }

  const linked = (tpls.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-28 sm:px-6">
      <div className="mb-3">
        <Breadcrumbs
          items={[
            { label: "Praxisfälle", to: "/faelle" },
            { label: c.category, to: "/faelle", search: { cat: c.category } },
            { label: c.title },
            { label: "Dokument erstellen" },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ebene 2 · Dokumentieren
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground sm:text-2xl">
            <FileText className="h-5 w-5 text-accent" /> Dokument zum Fall erstellen
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Praxisfall: <strong>{c.title}</strong>
          </p>
        </div>
        <Link
          to="/faelle/$id"
          params={{ id: c.id }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:border-accent hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Zurück zum Fall
        </Link>
      </div>

      {tpls.isLoading && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Vorlagen werden geladen …
        </div>
      )}

      {!tpls.isLoading && linked.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
          <p className="text-sm text-foreground/85">
            Für diesen Praxisfall ist derzeit noch keine passende Dokumentvorlage hinterlegt.
          </p>
          <div className="mt-3">
            <FeedbackReportDialog
              caseId={c.id}
              caseTitle={c.title}
              reportedArea="lehrer_fallakte"
              variant="compact"
            />
          </div>
        </div>
      )}

      {!tpls.isLoading && linked.length > 0 && (
        <>
          <div className="mb-3 rounded-2xl border border-accent/30 bg-accent/5 p-4 text-xs text-foreground/80">
            <p className="font-medium text-foreground">Datenschutz-Hinweis</p>
            <p className="mt-1">
              Bitte verwenden Sie möglichst keine vollständigen Namen von Schülerinnen und Schülern.
              Nutzen Sie Kürzel oder neutrale Bezeichnungen. Vor Versand fachlich prüfen.
            </p>
          </div>

          <CaseDocumentsPanel caseId={c.id} linkedTemplates={linked} />
        </>
      )}

      <div className="mt-6">
        <Disclaimer />
      </div>
    </div>
  );
}
