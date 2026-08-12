import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  CopilotAskInput,
  CopilotResponse,
  CopilotTrust,
  CopilotTrustSignal,
  CopilotWorkflowRecommendationDto,
  ExplanationMode,
} from "@/services/legal-copilot";
import { AnswerFormatter } from "@/services/legal-copilot/AnswerFormatter";

export const Route = createFileRoute("/kollege")({
  head: () => ({
    meta: [
      { title: "Kollege für Schulrecht – Ihr ruhiger Ratgeber im Schulalltag" },
      {
        name: "description",
        content:
          "Schildern Sie eine Situation aus dem Schulalltag. Sie erhalten eine sachliche Einordnung, konkrete Handlungsschritte und die passenden Rechtsgrundlagen – transparent und nachvollziehbar.",
      },
      { property: "og:title", content: "Kollege für Schulrecht" },
      {
        property: "og:description",
        content: "Ein ruhiger, transparenter Ratgeber für schulrechtliche Situationen. Antworten mit nachvollziehbaren Quellen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KollegePage,
});

const SITUATIONS: Array<{ label: string; question: string }> = [
  { label: "Vorfall im Unterricht", question: "In meinem Unterricht kam es zu einem Vorfall zwischen zwei Schülerinnen. Wie gehe ich richtig vor?" },
  { label: "Beleidigung", question: "Eine Schülerin hat mich beleidigt. Welche Schritte sind angemessen?" },
  { label: "Elterngespräch", question: "Eltern widersprechen einer Note. Wie führe ich das Gespräch und was muss ich dokumentieren?" },
  { label: "Foto / Video", question: "Ein Schüler hat mich heimlich gefilmt. Was ist zu tun?" },
  { label: "Aufsichtspflicht", question: "Ich mache eine Klassenfahrt. Was gilt für die Aufsichtspflicht?" },
  { label: "Fehlende Schulpflicht", question: "Ein Kind kommt wiederholt nicht in die Schule. Wie gehe ich vor?" },
];

function useAskCopilot() {
  return useMutation({
    mutationFn: async (input: CopilotAskInput): Promise<{ result: CopilotResponse | null; error?: string }> => {
      const res = await fetch("/api/legal-copilot-ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      return (await res.json()) as { result: CopilotResponse | null; error?: string };
    },
  });
}

function KollegePage() {
  const [situation, setSituation] = useState("");
  const [mode] = useState<ExplanationMode>("standard");
  const [bundesland, setBundesland] = useState("");
  const [schulform, setSchulform] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const ask = useAskCopilot();

  const filters = useMemo(
    () => ({ bundesland: bundesland || null, schulform: schulform || null }),
    [bundesland, schulform],
  );
  const response = ask.data?.result ?? null;
  const answer = response?.answer ?? null;

  function submit(text?: string) {
    const q = (text ?? situation).trim();
    if (!q) return;
    ask.mutate(
      { question: q, sessionId: sessionIdRef.current, mode, filters },
      { onSuccess: (d) => { if (d.result?.sessionId) sessionIdRef.current = d.result.sessionId; } },
    );
  }

  function download() {
    if (!response || !answer) return;
    const md = AnswerFormatter.toMarkdown({
      question: response.question,
      answer,
      createdAt: response.createdAt,
      sessionId: response.sessionId,
    });
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notiz-schulrecht-${response.sessionId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Ihr Kollege für schulrechtliche Fragen</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Beschreiben Sie eine Situation aus Ihrem Schulalltag. Sie erhalten eine sachliche Einordnung,
          konkrete Handlungsschritte und die passenden Rechtsgrundlagen. Jede Empfehlung ist nachvollziehbar
          begründet – ohne Fachchinesisch, ohne Blackbox.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4"
      >
        <label className="text-sm font-medium">Um welche Situation geht es?</label>
        <textarea
          className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[112px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="Zum Beispiel: Zwei Schülerinnen sind im Unterricht aneinandergeraten. Wie gehe ich vor?"
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
        />

        <div>
          <div className="text-xs text-muted-foreground mb-2">Häufige Situationen aus dem Schulalltag:</div>
          <div className="flex flex-wrap gap-2">
            {SITUATIONS.map((s) => (
              <button
                type="button"
                key={s.label}
                onClick={() => { setSituation(s.question); submit(s.question); }}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Bundesland (optional)</span>
            <input
              value={bundesland}
              onChange={(e) => setBundesland(e.target.value)}
              placeholder="z. B. Nordrhein-Westfalen"
              className="w-full rounded-md border border-border bg-background p-1.5 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Schulform (optional)</span>
            <input
              value={schulform}
              onChange={(e) => setSchulform(e.target.value)}
              placeholder="z. B. Gymnasium"
              className="w-full rounded-md border border-border bg-background p-1.5 text-sm"
            />
          </label>
          <div className="flex items-end justify-end">
            <button
              type="submit"
              disabled={ask.isPending || !situation.trim()}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {ask.isPending ? "Einen Moment …" : "Situation einordnen"}
            </button>
          </div>
        </div>
      </form>

      {ask.data?.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Diese Frage konnte gerade nicht beantwortet werden. Bitte versuchen Sie es erneut oder formulieren Sie die Situation etwas anders.
        </div>
      )}

      {response && answer && (
        <div className="space-y-6">
          {response.trust && <TrustCard trust={response.trust} />}

          <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Einschätzung</h2>
              <button onClick={download} className="text-xs rounded-md border border-border px-3 py-1 hover:bg-muted">
                Notiz herunterladen
              </button>
            </div>

            {!answer.answered ? (
              <p className="text-sm text-muted-foreground">
                {answer.sections.kurzantwort} Bitte formulieren Sie die Situation gerne noch etwas konkreter,
                damit die passenden Rechtsgrundlagen zuverlässig gefunden werden können.
              </p>
            ) : (
              <div className="space-y-4 text-sm leading-relaxed">
                <Block title="Kurz gesagt">{answer.sections.kurzantwort}</Block>
                <Block title="Was hier rechtlich zu beachten ist">{answer.sections.einordnung}</Block>
                {answer.sections.empfohleneHandlung.length > 0 && (
                  <ListBlock title="So können Sie vorgehen" items={answer.sections.empfohleneHandlung} ordered />
                )}
                <Block title="Warum diese Einschätzung?">{answer.sections.begruendung}</Block>
                {answer.sections.hinweise.length > 0 && <ListBlock title="Hinweise" items={answer.sections.hinweise} />}
                {answer.sections.typischeFehler.length > 0 && <ListBlock title="Bitte vermeiden Sie" items={answer.sections.typischeFehler} />}
                {answer.sections.naechsteSchritte.length > 0 && <ListBlock title="Nächste Schritte" items={answer.sections.naechsteSchritte} />}
                {answer.sections.unsicherheiten.length > 0 && <ListBlock title="Wo noch Klärungsbedarf besteht" items={answer.sections.unsicherheiten} />}
              </div>
            )}

            <p className="text-xs italic text-muted-foreground border-t border-border pt-3">
              {answer.sections.disclaimer}
            </p>
          </section>

          {answer.checklist.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-2">Ihre Checkliste</h3>
              <ul className="space-y-1 text-sm">
                {answer.checklist.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <input type="checkbox" /> {c.label}
                    {c.role && <span className="text-xs text-muted-foreground">({c.role})</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {response.templates && response.templates.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Vorlagen, die hier passen könnten</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Diese Vorlagen werden Ihnen vorgeschlagen – noch nichts wird automatisch erstellt.
              </p>
              <ul className="grid gap-3 md:grid-cols-2">
                {response.templates.map((t) => (
                  <li key={t.id} className="rounded-lg border border-border p-3">
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Warum vorgeschlagen: </span>{t.reason}
                    </div>
                    {t.refIds.length > 0 && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Bezug zu: {t.refIds.join(", ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {response.workflows && response.workflows.length > 0 && (
            <WorkflowRecommendationsSection
              workflows={response.workflows}
              sessionId={response.sessionId}
            />
          )}



          {answer.citations.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Rechtsgrundlagen ({answer.citations.length})</h3>
              <ul className="space-y-2 text-sm">
                {answer.citations.map((c) => (
                  <li key={c.chunkId} className="flex items-start gap-2 border-b border-border/50 pb-2 last:border-0">
                    <span className="mt-0.5 text-xs rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">
                      R
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">{c.display}</div>
                      {c.sourceLabel && <div className="text-xs text-muted-foreground">{c.sourceLabel}</div>}
                    </div>
                    {c.officialUrl && (
                      <a href={c.officialUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                        Zur Quelle
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {answer.followUps.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-2">Kurze Rückfragen an Sie</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {answer.followUps.map((f) => (
                  <li key={f.code}>• {f.question}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TrustCard({ trust }: { trust: CopilotTrust }) {
  const dot = (level: "green" | "yellow" | "red") =>
    level === "green" ? "bg-emerald-500" : level === "yellow" ? "bg-amber-500" : "bg-rose-500";
  const badge =
    trust.level === "green" ? "border-emerald-500/40 bg-emerald-500/5" :
    trust.level === "yellow" ? "border-amber-500/40 bg-amber-500/5" :
    "border-rose-500/40 bg-rose-500/5";
  return (
    <section className={`rounded-2xl border p-5 ${badge}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot(trust.level)}`} />
        <h3 className="text-sm font-semibold">Wie belastbar ist diese Antwort?</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{trust.summary}</p>
      <ul className="grid gap-2 md:grid-cols-5">
        {trust.signals.map((s: CopilotTrustSignal) => (
          <li key={s.key} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block h-2 w-2 rounded-full ${dot(s.level)}`} />
              <span className="text-xs font-medium">{s.label}</span>
            </div>
            <div className="text-sm">{s.value}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{s.hint}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ListBlock({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <List className={`mt-1 ${ordered ? "list-decimal" : "list-disc"} pl-5 space-y-0.5`}>
        {items.map((i, idx) => <li key={idx}>{i}</li>)}
      </List>
    </div>
  );
}

function trackWorkflowEvent(event: "workflow_opened" | "workflow_started_from_ai", sessionId: string, templateId: string) {
  try {
    void fetch("/api/copilot-track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, sessionId, detail: { templateId } }),
      keepalive: true,
    });
  } catch {
    /* Telemetrie ist best-effort */
  }
}

function WorkflowRecommendationsSection({
  workflows,
  sessionId,
}: {
  workflows: CopilotWorkflowRecommendationDto[];
  sessionId: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Passende Handlungsleitfäden</h3>
        <span className="text-xs text-muted-foreground">nur Vorschläge – nichts wird automatisch gestartet</span>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {workflows.map((w) => (
          <li key={w.templateId} className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm">{w.title}</div>
                {w.subtitle && <div className="text-xs text-muted-foreground">{w.subtitle}</div>}
              </div>
              <span
                className="text-[11px] rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground shrink-0"
                title="Relevanz relativ zur besten Empfehlung"
              >
                {Math.round(w.relevance * 100)}%
              </span>
            </div>
            {w.description && (
              <p className="text-xs text-muted-foreground line-clamp-3">{w.description}</p>
            )}
            <div className="text-xs">
              <span className="text-muted-foreground">Warum vorgeschlagen: </span>
              {w.reason}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{w.phaseCount} Phasen</span>
              <span>{w.stepCount} Schritte</span>
              {w.estimatedMinutes > 0 && <span>ca. {w.estimatedMinutes} Min</span>}
              {w.matchedRefIds.length > 0 && (
                <span>Bezug: {w.matchedRefIds.join(", ")}</span>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Link
                to="/workflows/$templateId"
                params={{ templateId: w.templateId }}
                onClick={() => trackWorkflowEvent("workflow_opened", sessionId, w.templateId)}
                className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted"
              >
                Leitfaden öffnen
              </Link>
              <Link
                to="/workflows/$templateId"
                params={{ templateId: w.templateId }}
                search={{ action: "start" }}
                onClick={() => trackWorkflowEvent("workflow_started_from_ai", sessionId, w.templateId)}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              >
                Workflow starten
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
