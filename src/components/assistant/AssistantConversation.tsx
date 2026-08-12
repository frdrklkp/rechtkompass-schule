/**
 * Sprint 4.6F – Verlauf der Bearbeitung.
 * Reine Darstellung der bereits erfolgten Schritte.
 */
import { MessageSquare } from "lucide-react";
import {
  ASSISTANT_PHASE_LABELS,
  type AssistantSession,
} from "@/services/assistant";

export interface AssistantConversationProps {
  session: AssistantSession;
}

export function AssistantConversation({ session }: AssistantConversationProps) {
  const turns: { label: string; text: string }[] = [
    {
      label: "Ihre Schilderung",
      text: session.description,
    },
  ];

  if (session.analysis) {
    turns.push({
      label: "Strukturierung",
      text: `${session.analysis.findings.length} Angabe(n) übernommen, ${session.analysis.openAspects.length} Aspekt(e) offen.`,
    });
  }
  if (session.matchResult) {
    turns.push({
      label: "Abgleich",
      text: `${session.matchResult.matches.length} Treffer aus ${session.matchResult.stats.evaluated} Praxisfällen.`,
    });
  }
  if (session.answeredQuestionIds.length > 0) {
    turns.push({
      label: "Rückfragen",
      text: `${session.answeredQuestionIds.length} Rückfrage(n) beantwortet.`,
    });
  }
  if (session.handoffAt) {
    turns.push({
      label: "Übergabe",
      text: `An den Navigator übergeben am ${new Date(session.handoffAt).toLocaleString("de-DE")}.`,
    });
  }

  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        <MessageSquare className="mr-1 inline h-4 w-4 text-accent" aria-hidden="true" />
        Verlauf der Bearbeitung ({ASSISTANT_PHASE_LABELS[session.phase]})
      </summary>
      <ol className="mt-3 space-y-2">
        {turns.map((t) => (
          <li key={t.label} className="rounded-xl border border-border bg-background p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t.label}
            </p>
            <p className="mt-0.5 text-xs text-foreground">{t.text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Begonnen am {new Date(session.startedAt).toLocaleString("de-DE")}.
      </p>
    </details>
  );
}
