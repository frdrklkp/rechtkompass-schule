// CaseCopilotDialog – fallbezogene Rückfragen für Lehrkräfte auf der
// Falldetailseite. Erste Ausbaustufe (Nutzer-Auftrag 29.09.2026): nutzt die
// bestehende Grounded-Copilot-Pipeline über POST /api/legal-copilot-ask und
// reicht den Fall als caseContext mit; Antworten bleiben ausschließlich
// retrieval-gestützt (kein KI-eigenes Wissen, Zitate nur aus der
// Wissensbasis). Sitzungsverlauf lebt nur in dieser Dialog-Session
// (InMemory-Repository serverseitig, State clientseitig) – Persistenz ist
// bewusst noch nicht Teil dieser Ausbaustufe.
import { useRef, useState } from "react";
import { Loader2, MessageCircleQuestion, Send, ShieldQuestion } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { CopilotCaseContext, CopilotProgressEvent, CopilotResponse } from "@/services/legal-copilot/types";
import { readCopilotResponse, stageLabel } from "@/services/legal-copilot/progressStream";

type Props = {
  caseContext: CopilotCaseContext;
  /**
   * Quellen der am Fall verknüpften Rechtsgrundlagen. Schränkt das Retrieval
   * auf die einschlägigen Gesetze ein - deutlich schneller und relevanter als
   * eine Suche über den gesamten Normenbestand.
   */
  sourceIds?: string[];
  triggerClassName?: string;
};

type Turn =
  | { kind: "question"; text: string }
  | { kind: "answer"; response: CopilotResponse }
  | { kind: "error"; text: string };

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  low: "bg-danger/15 text-danger",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "Hohe Quellendeckung",
  medium: "Mittlere Quellendeckung",
  low: "Geringe Quellendeckung",
};

export function CaseCopilotDialog({ caseContext, sourceIds, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<CopilotProgressEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = question.trim().length >= 5 && !pending;

  async function send(text?: string) {
    const q = (text ?? question).trim();
    if (q.length < 5 || pending) return;
    setPending(true);
    setQuestion("");
    setTurns((prev) => [...prev, { kind: "question", text: q }]);
    try {
      // Die Route ist auth-pflichtig (nutzergebundene Konversations-Persistenz).
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Bitte melden Sie sich an, um Rückfragen zu stellen.");
      }
      const res = await fetch("/api/legal-copilot-ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Gestufte Rückmeldung: Phasen-Ereignisse, Ergebnis erst nach der Prüfung.
          Accept: "text/event-stream",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          question: q,
          sessionId,
          caseContext,
          filters: sourceIds && sourceIds.length > 0 ? { sourceIds } : undefined,
        }),
      });
      const payload = await readCopilotResponse(res, (e) => setStage(e));
      if (!payload.result) {
        throw new Error(payload.error ?? "Der Copilot konnte die Frage nicht verarbeiten.");
      }
      setSessionId(payload.result.sessionId);
      setTurns((prev) => [...prev, { kind: "answer", response: payload.result! }]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          kind: "error",
          text: err instanceof Error ? err.message : "Unbekannter Fehler beim Copilot-Aufruf.",
        },
      ]);
    } finally {
      setPending(false);
      setStage(null);
      // Nach dem Rendern ans Ende scrollen, damit die neue Antwort sichtbar ist.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-accent"
        }
      >
        <MessageCircleQuestion className="h-3.5 w-3.5" />
        Rückfrage stellen
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageCircleQuestion className="h-4 w-4 text-accent" />
              Rückfrage zu diesem Fall
            </DialogTitle>
            <DialogDescription className="text-xs">
              Antworten stützen sich ausschließlich auf die geprüfte Rechtsdatenbank und ersetzen
              keine Rechtsberatung im Einzelfall.
            </DialogDescription>
          </DialogHeader>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {turns.length === 0 && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1 font-semibold text-foreground">
                  <ShieldQuestion className="h-3.5 w-3.5" /> Beispiele
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Was bedeutet dieser Fall konkret für meine Rolle als Lehrkraft?</li>
                  <li>Welche Fristen muss ich hier beachten?</li>
                  <li>Was mache ich, wenn die Beteiligten nicht mitwirken?</li>
                </ul>
              </div>
            )}

            {turns.map((t, i) => {
              if (t.kind === "question") {
                return (
                  <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-accent/10 p-3 text-sm">
                    {t.text}
                  </div>
                );
              }
              if (t.kind === "error") {
                return (
                  <div key={i} className="mr-8 rounded-2xl border border-danger/40 bg-danger/5 p-3 text-xs text-foreground">
                    {t.text}
                  </div>
                );
              }
              return <AnswerCard key={i} response={t.response} onFollowUp={(q) => void send(q)} />;
            })}

            {pending && (
              <div className="mr-8 flex items-center gap-2 rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground" aria-live="polite">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {stageLabel(stage)}
              </div>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-border pt-3">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ihre Rückfrage zu diesem Fall…"
              rows={2}
              className="min-h-[44px] flex-1 resize-none text-sm"
            />
            <Button size="sm" disabled={!canSend} onClick={() => void send()} aria-label="Frage senden">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Bitte keine Namen oder andere personenbezogene Angaben zu Schülerinnen, Schülern oder Kolleginnen und Kollegen eingeben. Ihre Rückfragen werden Ihrem Konto zugeordnet gespeichert.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnswerCard({
  response,
  onFollowUp,
}: {
  response: CopilotResponse;
  onFollowUp: (question: string) => void;
}) {
  const a = response.answer;
  const conf = a.confidence?.level ?? "low";

  if (!a.answered) {
    return (
      <div className="mr-8 space-y-2 rounded-2xl border border-warning/50 bg-warning/5 p-3 text-sm">
        <p className="text-xs font-semibold text-foreground">Keine belegbare Antwort möglich</p>
        <p className="text-xs text-muted-foreground">
          {a.reasonUnanswered ??
            "Zu dieser Frage wurde keine ausreichende Rechtsgrundlage in der Wissensbasis gefunden."}
        </p>
        <p className="text-xs text-muted-foreground">
          Tipp: Formulieren Sie die Frage konkreter – oder melden Sie sie über „Problem melden“ an
          die Redaktion, damit der Fall ergänzt werden kann.
        </p>
      </div>
    );
  }

  return (
    <div className="mr-8 space-y-2.5 rounded-2xl border border-border bg-card p-3.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONFIDENCE_STYLE[conf] ?? CONFIDENCE_STYLE.low}`}>
          {CONFIDENCE_LABEL[conf] ?? CONFIDENCE_LABEL.low}
        </span>
      </div>

      <p className="font-medium text-foreground">{a.sections.kurzantwort}</p>
      {a.sections.einordnung && <p className="text-xs text-muted-foreground">{a.sections.einordnung}</p>}

      {a.sections.empfohleneHandlung.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Empfohlenes Vorgehen
          </p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs">
            {a.sections.empfohleneHandlung.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      {a.sections.begruendung && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Begründung</p>
          <p className="mt-1 text-xs">{a.sections.begruendung}</p>
        </div>
      )}

      {a.citations.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Quellen</p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
            {a.citations.map((cit, i) => (
              <li key={i}>{cit.display}</li>
            ))}
          </ul>
        </div>
      )}

      {a.sections.unsicherheiten.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unsicherheiten
          </p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px]">
            {a.sections.unsicherheiten.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {a.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {a.followUps.slice(0, 3).map((f) => (
            <button
              key={f.code}
              type="button"
              onClick={() => onFollowUp(f.question)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-accent"
            >
              {f.question}
            </button>
          ))}
        </div>
      )}

      <p className="border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
        {a.sections.disclaimer}
      </p>
    </div>
  );
}
