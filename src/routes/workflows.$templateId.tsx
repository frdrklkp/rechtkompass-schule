import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ListChecks, Loader2, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStartSession, useWorkflowTemplate } from "@/hooks/workflow/useWorkflowRuntime";

export const Route = createFileRoute("/workflows/$templateId")({
  head: ({ params }) => ({
    meta: [
      { title: `Leitfaden – ${params.templateId.slice(0, 8)}` },
      { name: "description", content: "Vorschau und Start eines schulrechtlichen Handlungsleitfadens." },
    ],
  }),
  component: WorkflowDetail,
});

function WorkflowDetail() {
  const { templateId } = Route.useParams();
  const tpl = useWorkflowTemplate(templateId);
  const start = useStartSession();
  const navigate = useNavigate();

  if (tpl.isLoading) {
    return (
      <main className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-16 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Leitfaden wird geladen …
      </main>
    );
  }
  if (!tpl.data) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16">
        <p className="text-destructive">Leitfaden nicht gefunden.</p>
        <Button asChild variant="link" className="mt-4">
          <Link to="/workflows">Zurück zur Übersicht</Link>
        </Button>
      </main>
    );
  }

  const template = tpl.data;
  const stepTotal = template.phases.reduce((n, p) => n + p.steps.length, 0);

  const onStart = async () => {
    const res = await start.mutateAsync({ templateId: template.id });
    void navigate({ to: "/workflows/session/$sessionId", params: { sessionId: res.session.id } });
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/workflows"><ArrowLeft className="mr-2 h-4 w-4" /> Alle Leitfäden</Link>
      </Button>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {template.publicationTier === "public" ? "Öffentlich" : "Intern"}
          </Badge>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{template.title}</h1>
        {template.subtitle && <p className="mt-1 text-muted-foreground">{template.subtitle}</p>}
        {template.description && <p className="mt-4 text-sm leading-relaxed">{template.description}</p>}
      </header>

      <div className="mb-6 flex items-center gap-2">
        <Button size="lg" onClick={onStart} disabled={start.isPending}>
          {start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
          Diesen Leitfaden starten
        </Button>
        <span className="text-sm text-muted-foreground">{template.phases.length} Phasen · {stepTotal} Schritte</span>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Ablauf</h2>
        {template.phases.map((phase, i) => (
          <Card key={phase.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                {phase.title}
              </CardTitle>
              {phase.description && (
                <p className="text-sm text-muted-foreground">{phase.description}</p>
              )}
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {phase.steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-sm">
                    <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium">{s.title}</div>
                      {s.description && (
                        <div className="text-xs text-muted-foreground">{s.description}</div>
                      )}
                    </div>
                    {!s.isRequired && (
                      <Badge variant="outline" className="ml-auto text-xs">Optional</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
