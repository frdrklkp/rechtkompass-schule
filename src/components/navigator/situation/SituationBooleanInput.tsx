/** Sprint 4.6B – Ja/Nein-Eingabe für Situationsfragen. */
import { Button } from "@/components/ui/button";

export interface SituationBooleanInputProps {
  id: string;
  value: boolean | null;
  describedBy?: string;
  onChange: (value: boolean) => void;
}

export function SituationBooleanInput({
  id,
  value,
  describedBy,
  onChange,
}: SituationBooleanInputProps) {
  return (
    <div id={id} role="group" aria-describedby={describedBy} className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant={value === true ? "default" : "outline"}
        aria-pressed={value === true}
        onClick={() => onChange(true)}
      >
        Ja
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === false ? "default" : "outline"}
        aria-pressed={value === false}
        onClick={() => onChange(false)}
      >
        Nein
      </Button>
    </div>
  );
}
