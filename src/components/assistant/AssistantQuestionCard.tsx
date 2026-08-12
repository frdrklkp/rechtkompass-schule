/**
 * Sprint 4.6F – Gezielte Rückfrage.
 * Antworten fließen unmittelbar in den Sachverhalt zurück.
 */
import { useState } from "react";
import { HelpCircle } from "lucide-react";
import type { AssistantQuestion } from "@/services/assistant";
import type { SituationAnswerValue } from "@/services/situation-analyzer";

export interface AssistantQuestionCardProps {
  question: AssistantQuestion;
  onAnswer: (value: SituationAnswerValue) => void;
  onUnknown: () => void;
}

export function AssistantQuestionCard({
  question,
  onAnswer,
  onUnknown,
}: AssistantQuestionCardProps) {
  const [text, setText] = useState("");

  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <HelpCircle className="h-4 w-4 text-accent" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">{question.title}</h3>
        {question.required && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            Pflichtangabe
          </span>
        )}
      </div>
      {question.help && <p className="mt-1 text-xs text-muted-foreground">{question.help}</p>}
      <p className="mt-1 text-[11px] text-muted-foreground">Grund der Rückfrage: {question.reason}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {question.kind === "boolean" && (
          <>
            <button
              type="button"
              onClick={() => onAnswer(true)}
              className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground"
            >
              Ja
            </button>
            <button
              type="button"
              onClick={() => onAnswer(false)}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:border-accent"
            >
              Nein
            </button>
          </>
        )}

        {question.kind === "singleChoice" &&
          (question.options ?? []).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onAnswer(o.value)}
              className="rounded-xl border border-border px-3 py-2 text-xs font-medium hover:border-accent"
            >
              {o.label}
            </button>
          ))}

        {question.kind === "text" && (
          <form
            className="flex w-full flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim().length === 0) return;
              onAnswer(text.trim());
              setText("");
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Antwort eingeben"
              className="min-w-[12rem] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={text.trim().length === 0}
              className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              Übernehmen
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onUnknown}
          className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-accent"
        >
          Weiß ich nicht
        </button>
      </div>
    </article>
  );
}
