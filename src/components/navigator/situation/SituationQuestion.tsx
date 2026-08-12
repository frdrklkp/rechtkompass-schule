/** Sprint 4.6B – Darstellung einer einzelnen Situationsfrage. */
import { HelpCircle, MinusCircle } from "lucide-react";
import { SituationBooleanInput } from "./SituationBooleanInput";
import { SituationChoiceInput } from "./SituationChoiceInput";
import { SituationTextInput } from "./SituationTextInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  SituationAnswer,
  SituationAnswerValue,
  SituationQuestionDefinition,
} from "@/services/situation-analyzer";

export interface SituationQuestionProps {
  question: SituationQuestionDefinition;
  required: boolean;
  answer?: SituationAnswer;
  errorMessage?: string;
  onAnswer: (value: SituationAnswerValue) => void;
  onUnknown: () => void;
  onNotApplicable: () => void;
  children?: React.ReactNode;
}

const STATUS_TEXT: Record<string, string> = {
  answered: "beantwortet",
  unknown: "als unbekannt markiert",
  notApplicable: "als nicht zutreffend markiert",
  notAnswered: "noch offen",
};

export function SituationQuestion({
  question,
  required,
  answer,
  errorMessage,
  onAnswer,
  onUnknown,
  onNotApplicable,
  children,
}: SituationQuestionProps) {
  const inputId = `q-${question.id}`;
  const descId = question.description ? `${inputId}-desc` : undefined;
  const errId = errorMessage ? `${inputId}-err` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(" ") || undefined;
  const status = answer?.answerStatus ?? "notAnswered";
  const rawValue = status === "answered" ? (answer?.value ?? null) : null;

  const renderInput = () => {
    if (children) return children;
    switch (question.type) {
      case "boolean":
        return (
          <SituationBooleanInput
            id={inputId}
            value={typeof rawValue === "boolean" ? rawValue : null}
            describedBy={describedBy}
            onChange={onAnswer}
          />
        );
      case "singleChoice":
      case "multiChoice":
        return (
          <SituationChoiceInput
            id={inputId}
            multiple={question.type === "multiChoice"}
            options={question.options ?? []}
            value={
              Array.isArray(rawValue)
                ? rawValue.filter((v): v is string => typeof v === "string")
                : typeof rawValue === "string"
                  ? rawValue
                  : null
            }
            describedBy={describedBy}
            onChange={onAnswer}
          />
        );
      case "date":
      case "time":
      case "dateTime":
        return (
          <SituationTextInput
            id={inputId}
            type={question.type === "date" ? "date" : question.type === "time" ? "time" : "datetime-local"}
            value={typeof rawValue === "string" ? rawValue : ""}
            describedBy={describedBy}
            invalid={Boolean(errorMessage)}
            onChange={onAnswer}
          />
        );
      case "textarea":
        return (
          <SituationTextInput
            id={inputId}
            multiline
            value={typeof rawValue === "string" ? rawValue : ""}
            describedBy={describedBy}
            invalid={Boolean(errorMessage)}
            onChange={onAnswer}
          />
        );
      case "information":
        return null;
      default:
        return (
          <SituationTextInput
            id={inputId}
            value={typeof rawValue === "string" ? rawValue : ""}
            describedBy={describedBy}
            invalid={Boolean(errorMessage)}
            onChange={onAnswer}
          />
        );
    }
  };

  const isInformation = question.type === "information";

  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <Label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {question.title}
          {required && (
            <span className="ml-1 text-destructive" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (Pflichtangabe)</span>}
        </Label>
        {!isInformation && (
          <span className="text-xs text-muted-foreground">{STATUS_TEXT[status]}</span>
        )}
      </div>
      {question.description && (
        <p id={descId} className="text-xs text-muted-foreground">
          {question.description}
        </p>
      )}
      {renderInput()}
      {errorMessage && (
        <p id={errId} role="alert" className="text-xs font-medium text-destructive">
          {errorMessage}
        </p>
      )}
      {!isInformation && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant={status === "unknown" ? "secondary" : "ghost"}
            className="gap-1.5 text-xs"
            aria-pressed={status === "unknown"}
            onClick={onUnknown}
          >
            <HelpCircle className="h-3.5 w-3.5" /> Angabe unbekannt
          </Button>
          <Button
            type="button"
            size="sm"
            variant={status === "notApplicable" ? "secondary" : "ghost"}
            className="gap-1.5 text-xs"
            aria-pressed={status === "notApplicable"}
            onClick={onNotApplicable}
          >
            <MinusCircle className="h-3.5 w-3.5" /> Nicht zutreffend
          </Button>
        </div>
      )}
    </div>
  );
}
