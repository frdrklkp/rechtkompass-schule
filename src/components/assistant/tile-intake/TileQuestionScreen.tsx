/**
 * Tier 3 – generischer Ein-Frage-Bildschirm. Rendert je nach Fragetyp
 * Kacheln (boolean/singleChoice) oder ein kurzes Eingabefeld (text/
 * textarea/date). Kachel-Stil identisch zu QuestionView im Kurz-Check
 * (src/components/DecisionAssistant.tsx, dort nur als Vorlage gelesen).
 */
import { useState } from "react";
import { ArrowRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SituationAnswerValue } from "@/services/situation-analyzer";
import type { TileSequenceStep } from "@/services/assistant/tile-intake";
import { TileStepFrame } from "./TileStepFrame";

export interface TileQuestionScreenProps {
  step: TileSequenceStep;
  progress: { index: number; total: number };
  onAnswer: (value: SituationAnswerValue) => void;
  onUnknown: () => void;
  onBack: () => void;
  canGoBack: boolean;
}

const TILE_CLASS =
  "group flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5 text-left text-sm text-foreground transition-all hover:border-accent hover:bg-accent/5";

export function TileQuestionScreen({
  step,
  progress,
  onAnswer,
  onUnknown,
  onBack,
  canGoBack,
}: TileQuestionScreenProps) {
  const [draft, setDraft] = useState("");
  const [multiDraft, setMultiDraft] = useState<string[]>([]);

  const isTextEntry =
    step.kind === "text" || step.kind === "textarea" || step.kind === "date" || step.kind === "time";

  return (
    <TileStepFrame title={step.title} help={step.help} progress={progress} onBack={onBack} canGoBack={canGoBack}>
      {step.kind === "boolean" && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => onAnswer(true)} className={TILE_CLASS}>
            <span className="font-medium">Ja</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
          </button>
          <button type="button" onClick={() => onAnswer(false)} className={TILE_CLASS}>
            <span className="font-medium">Nein</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
          </button>
        </div>
      )}

      {step.kind === "singleChoice" && (
        <div className="flex flex-col gap-2">
          {(step.options ?? []).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onAnswer(opt.value)}
              className={TILE_CLASS}
            >
              <span className="font-medium">{opt.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
            </button>
          ))}
        </div>
      )}

      {step.kind === "multiChoice" && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2">
            {(step.options ?? []).map((opt) => {
              const selected = multiDraft.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setMultiDraft((prev) =>
                      selected ? prev.filter((v) => v !== opt.value) : [...prev, opt.value],
                    )
                  }
                  className={`${TILE_CLASS} ${selected ? "border-accent bg-accent/10" : ""}`}
                >
                  <span className="font-medium">{opt.label}</span>
                  {selected && <span className="text-xs font-semibold text-accent">Ausgewählt</span>}
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            onClick={() => {
              onAnswer(multiDraft);
              setMultiDraft([]);
            }}
            disabled={multiDraft.length === 0}
            className="gap-2"
          >
            Weiter <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isTextEntry && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draft.trim();
            if (!trimmed) return;
            onAnswer(trimmed);
            setDraft("");
          }}
        >
          {step.kind === "textarea" ? (
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder="Antwort eingeben …"
            />
          ) : (
            <Input
              autoFocus
              type={step.kind === "date" ? "date" : step.kind === "time" ? "time" : "text"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={step.kind === "date" || step.kind === "time" ? undefined : "Antwort eingeben …"}
            />
          )}
          <Button type="submit" disabled={!draft.trim()} className="gap-2">
            Weiter <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      )}

      <button
        type="button"
        onClick={onUnknown}
        className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-accent"
      >
        <HelpCircle className="h-3.5 w-3.5" /> Weiß ich nicht
      </button>
    </TileStepFrame>
  );
}
