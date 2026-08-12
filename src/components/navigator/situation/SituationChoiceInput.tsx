/** Sprint 4.6B – Auswahl-Eingaben (einfach und mehrfach) für Situationsfragen. */
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { SituationQuestionOption } from "@/services/situation-analyzer";

export interface SituationChoiceInputProps {
  id: string;
  options: SituationQuestionOption[];
  multiple: boolean;
  value: string | string[] | null;
  describedBy?: string;
  onChange: (value: string | string[]) => void;
}

export function SituationChoiceInput({
  id,
  options,
  multiple,
  value,
  describedBy,
  onChange,
}: SituationChoiceInputProps) {
  if (multiple) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div id={id} role="group" aria-describedby={describedBy} className="space-y-2">
        {options.map((option) => {
          const checkboxId = `${id}-${option.value}`;
          const checked = selected.includes(option.value);
          return (
            <div key={option.value} className="flex items-start gap-2">
              <Checkbox
                id={checkboxId}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(
                    next === true
                      ? [...selected, option.value]
                      : selected.filter((v) => v !== option.value),
                  )
                }
              />
              <Label htmlFor={checkboxId} className="text-sm font-normal leading-5">
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
    );
  }

  const current = typeof value === "string" ? value : null;
  return (
    <div id={id} role="group" aria-describedby={describedBy} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={current === option.value ? "default" : "outline"}
          aria-pressed={current === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
