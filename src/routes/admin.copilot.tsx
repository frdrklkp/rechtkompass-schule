import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  CopilotAskInput,
  CopilotResponse,
  ExplanationMode,
} from "@/services/legal-copilot";
import { EXPLANATION_MODES } from "@/services/legal-copilot";
import { AnswerFormatter } from "@/services/legal-copilot/AnswerFormatter";

export const Route = createFileRoute("/admin/copilot")({
  head: () => ({
    meta: [
      { title: "Copilot – RechtsKompass Schule" },
      { name: "description", content: "Grounded Legal Copilot: Antworten ausschließlich auf Basis geprüfter Rechtsgrundlagen." },
      { property: "og:title", content: "Grounded Legal Copilot" },
      { property: "og:description", content: "Antworten ausschließlich aus geprüften Rechtsgrundlagen. Keine freie Rechtsberatung." },
    ],
  }),
  component: CopilotPage,
});

const QUICK: Array<{ label: string; question: string }> = [
  { label: "Schüler filmt Lehrkraft", question: "Ein Schüler filmt heimlich eine Lehrkraft im Unterricht. Wie ist rechtlich vorzugehen?" },
  { label: "Diebstahl", question: "In der Klasse wurde etwas gestohlen. Welche Handlungsschritte sind zu beachten?" },
  { label: "Beleidigung", question: "Ein Schüler beleidigt eine Lehrkraft. Welche Maßnahmen sind angemessen?" },
  { label: "Gewalt", question: "Zwischen zwei Schülern kommt es zu einer körperlichen Auseinandersetzung. Was ist zu tun?" },
  { label: "Nachteilsausgleich", question: "Ein Schüler mit LRS beantragt Nachteilsausgleich. Welche Rechtsgrundlagen gelten?" },
  { label: "Datenschutz", question: "Dürfen Klassenfotos auf der Schulwebsite veröffentlicht werden?" },
  { label: "Notengebung", question: "Ein Elternteil widerspricht der Zeugnisnote. Wie ist zu verfahren?" },
  { label: "Aufsichtspflicht", question: "Welche Aufsichtspflichten bestehen bei einer Klassenfahrt?" },
  { label: "Elterngespräch", question: "Muss ein Elterngespräch schriftlich dokumentiert werden?" },
  { label: "Schulpflicht", question: "Ein Schüler kommt wiederholt nicht zur Schule. Welche Schritte sind einzuleiten?" },
];

function pct(x: number): string { return `${Math.round((x ?? 0) * 100)} %`; }

function useAskCopilot() {
  return useMutation({
    mutationFn: async (input: CopilotAskInput): Promise<{ result: CopilotResponse | null; error?: string }> => {
      const res = await fetch("/api/legal-copilot-ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as { result: CopilotResponse | null; error?: string };
      return data;
    },
  });
}

function CopilotPage() {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<ExplanationMode>("standard");
  const [debug, setDebug] = useState(false);
  const [forceMock, setForceMock] = useState(false);
  const [bundesland, setBundesland] = useState("");
  const [schulform, setSchulform] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const ask = useAskCopilot();

  const response = ask.data?.result ?? null;
  const answer = response?.answer ?? null;
  const stats = response?.statistics;

  const filters = useMemo(
    () => ({
      bundesland: bundesland || null,
      schulform: schulform || null,
    }),
    [bundesland, schulform],
  );

  function submit(text?: string) {
    const q = (text ?? question).trim();
    if (!q) return;
    ask.mutate(
      { question: q, sessionId: sessionIdRef.current, mode, debug, forceMock, filters },
      {
        onSuccess: (d) => {
          if (d.result?.sessionId) sessionIdRef.current = d.result.sessionId;
        },
      },
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
    a.download = `copilot-protokoll-${response.sessionId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 p-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Grounded Legal Copilot</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Antworten basieren ausschließlich auf geprüften Rechtsgrundlagen. Der Copilot ergänzt kein eigenes juristisches Wissen und ersetzt keine Rechtsberatung.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="rounded-xl border border-border bg-card p-4 space-y-3"
      >
        <label className="text-sm font-medium">Welche Situation liegt vor?</label>
        <textarea
          className="w-full rounded-md border border-border bg-background p-3 text-sm min-h-[96px]"
          placeholder="Beschreiben Sie die Situation möglichst konkret …"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              type="button"
              key={q.label}
              onClick={() => { setQuestion(q.question); submit(q.question); }}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-muted"
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Modus</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as ExplanationMode)} className="w-full rounded-md border border-border bg-background p-1.5 text-sm">
              {EXPLANATION_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Bundesland</span>
            <input value={bundesland} onChange={(e) => setBundesland(e.target.value)} placeholder="z. B. NRW" className="w-full rounded-md border border-border bg-background p-1.5 text-sm" />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Schulform</span>
            <input value={schulform} onChange={(e) => setSchulform(e.target.value)} placeholder="z. B. Gymnasium" className="w-full rounded-md border border-border bg-background p-1.5 text-sm" />
          </label>
          <div className="flex items-end gap-3 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> Debug</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={forceMock} onChange={(e) => setForceMock(e.target.checked)} /> Mock</label>
          </div>
        </div>
        <div className="flex justify-between items-center pt-2">
          <div className="text-xs text-muted-foreground">Session: {sessionIdRef.current ?? "(neu)"}</div>
          <button type="submit" disabled={ask.isPending || !question.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {ask.isPending ? "Analysiere…" : "Antwort generieren"}
          </button>
        </div>
      </form>

      {ask.data?.error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          Fehler: {ask.data.error}
        </div>
      )}

      {response && answer && (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">Antwort</h2>
                <button onClick={download} className="text-xs rounded-md border border-border px-3 py-1 hover:bg-muted">Protokoll herunterladen</button>
              </div>
              {!answer.answered ? (
                <p className="text-sm">{answer.sections.kurzantwort}</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <Block title="Kurzantwort">{answer.sections.kurzantwort}</Block>
                  <Block title="Einordnung">{answer.sections.einordnung}</Block>
                  {answer.sections.empfohleneHandlung.length > 0 && (
                    <ListBlock title="Empfohlene Handlung" items={answer.sections.empfohleneHandlung} ordered />
                  )}
                  <Block title="Begründung">{answer.sections.begruendung}</Block>
                  {answer.sections.hinweise.length > 0 && <ListBlock title="Hinweise" items={answer.sections.hinweise} />}
                  {answer.sections.unsicherheiten.length > 0 && <ListBlock title="Unsicherheiten" items={answer.sections.unsicherheiten} />}
                  {answer.sections.typischeFehler.length > 0 && <ListBlock title="Typische Fehler" items={answer.sections.typischeFehler} />}
                  {answer.sections.naechsteSchritte.length > 0 && <ListBlock title="Nächste Schritte" items={answer.sections.naechsteSchritte} />}
                </div>
              )}
              <p className="mt-4 text-xs italic text-muted-foreground border-t border-border pt-3">{answer.sections.disclaimer}</p>
            </div>

            {answer.checklist.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-2">Checkliste</h3>
                <ul className="space-y-1 text-sm">
                  {answer.checklist.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <input type="checkbox" /> {c.label}
                      {c.role && <span className="text-xs text-muted-foreground">({c.role})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {answer.followUps.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-2">Rückfragen</h3>
                <ul className="space-y-1 text-sm">
                  {answer.followUps.map((f) => (
                    <li key={f.code} className="text-muted-foreground">• {f.question}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
              <h3 className="font-semibold">Konfidenz</h3>
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${answer.confidence.level === "high" ? "bg-emerald-500" : answer.confidence.level === "medium" ? "bg-amber-500" : "bg-rose-500"}`} />
                <span className="text-xs uppercase">{answer.confidence.level}</span>
                <span className="ml-auto font-medium">{pct(answer.confidence.overall)}</span>
              </div>
              <MiniBar label="Retrieval" value={answer.confidence.retrieval} />
              <MiniBar label="LLM" value={answer.confidence.llm} />
              <MiniBar label="Coverage" value={answer.confidence.sourceCoverage} />
              <MiniBar label="Review" value={answer.confidence.reviewStatus} />
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h3 className="text-sm font-semibold">Rechtsgrundlagen ({answer.citations.length})</h3>
              <ul className="space-y-1 text-xs">
                {answer.citations.map((c) => (
                  <li key={c.chunkId} className="border-b border-border/50 pb-1">
                    <span className="font-medium">{c.display}</span>
                    {c.officialUrl && <a href={c.officialUrl} target="_blank" rel="noreferrer" className="ml-2 text-primary underline">Quelle</a>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 text-xs space-y-1">
              <h3 className="text-sm font-semibold mb-1">Statistik</h3>
              <div>Retrieval: {stats?.retrievalMs} ms</div>
              <div>LLM: {stats?.llmMs} ms</div>
              <div>Gesamt: {stats?.totalMs} ms</div>
              <div>Treffer: {stats?.hits} / genutzt {stats?.usedHits}</div>
              <div>Provider: {stats?.providerId} · {stats?.model}</div>
              <div>Prompt-Version: {answer.promptVersion}</div>
              {stats?.tokens && <div>Tokens: {stats.tokens.totalTokens} · ~${stats.tokens.estimatedCostUsd.toFixed(6)}</div>}
            </div>
          </aside>
        </section>
      )}

      {response?.debug && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Debug (nur Admin)</summary>
          <div className="mt-3 space-y-3 text-xs">
            <div>
              <div className="font-semibold mb-1">System Prompt</div>
              <pre className="whitespace-pre-wrap bg-muted p-2 rounded max-h-40 overflow-auto">{response.debug.systemPrompt}</pre>
            </div>
            <div>
              <div className="font-semibold mb-1">User Prompt</div>
              <pre className="whitespace-pre-wrap bg-muted p-2 rounded max-h-64 overflow-auto">{response.debug.userPrompt}</pre>
            </div>
            <div>
              <div className="font-semibold mb-1">Retrieval Hits</div>
              <ul className="space-y-1">
                {response.debug.retrievalHits.map((h) => (
                  <li key={h.chunkId} className="border border-border/50 rounded p-2">
                    <div className="font-medium">{h.citation}</div>
                    <div className="text-muted-foreground">Score {h.score.toFixed(2)} · Confidence {h.confidence.toFixed(2)}</div>
                    <div className="mt-1">{h.excerpt}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-semibold mb-1">Halluzinationsbericht</div>
              <div>OK: {String(response.debug.hallucinationReport.ok)}</div>
              {response.debug.hallucinationReport.violations.length > 0 && (
                <ul className="list-disc pl-5 text-destructive">
                  {response.debug.hallucinationReport.violations.map((v, i) => <li key={i}>{v}</li>)}
                </ul>
              )}
            </div>
          </div>
        </details>
      )}
    </div>
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

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span>{pct(value)}</span>
      </div>
      <div className="h-1 bg-muted rounded overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </div>
    </div>
  );
}
